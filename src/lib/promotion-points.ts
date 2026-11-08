import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import {workspaceUnits} from './workspace-scope';
import {accessibleUnits} from './unit-page';
import {commonPromotionTasks,promotionRankName,promotionStep} from './promotion-rules';
import type {Viewer} from './domain';

type Task={id:string;name:string;points:number;unitId:string|null;requirements?:string;archived?:boolean};
type Credit={id:string;reportId?:string;order?:number;userId:string;name:string;unitId:string;rank:number;cycle:string;taskId:string;title:string;rate:number;quantity:number;links:string[];status:'pending'|'approved'|'rejected'|'clarification';reason?:string;createdAt:string};
const common:Task[]=commonPromotionTasks.map(([id,name,points])=>({id,name,points,unitId:null}));
function mergeTasks(saved:Task[]){
 return [...new Map([...common,...saved].map(task=>[task.id,task])).values()];
}
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('task'),id:z.string().min(1).max(50).optional(),unitId:z.uuid().nullable(),name:z.string().trim().min(3).max(120),points:z.number().int().min(1).max(1000),requirements:z.string().trim().max(1000).optional()}),
 z.object({kind:z.literal('archive'),id:z.uuid()}),
 z.object({kind:z.literal('submit'),taskId:z.string().min(1).max(50),quantity:z.number().int().min(1).max(100),links:z.array(evidence).min(1).max(20)}),
 z.object({kind:z.literal('submit-report'),entries:z.array(z.object({taskId:z.string().min(1).max(50),quantity:z.number().int().min(1).max(100),links:z.array(evidence).min(1).max(20)})).min(1).max(50)}),
 z.object({kind:z.literal('clarify'),id:z.uuid(),links:z.array(evidence).min(1).max(20)}),
 z.object({kind:z.literal('review'),id:z.uuid(),approve:z.boolean(),clarification:z.boolean().optional(),quantity:z.number().int().min(1).max(100).optional(),reason:z.string().trim().min(5).max(2000)}),
 z.object({kind:z.literal('bonus'),userId:z.string().min(1).max(100),points:z.number().int().min(1).max(1000),reason:z.string().trim().min(5).max(2000),links:z.array(evidence).min(1).max(20)}),
]);
type Profile={id:string;unit_id:string;rank:number;rank_name:string;name:string;cycle:string};
const profileSql=`SELECT p.id,p.unit_id,p.rank,k.name AS rank_name,p.first_name||' '||p.last_name AS name,
 coalesce((SELECT a.id::text FROM audit_logs a WHERE a.entity_id=p.id::text AND (
  (a.action='personnel.record' AND a.after->>'action' IN ('promote','demote','admit')) OR
  (a.action='unit.assignment' AND a.before->>'rank' IS DISTINCT FROM a.after->>'rank') OR
  (a.action='personnel.assign' AND a.before#>>'{profile,rank}' IS DISTINCT FROM a.after->>'rank') OR
  (a.action='personnel.save' AND a.before->>'rank' IS DISTINCT FROM a.after->>'rank')
 ) ORDER BY a.created_at DESC,a.id DESC LIMIT 1),'initial') AS cycle
 FROM personnel p JOIN ranks k ON k.id=p.rank JOIN units u ON u.id=p.unit_id AND u.active
 WHERE p.user_id=$1 AND p.active`;

export async function promotionProgress(userId:string,c?:PoolClient){
 const [profile]=c?(await c.query<Profile>(profileSql,[userId])).rows:await query<Profile>(profileSql,[userId]);
 if(!profile)return {profile:null,points:0,creditIds:[] as string[],step:undefined};
 const sql=`SELECT coalesce(sum((value->>'rate')::int*(value->>'quantity')::int),0)::float8 AS points,coalesce(array_agg(value->>'id'),ARRAY[]::text[]) AS ids FROM settings
  WHERE key LIKE 'promotion-credit:%' AND value->>'userId'=$1 AND value->>'rank'=$2 AND value->>'cycle'=$3 AND value->>'status'='approved'`;
 const args=[userId,String(profile.rank),profile.cycle];
 const [total]=c?(await c.query<{points:number;ids:string[]}>(sql,args)).rows:await query<{points:number;ids:string[]}>(sql,args);
 return {profile,points:total.points,creditIds:total.ids,step:promotionStep(promotionRankName(profile.rank,profile.rank_name))};
}

