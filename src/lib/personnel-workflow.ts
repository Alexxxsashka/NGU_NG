import {checkPromotion,promotionRestriction} from './promotion-limit';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import {promotionChecklist,type Requirement} from './promotion-checklist';
import {promotionProgress} from './promotion-points';
import {promotionRankName} from './promotion-rules';
import {workspaceUnits} from './workspace-scope';
import {accessibleUnits} from './unit-page';
import type {Viewer} from './domain';

const actions=['promote','demote','dismiss','admit','transfer'] as const;
const proof={reason:z.string().trim().min(5).max(3000),links:z.array(evidence).min(1).max(20)};
const rank=z.number().int().positive().max(2147483647);
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('reconcile-promotion'),userId:z.string().min(1).max(100),at:z.iso.datetime().nullable(),...proof}),
 z.object({kind:z.literal('requirement'),rank:rank.max(14),title:z.string().trim().min(3).max(160),category:z.enum(['standard','assessment'])}),
 z.object({kind:z.literal('confirm-requirement'),userId:z.string().min(1).max(100),id:z.uuid(),source:evidence}),
 z.object({kind:z.literal('submit'),rank,...proof}),
 z.object({kind:z.literal('record'),action:z.enum(actions),userId:z.string().min(1).max(100),rank:rank.optional(),unitId:z.uuid().optional(),qualified:z.boolean().optional(),...proof}),
 z.object({kind:z.literal('decide'),id:z.uuid(),approve:z.boolean(),qualified:z.boolean().optional(),reason:proof.reason}),
]);
type Promotion={id:string;userId:string;name:string;staticId:string;unitId:string;fromRank:number;rank:number;reason:string;links:string[];status:string;decision?:string;createdAt:string;creditIds?:string[];confirmationIds?:string[]};

