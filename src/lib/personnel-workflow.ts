import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import {accessibleUnits} from './unit-page';
import type {Viewer} from './domain';

const actions=['promote','demote','dismiss','admit','transfer'] as const;
const proof={reason:z.string().trim().min(5).max(3000),links:z.array(evidence).min(1).max(20)};
const rank=z.number().int().positive().max(2147483647);
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('submit'),rank,...proof}),
 z.object({kind:z.literal('record'),action:z.enum(actions),userId:z.string().min(1).max(100),rank:rank.optional(),unitId:z.uuid().optional(),...proof}),
 z.object({kind:z.literal('decide'),id:z.uuid(),approve:z.boolean(),reason:proof.reason}),
]);
type Promotion={id:string;userId:string;name:string;staticId:string;unitId:string;fromRank:number;rank:number;reason:string;links:string[];status:string;decision?:string;createdAt:string};

export async function personnelWorkflow(actor:Viewer){
 const units=(await accessibleUnits(actor.id)).filter(unit=>unit.editor);
 const [me,ranks,promotions,people,history,leadership]=await Promise.all([
  query<{rank:number|null;unit_id:string|null;active:boolean}>('SELECT rank,unit_id,active FROM personnel WHERE user_id=$1',[actor.id]),
  query<{id:number;name:string}>('SELECT id,name FROM ranks ORDER BY id'),
  query<{value:Promotion}>(`SELECT value FROM settings WHERE key LIKE 'promotion-report:%' AND
   (value->>'userId'=$1 OR value->>'unitId'=ANY($2::text[])) ORDER BY value->>'createdAt' DESC LIMIT 100`,[actor.id,units.map(unit=>unit.id)]),
  units.length?query<{id:string;name:string;static_id:string;unit_id:string|null;rank:number|null;active:boolean|null}>(`SELECT u.id,u.name,p.unit_id,p.rank,p.active,coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$')) AS static_id
   FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id LEFT JOIN settings d ON d.key='service:'||p.id::text
   WHERE cardinality($2::uuid[])>0 AND u.id<>$1 AND u.role<>'admin' AND (coalesce(d.value->>'leadershipRole','member')='member' OR $3::boolean OR (d.value->>'leadershipRole' IN ('commander','deputy') AND EXISTS(SELECT 1 FROM personnel leader JOIN settings g ON g.key='service:'||leader.id::text WHERE leader.user_id=$1 AND leader.active AND g.value->>'leadershipRole'='leadership')))
   AND (p.unit_id IS NULL OR p.unit_id=ANY($2::uuid[])) AND coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$')) IS NOT NULL
   ORDER BY u.name`,[actor.id,units.map(unit=>unit.id),actor.role==='admin']):[],
  units.length?query<{id:string;created_at:string;after:{action:string;author:string;actorStaticId?:string;name:string;staticId:string;fromRankName?:string;rankName?:string;fromUnitName?:string;unitName?:string;reason:string;links:string[]}}>(
   `SELECT id,created_at,after FROM audit_logs WHERE action='personnel.record'
    AND (after->>'fromUnit'=ANY($1::text[]) OR after->>'unitId'=ANY($1::text[])) ORDER BY created_at DESC,id DESC LIMIT 100`,[units.map(unit=>unit.id)]):[],
  query("SELECT 1 FROM personnel p JOIN settings s ON s.key='service:'||p.id::text WHERE p.user_id=$1 AND p.active AND s.value->>'leadershipRole'='leadership'",[actor.id]),
 ]);
 return {units,canTransfer:actor.role==='admin'||leadership.length>0,me:me[0],ranks,promotions:promotions.map(row=>row.value),people,history,actorId:actor.id};
}