export async function promotionPoints(actor:Viewer,unitId:string|null=null,focus:string|null=null){
 const units=await workspaceUnits(actor.id,unitId);
 const progress=await promotionProgress(actor.id);
 const ids=units.map(unit=>unit.id);
 const [tasks,credits,people]=await Promise.all([
  query<{value:Task}>(`SELECT value FROM settings WHERE key LIKE 'promotion-task:%'
   AND (value->>'unitId' IS NULL OR (cardinality($2::text[])=0 AND value->>'unitId'=$1) OR value->>'unitId'=ANY($2::text[])) ORDER BY value->>'name'`,[progress.profile?.unit_id??null,ids]),
  query<{value:Credit}>(`WITH visible AS (
    SELECT value,coalesce(value->>'reportId',value->>'id') AS report_id
    FROM settings WHERE key LIKE 'promotion-credit:%' AND ((cardinality($2::text[])=0 AND value->>'userId'=$1) OR value->>'unitId'=ANY($2::text[]))
   ), recent AS (
    SELECT report_id,max(value->>'createdAt') AS submitted FROM visible GROUP BY report_id ORDER BY (report_id=$3) DESC NULLS LAST,submitted DESC,report_id LIMIT 50
   )
   SELECT visible.value FROM visible JOIN recent USING(report_id) ORDER BY recent.submitted DESC,visible.report_id,(visible.value->>'order')::int NULLS LAST,visible.value->>'id'`,[actor.id,ids,focus]),
  ids.length?query<{id:string;name:string;unit_id:string}>(`SELECT p.user_id AS id,p.first_name||' '||p.last_name AS name,p.unit_id
   FROM personnel p WHERE p.active AND p.rank IS NOT NULL AND p.user_id IS NOT NULL AND p.unit_id=ANY($1::uuid[]) AND p.user_id<>$2 ORDER BY p.last_name`,[ids,actor.id]):[],
 ]);
 return {...progress,units,canEditCommon:units.some(unit=>unit.appoint),tasks:mergeTasks(tasks.map(row=>row.value)),credits:credits.map(row=>row.value),people,actorId:actor.id};
}