export async function personnelWorkflow(actor:Viewer,unitId:string|null=null,focus:string|null=null){
 const units=await workspaceUnits(actor.id,unitId);
 const [me,ranks,promotions,people,history,leadership]=await Promise.all([
  query<{rank:number|null;unit_id:string|null;active:boolean}>('SELECT rank,unit_id,active FROM personnel WHERE user_id=$1',[actor.id]),
  query<{id:number;name:string}>('SELECT id,name FROM ranks ORDER BY id'),
  query<{value:Promotion}>(`SELECT value FROM settings WHERE key LIKE 'promotion-report:%' AND
   ((cardinality($2::text[])=0 AND value->>'userId'=$1) OR value->>'unitId'=ANY($2::text[])) ORDER BY (value->>'id'=$3) DESC NULLS LAST,value->>'createdAt' DESC LIMIT 100`,[actor.id,units.map(unit=>unit.id),focus]),
  units.length?query<{id:string;name:string;static_id:string;unit_id:string|null;rank:number|null;active:boolean|null}>(`SELECT u.id,u.name,p.unit_id,p.rank,p.active,coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$')) AS static_id
   FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id LEFT JOIN settings d ON d.key='service:'||p.id::text
   WHERE cardinality($2::uuid[])>0 AND u.id<>$1 AND u.role<>'admin' AND (coalesce(d.value->>'leadershipRole','member')='member' OR $3::boolean OR (d.value->>'leadershipRole' IN ('commander','deputy') AND EXISTS(SELECT 1 FROM personnel leader WHERE leader.user_id=$1 AND leader.active AND leader.rank BETWEEN 13 AND 15)))
   AND (p.unit_id IS NULL OR p.unit_id=ANY($2::uuid[])) AND coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$')) IS NOT NULL
   ORDER BY u.name`,[actor.id,units.map(unit=>unit.id),actor.role==='admin']):[],
  units.length?query<{id:string;created_at:string;after:{action:string;author:string;actorStaticId?:string;name:string;staticId:string;fromRankName?:string;rankName?:string;fromUnitName?:string;unitName?:string;reason:string;links:string[]}}>(
   `SELECT id,created_at,after FROM audit_logs WHERE action='personnel.record'
    AND (after->>'fromUnit'=ANY($1::text[]) OR after->>'unitId'=ANY($1::text[])) ORDER BY created_at DESC,id DESC LIMIT 100`,[units.map(unit=>unit.id)]):[],
  query("SELECT 1 FROM personnel p WHERE p.user_id=$1 AND p.active AND p.rank BETWEEN 13 AND 15",[actor.id]),
 ]);
 const progress=await promotionProgress(actor.id);
 const destinations=unitId?(await accessibleUnits(actor.id)).filter(unit=>unit.editor):[];
 const restriction=!unitId&&progress.profile?await promotionRestriction(progress.profile.id):null;
 const checklist=!unitId&&progress.profile?await promotionChecklist(progress.profile):[];
 const requirements=units.length?(await query<{value:Requirement}>("SELECT value FROM settings WHERE key LIKE 'promotion-requirement:%' ORDER BY value->>'title'")).map(row=>row.value):[];
 return {units,destinations,requirements,progress:{restriction,checklist,points:progress.points,step:progress.step},canTransfer:actor.role==='admin'||leadership.length>0,me:me[0],ranks,promotions:promotions.map(row=>row.value),people,history,actorId:actor.id};
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
  if(action.kind==='reconcile-promotion'){
   const {rows:[person]}=await c.query<{id:string;unit_id:string}>('SELECT id,unit_id FROM personnel WHERE user_id=$1 AND active FOR UPDATE',[action.userId]);
   if(!person||action.userId===actor.id||!units.some(unit=>unit.id===person.unit_id&&unit.appoint))throw new HttpError('Кадрова звірка доступна керуючому складу.',403);
   if(action.at&&Date.parse(action.at)>Date.now())throw new HttpError('Дата підвищення не може бути в майбутньому.');
   const key='promotion-history:'+person.id;
   const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   const next={at:action.at,links:action.links,reason:action.reason};
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(next)]);
   await audit(c,actor,'promotion.history.reconcile',person.id,old?.value??null,next,action.reason);
   return {saved:true};
  }
  if(action.kind==='requirement'){
   if(!units.some(unit=>unit.appoint))throw new HttpError('Нормативи встановлює керуючий склад.',403);
   const entry={id:randomUUID(),rank:action.rank,title:action.title,kind:action.category};
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2)',['promotion-requirement:'+entry.id,JSON.stringify(entry)]);
   await audit(c,actor,'promotion.requirement',entry.id,null,entry);
   return {saved:true};
  }
  if(action.kind==='confirm-requirement'){
   const {profile}=await promotionProgress(action.userId,c);
   if(action.userId===actor.id||!profile||!canEdit(profile.unit_id))throw new HttpError('Підтвердження поза межами ваших повноважень.',403);
   const requirement=(await promotionChecklist(profile,c)).find(item=>item.rule.id===action.id);
   if(!requirement)throw new HttpError('Норматив недоступний для цього звання.',409);
   if(requirement.confirmation)return {saved:true};
   const confirmation={id:randomUUID(),source:action.source,by:actor.id,at:new Date().toISOString()};
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2)',['promotion-confirmation:'+profile.id+':'+profile.cycle+':'+action.id,JSON.stringify(confirmation)]);
   await audit(c,actor,'promotion.requirement.confirm',profile.id,null,{...confirmation,rule:action.id});
   return {saved:true};
  }
  if(action.kind==='submit'){
   if(!author.active||!author.rank||!author.unit_id||!author.static_id||action.rank<=author.rank||
    !(await c.query('SELECT 1 FROM ranks WHERE id=$1',[action.rank])).rowCount)
    throw new HttpError('Потрібен активний профіль із підрозділом і чинне вище звання.',409);
   if((await c.query("SELECT 1 FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'userId'=$1 AND value->>'status'='pending'",[actor.id])).rowCount)
    throw new HttpError('Ваш попередній звіт ще на розгляді.',409);
   const progress=await promotionProgress(actor.id,c);
   const {rows:[destinationRank]}=await c.query<{name:string}>('SELECT name FROM ranks WHERE id=$1',[action.rank]);
   if(progress.profile)await checkPromotion(c,progress.profile.id,author.rank,action.rank);
   if(!progress.step||promotionRankName(action.rank,destinationRank.name).toLocaleLowerCase('uk')!==progress.step[1].toLocaleLowerCase('uk')||progress.points<progress.step[2])
    throw new HttpError('Потрібні підтверджені бали й наступне звання за шкалою підвищень.',409);
   const checklist=progress.profile?await promotionChecklist(progress.profile,c):[];
   if(checklist.some(item=>!item.confirmation))throw new HttpError('Залишилися непідтверджені нормативи або атестації.',409);
   const confirmationIds=checklist.flatMap(item=>item.confirmation?[item.confirmation.id]:[]);
   const entry:Promotion={id:randomUUID(),userId:actor.id,name:author.name,staticId:author.static_id,unitId:author.unit_id,
    fromRank:author.rank,rank:action.rank,reason:action.reason,links:action.links,status:'pending',creditIds:progress.creditIds,confirmationIds,createdAt:new Date().toISOString()};
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
  const canManageTarget=target?.leadership_role==='member'||author.role==='admin'||(author.rank>=13&&author.rank<=15&&['commander','deputy'].includes(target?.leadership_role));
  if(!target||target.role==='admin'||!canManageTarget||!(target.static_id||target.login_id))
   throw new HttpError('Цей зареєстрований боєць поза межами ваших кадрових повноважень.',403);
  const type=action.kind==='record'?action.action:'promote';
  if(author.role!=='admin'&&target.rank>=11&&target.rank>=author.rank)throw new HttpError('Цей кадровий профіль поза вашими повноваженнями.',403);
  const nextRank=action.kind==='record'?action.rank:promotion!.rank;
  const destination=action.kind==='record'?action.unitId:undefined;
  if(type==='admit'){
   if((target.active&&target.unit_id)||!canEdit(destination)||(target.unit_id&&!canEdit(target.unit_id)))
    throw new HttpError('Прийняття доступне для бійця без чинного призначення.',409);
  }else if(!target.active||!canEdit(target.unit_id))throw new HttpError('Боєць поза вашим підрозділом.',403);
  if(promotion&&(target.unit_id!==promotion.unitId||target.rank!==promotion.fromRank))throw new HttpError('Звання або підрозділ змінилися після подання звіту.',409);
  if(type==='transfer'&&(!canEdit(destination)||destination===target.unit_id||
   (author.role!=='admin'&&!(author.rank>=13&&author.rank<=15))))throw new HttpError('Переведення між підрозділами виконує керівний склад.',403);
  const changesRank=type==='admit'||type==='promote'||type==='demote';
  if(changesRank&&(!nextRank||(type==='promote'&&(!target.rank||nextRank<=target.rank))||(type==='demote'&&(!target.rank||nextRank>=target.rank))))
   throw new HttpError('Оберіть звання відповідно до кадрової дії.',409);
  const ranks=await c.query<{id:number;name:string}>('SELECT id,name FROM ranks WHERE id=ANY($1::int[])',[[target.rank,nextRank].filter(Boolean)]);
  const rankName=(id:number)=>ranks.rows.find(row=>row.id===id)?.name;
  if(changesRank&&!rankName(nextRank!))throw new HttpError('Звання не знайдено.');
  if(type==='promote'){
   await checkPromotion(c,target.id,target.rank,nextRank!);
   const progress=await promotionProgress(targetId,c);
   if(!promotion&&progress.profile&&(await promotionChecklist(progress.profile,c)).some(item=>!item.confirmation))throw new HttpError('Залишилися непідтверджені нормативи або атестації.',409);
   if(promotion?.confirmationIds?.length&&progress.profile){
    const confirmed=new Set((await promotionChecklist(progress.profile,c)).map(item=>item.confirmation?.id));
    if(promotion.confirmationIds.some(id=>!confirmed.has(id)))throw new HttpError('Підтвердження нормативу відкликано. Перевірте вимоги перед підвищенням.',409);
   }
   if(!action.qualified)throw new HttpError('Підтвердьте виконання нормативів і проходження атестацій.',409);
   if(progress.step&&(progress.points<progress.step[2]||promotionRankName(nextRank!,rankName(nextRank!)!).toLocaleLowerCase('uk')!==progress.step[1].toLocaleLowerCase('uk')))
    throw new HttpError('Потрібні '+progress.step[2]+' підтверджених балів та наступне звання '+progress.step[1]+'.',409);
  }
  const unitId=type==='admit'||type==='transfer'?destination!:target.unit_id;
  if(changesRank&&nextRank!>=11&&(author.role!=='admin'&&nextRank!>=author.rank||nextRank===15))throw new HttpError('Для призначення на це звання потрібна окрема процедура.',403);
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
  if((type==='dismiss'||type==='transfer'||changesRank&&rankId!==11&&rankId!==12)&&target.leadership_role!=='member'){
   await c.query('UPDATE settings SET value=value||$2::jsonb WHERE key=$1',['service:'+personId,JSON.stringify({leadershipRole:'member',commanderUnitId:null})]);
  }
  if(type==='admit')await c.query("UPDATE profile_claims SET status='approved',reason=$3,reviewed_by=$4 WHERE user_id=$1 AND static_id::numeric=$2::text::numeric AND status='pending'",[targetId,staticId,action.reason,actor.id]);
  const record={action:type,author:author.name,actorStaticId:author.static_id,name:target.name,staticId,member:targetId,
   fromUnit:target.unit_id,unitId,fromUnitName:units.find(unit=>unit.id===target.unit_id)?.name,unitName:units.find(unit=>unit.id===unitId)?.name,
   rank:rankId,fromRankName:rankName(target.rank),rankName:rankName(rankId),reason:action.reason,
   qualified:type==='promote'?action.qualified:undefined,links:action.kind==='record'?action.links:promotion!.links,promotionId:promotion?.id,creditIds:promotion?.creditIds};
  await audit(c,actor,'personnel.record',personId,{unitId:target.unit_id,rank:target.rank,active:target.active},record,action.reason);
  if(promotion){
   const next={...promotion,status:'approved',decision:action.reason};
   await c.query('UPDATE settings SET value=$2 WHERE key=$1',['promotion-report:'+promotion.id,JSON.stringify(next)]);
   await audit(c,actor,'personnel.promotion.decision',promotion.id,promotion,next,action.reason);
  }
  return {saved:true};
 });
}