export async function changePersonnelWorkflow(input:unknown,actor:Viewer){
 const action=operation.parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('static-account-claims'))");
  const units=(await accessibleUnits(actor.id,null,c)).filter(unit=>unit.editor);
  const canEdit=(id:string|null|undefined)=>units.some(unit=>unit.id===id);
  const {rows:[author]}=await c.query(`SELECT u.name,coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$')) AS static_id,
   p.rank,p.unit_id,p.active,d.value->>'leadershipRole' AS leadership_role,u.role
   FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id LEFT JOIN settings d ON d.key='service:'||p.id::text
   WHERE u.id=$1 AND NOT u.must_change_password`,[actor.id]);
  if(!author)throw new HttpError('Сеанс недоступний.',403);
  if(action.kind==='submit'){
   if(!author.active||!author.rank||!author.unit_id||!author.static_id||action.rank<=author.rank||
    !(await c.query('SELECT 1 FROM ranks WHERE id=$1',[action.rank])).rowCount)
    throw new HttpError('Потрібен активний профіль із підрозділом і чинне вище звання.',409);
   if((await c.query("SELECT 1 FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'userId'=$1 AND value->>'status'='pending'",[actor.id])).rowCount)
    throw new HttpError('Ваш попередній звіт ще на розгляді.',409);
   const entry:Promotion={id:randomUUID(),userId:actor.id,name:author.name,staticId:author.static_id,unitId:author.unit_id,
    fromRank:author.rank,rank:action.rank,reason:action.reason,links:action.links,status:'pending',createdAt:new Date().toISOString()};
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2)',['promotion-report:'+entry.id,JSON.stringify(entry)]);
   await audit(c,actor,'personnel.promotion.submit',entry.id,null,entry);
   return {saved:true};
  }
  const promotion=action.kind==='decide'?(await c.query<{value:Promotion}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',['promotion-report:'+action.id])).rows[0]?.value:undefined;
  if(action.kind==='decide'&&(!promotion||promotion.status!=='pending'||!canEdit(promotion.unitId)))throw new HttpError('Звіт недоступний для розгляду.',403);
  const targetId=action.kind==='record'?action.userId:promotion!.userId;
  if(targetId===actor.id)throw new HttpError('Власні кадрові рішення недоступні.',403);
  if(action.kind==='decide'&&!action.approve){
   const next={...promotion!,status:'rejected',decision:action.reason};
   await c.query('UPDATE settings SET value=$2 WHERE key=$1',['promotion-report:'+action.id,JSON.stringify(next)]);
   await audit(c,actor,'personnel.promotion.decision',action.id,promotion,next,action.reason);
   return {saved:true};
  }
  const {rows:[target]}=await c.query(`SELECT u.name,u.role,p.id,p.static_id,p.first_name,p.last_name,p.active,p.rank,p.unit_id,
   substring(u.username from '^static_([0-9]+)$') AS login_id,coalesce(d.value->>'leadershipRole','member') AS leadership_role
   FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id LEFT JOIN settings d ON d.key='service:'||p.id::text WHERE u.id=$1 FOR UPDATE OF u`,[targetId]);
  const canManageTarget=target?.leadership_role==='member'||author.role==='admin'||(author.leadership_role==='leadership'&&['commander','deputy'].includes(target?.leadership_role));
  if(!target||target.role==='admin'||!canManageTarget||!(target.static_id||target.login_id))
   throw new HttpError('Цей зареєстрований боєць поза межами ваших кадрових повноважень.',403);
  const type=action.kind==='record'?action.action:'promote';
  const nextRank=action.kind==='record'?action.rank:promotion!.rank;
  const destination=action.kind==='record'?action.unitId:undefined;
  if(type==='admit'){
   if((target.active&&target.unit_id)||!canEdit(destination)||(target.unit_id&&!canEdit(target.unit_id)))
    throw new HttpError('Прийняття доступне для бійця без чинного призначення.',409);
  }else if(!target.active||!canEdit(target.unit_id))throw new HttpError('Боєць поза вашим підрозділом.',403);
  if(promotion&&(target.unit_id!==promotion.unitId||target.rank!==promotion.fromRank))throw new HttpError('Звання або підрозділ змінилися після подання звіту.',409);
  if(type==='transfer'&&(!canEdit(destination)||destination===target.unit_id||
   (author.role!=='admin'&&author.leadership_role!=='leadership')))throw new HttpError('Переведення між підрозділами виконує керівний склад.',403);
  const changesRank=type==='admit'||type==='promote'||type==='demote';
  if(changesRank&&(!nextRank||(type==='promote'&&(!target.rank||nextRank<=target.rank))||(type==='demote'&&(!target.rank||nextRank>=target.rank))))
   throw new HttpError('Оберіть звання відповідно до кадрової дії.',409);
  const ranks=await c.query<{id:number;name:string}>('SELECT id,name FROM ranks WHERE id=ANY($1::int[])',[[target.rank,nextRank].filter(Boolean)]);
  const rankName=(id:number)=>ranks.rows.find(row=>row.id===id)?.name;
  if(changesRank&&!rankName(nextRank!))throw new HttpError('Звання не знайдено.');
  const unitId=type==='admit'||type==='transfer'?destination!:target.unit_id;
  const rankId=changesRank?nextRank!:target.rank;
  const active=type!=='dismiss';
  const staticId=target.static_id||target.login_id;
  let personId=target.id;
  if(personId)await c.query('UPDATE personnel SET unit_id=$1,rank=$2,active=$3 WHERE id=$4',[unitId,rankId,active,personId]);
  else{
   const [first,...last]=target.name.trim().split(/\s+/);
   const existing=await c.query('SELECT 1 FROM personnel WHERE static_id::numeric=$1::text::numeric',[staticId]);
   if(existing.rowCount)throw new HttpError('Спочатку прив’яжіть наявний кадровий профіль.',409);
   personId=(await c.query('INSERT INTO personnel(static_id,first_name,last_name,user_id,unit_id,rank,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [staticId,first,last.join(' '),targetId,unitId,rankId,active])).rows[0].id;
  }
  if((type==='dismiss'||type==='transfer')&&target.leadership_role!=='member'){
   await c.query('UPDATE settings SET value=value||$2::jsonb WHERE key=$1',['service:'+personId,JSON.stringify({leadershipRole:'member',commanderUnitId:null})]);
  }
  if(type==='admit')await c.query("UPDATE profile_claims SET status='approved',reason=$3,reviewed_by=$4 WHERE user_id=$1 AND static_id::numeric=$2::text::numeric AND status='pending'",[targetId,staticId,action.reason,actor.id]);
  const record={action:type,author:author.name,actorStaticId:author.static_id,name:target.name,staticId,member:targetId,
   fromUnit:target.unit_id,unitId,fromUnitName:units.find(unit=>unit.id===target.unit_id)?.name,unitName:units.find(unit=>unit.id===unitId)?.name,
   fromRankName:rankName(target.rank),rankName:rankName(rankId),reason:action.reason,
   links:action.kind==='record'?action.links:promotion!.links,promotionId:promotion?.id};
  await audit(c,actor,'personnel.record',personId,{unitId:target.unit_id,rank:target.rank,active:target.active},record,action.reason);
  if(promotion){
   const next={...promotion,status:'approved',decision:action.reason};
   await c.query('UPDATE settings SET value=$2 WHERE key=$1',['promotion-report:'+promotion.id,JSON.stringify(next)]);
   await audit(c,actor,'personnel.promotion.decision',promotion.id,promotion,next,action.reason);
  }
  return {saved:true};
 });
}