export async function changePromotionPoints(input:unknown,actor:Viewer){
 const action=operation.parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const units=(await accessibleUnits(actor.id,null,c)).filter(unit=>unit.editor);
  const editable=(unit:string|null)=>units.some(item=>item.id===unit);
  const write=async(key:string,value:unknown)=>{await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(value)]);};
  if(action.kind==='task'||action.kind==='archive'){
   const id=action.id??randomUUID(),key='promotion-task:'+id;
   const {rows:[old]}=await c.query<{value:Task}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[key]);
   const previous=old?.value??common.find(task=>task.id===id);
   const unit=action.kind==='task'?action.unitId:old?.value.unitId??null;
   if((unit===null?!units.some(item=>item.appoint):!editable(unit))||(action.id&&(!previous||previous.unitId!==unit)))throw new HttpError('Завдання поза межами вашого підрозділу.',403);
   const next=action.kind==='task'?{id,unitId:unit,name:action.name,points:action.points,requirements:action.requirements}:{...old!.value,archived:true};
   await write(key,next);
   await audit(c,actor,'promotion.task',id,previous??null,next);
   return {saved:true};
  }
  if(action.kind==='review'||action.kind==='clarify'){
   const key='promotion-credit:'+action.id;
   const {rows:[row]}=await c.query<{value:Credit}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[key]);
   const old=row?.value;
   if(action.kind==='clarify'){
    if(!old||old.status!=='clarification'||old.userId!==actor.id)throw new HttpError('Це завдання недоступне для уточнення.',403);
    const {profile}=await promotionProgress(actor.id,c);
    if(!profile||profile.unit_id!==old.unitId||profile.rank!==old.rank||profile.cycle!==old.cycle)throw new HttpError('Службове призначення змінилося.',409);
    const added=[...new Set(action.links)].filter(link=>!old.links.includes(link));
    if(!added.length||old.links.length+added.length>20)throw new HttpError('Додайте нові докази. До 20 посилань на завдання.');
    if((await c.query(`SELECT 1 FROM settings WHERE key LIKE 'promotion-credit:%' AND key<>$1 AND value->>'userId'=$2
     AND value->>'status'<>'rejected' AND (value->'links') ?| $3::text[] LIMIT 1`,[key,actor.id,added])).rowCount)
     throw new HttpError('Ці докази вже використано в іншому записі.',409);
    const next={...old,status:'pending',links:[...old.links,...added]};
    await write(key,next);
    await audit(c,actor,'promotion.credit.clarify',old.id,old,next);
    return {saved:true};
   }
   if(!old||old.status!=='pending'||old.userId===actor.id||!editable(old.unitId))throw new HttpError('Запис недоступний для перевірки.',403);
   const {profile}=await promotionProgress(old.userId,c);
   if(action.approve&&(!profile||profile.rank!==old.rank||profile.cycle!==old.cycle||profile.unit_id!==old.unitId))
    throw new HttpError('Службове призначення змінилося після подання.',409);
   const next={...old,quantity:action.approve?action.quantity??old.quantity:old.quantity,status:action.approve?'approved':action.clarification?'clarification':'rejected',reason:action.reason};
   await write(key,next);
   await audit(c,actor,'promotion.credit.review',old.id,old,next,action.reason);
   return {saved:true};
  }
  const userId=action.kind==='bonus'?action.userId:actor.id;
  const {profile}=await promotionProgress(userId,c);
  if(!profile||(action.kind==='bonus'&&(!editable(profile.unit_id)||userId===actor.id)))
   throw new HttpError('Потрібен активний профіль із підрозділом і званням.',403);
  const entries=action.kind==='submit-report'?action.entries:action.kind==='submit'?[action]:[{taskId:'bonus',quantity:1,links:action.links}];
  const customIds=[...new Set(entries.filter(entry=>entry.taskId!=='bonus').map(entry=>'promotion-task:'+entry.taskId))];
  const {rows:custom}=await c.query<{value:Task}>('SELECT value FROM settings WHERE key=ANY($1::text[])',[customIds]);
  const tasks=new Map(mergeTasks(custom.map(row=>row.value)).map(task=>[task.id,task]));
  const allLinks=entries.flatMap(entry=>[...new Set(entry.links)]);
  if(new Set(allLinks).size!==allLinks.length)throw new HttpError('Одне посилання не можна використати в кількох завданнях одного звіту.',409);
  if((await c.query(`SELECT 1 FROM settings WHERE key LIKE 'promotion-credit:%' AND value->>'userId'=$1
   AND value->>'status'<>'rejected' AND (value->'links') ?| $2::text[] LIMIT 1`,[userId,allLinks])).rowCount)
   throw new HttpError('Ці докази вже використано в іншому записі. Додайте докази саме цієї RP-дії.',409);
  const reportId=action.kind==='bonus'?undefined:randomUUID();
  const createdAt=new Date().toISOString();
  const credits=entries.map((entry,index):Credit=>{
   const task=tasks.get(entry.taskId);
   if(action.kind!=='bonus'&&(!task||task.archived||(task.unitId&&task.unitId!==profile.unit_id)))
    throw new HttpError('Завдання '+(index+1)+' недоступне.',409);
   return {id:randomUUID(),reportId,order:index,userId,name:profile.name,unitId:profile.unit_id,rank:profile.rank,cycle:profile.cycle,
    taskId:entry.taskId,title:task?.name??'Позачергове заохочення',rate:action.kind==='bonus'?action.points:task!.points,
    quantity:entry.quantity,links:[...new Set(entry.links)],status:action.kind==='bonus'?'approved':'pending',
    reason:action.kind==='bonus'?action.reason:undefined,createdAt};
  });
  await c.query(`INSERT INTO settings(key,value) SELECT 'promotion-credit:'||(entry->>'id'),entry
   FROM jsonb_array_elements($1::jsonb) AS entries(entry)`,[JSON.stringify(credits)]);
  await audit(c,actor,reportId?'promotion.report.submit':'promotion.credit',reportId??credits[0].id,null,credits,credits[0].reason);
  return {saved:true};
 });
}
