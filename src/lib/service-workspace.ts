import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {accessibleUnits} from './unit-page';
import type {Viewer} from './domain';

import {serviceModules,type ServiceModule} from './portal-navigation';
const moduleSchema=z.enum(serviceModules);
const title=z.string().trim().min(1).max(120);
const body=z.string().trim().min(1).max(5000);
const uuid=z.string().uuid();
const requestTypes=['Переведення','Відпустка','Вступ або поновлення','Звільнення або оскарження'] as const;
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('request'),type:z.enum(requestTypes),body,targetUnit:uuid.optional()}),
 z.object({kind:z.literal('decide'),id:uuid,status:z.enum(['approved','rejected']),body}),
 z.object({kind:z.literal('publish'),module:moduleSchema.exclude(['requests']),unit:uuid,title,body,
  url:z.url({protocol:/^https$/}).max(2048).refine(value=>{const link=new URL(value);return !link.username&&!link.password;}).optional(),date:z.iso.date().optional(),revision:title.optional(),category:title.optional(),replaces:uuid.optional()}),
 z.object({kind:z.literal('transfer'),id:uuid}),
 z.object({kind:z.literal('attendance'),id:uuid,member:z.string().min(1).max(100).optional(),status:z.enum(['confirmed','declined','present','absent'])}),
 z.object({kind:z.literal('archive'),id:uuid}),
 z.object({kind:z.literal('result'),id:uuid,member:z.string().min(1).max(100),status:z.enum(['passed','retry'])}),
]);

type Entry={
 id:string;module:ServiceModule;unit:string|null;author:string;name:string;title:string;body:string;createdAt:string;
 targetUnit?:string;url?:string;date?:string;revision?:string;category?:string;replaces?:string;appliedAt?:string;status?:'pending'|'approved'|'rejected';decision?:string;decidedBy?:string;decidedAt?:string;archived?:boolean;
};
const prefix='service-entry:';

export async function serviceWorkspace(actor:Viewer,module:ServiceModule,focus:string|null=null){
 const units=await accessibleUnits(actor.id);
 const editors=units.filter(unit=>unit.editor).map(unit=>unit.id);
 const [rows,people,results,targets,attendance,authority,membership]=await Promise.all([
  query<{value:Entry}>(`SELECT value FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'=$1
   AND (value->>'author'=$2 OR ($1='requests' AND $5::boolean) OR value->>'unit'=ANY($3::text[]) OR value->>'targetUnit'=ANY($4::text[]))
   AND (coalesce(value->>'archived','false')='false' OR ($1='regulations' AND value->>'unit'=ANY($3::text[]))) ORDER BY (value->>'id'=$6) DESC NULLS LAST, CASE WHEN $1='calendar' THEN value->>'date' END ASC, value->>'createdAt' DESC LIMIT 200`,
   [module,actor.id,module==='requests'?editors:units.map(unit=>unit.id),module==='requests'?editors:[],actor.role==='admin',focus]),
  (module==='training'||module==='calendar')&&editors.length?query<{id:string;name:string;unit:string}>(
   "SELECT user_id AS id,first_name||' '||last_name AS name,unit_id AS unit FROM personnel WHERE active AND user_id IS NOT NULL AND unit_id=ANY($1::uuid[]) ORDER BY last_name",[editors]):[],
  module==='training'?query<{value:{entry:string;member:string;status:string}}>(`SELECT value FROM settings WHERE key LIKE 'service-result:%' AND
   (value->>'member'=$1 OR value->>'unit'=ANY($2::text[]))`,[actor.id,editors]):[],
  module==='requests'?query<{id:string;name:string}>('SELECT id,name FROM units WHERE active ORDER BY sort_order,name'):[],
  module==='calendar'?query<{value:{entry:string;member:string;status:string}}>(`SELECT value FROM settings WHERE key LIKE 'service-attendance:%' AND (value->>'member'=$1 OR value->>'unit'=ANY($2::text[]))`,[actor.id,editors]):[],
  module==='requests'?query("SELECT 1 FROM personnel p JOIN settings s ON s.key='service:'||p.id::text WHERE p.user_id=$1 AND p.active AND s.value->>'leadershipRole'='leadership'",[actor.id]):[],
  module==='calendar'?query<{unit_id:string|null}>('SELECT unit_id FROM personnel WHERE user_id=$1 AND active',[actor.id]):[],
 ]);
 return {units,entries:rows.map(({value})=>value),people,results:results.map(({value})=>value),targets,attendance:attendance.map(row=>row.value),memberUnit:membership[0]?.unit_id,canTransfer:actor.role==='admin'||authority.length>0,actorId:actor.id,admin:actor.role==='admin'};
}

export async function changeServiceWorkspace(actor:Viewer,input:unknown){
 const action=operation.parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[account]}=await c.query(`SELECT u.role,p.id,p.unit_id,d.value->>'leadershipRole' AS leadership_role FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id AND p.active LEFT JOIN settings d ON d.key='service:'||p.id::text
   WHERE u.id=$1 AND NOT u.must_change_password`,[actor.id]);
  if(!account)throw new HttpError('Увійдіть повторно.',403);
  const {rows:scopes}=await c.query<{id:string}>(`SELECT u.id FROM units u LEFT JOIN settings grant_record ON grant_record.key='service:'||$2::text
   WHERE u.active AND ($1='admin' OR grant_record.value->>'leadershipRole'='leadership' OR
    (u.id=$3::uuid AND grant_record.value->>'commanderUnitId'=u.id::text AND grant_record.value->>'leadershipRole' IN ('commander','deputy')))`,
   [account.role,account.id??null,account.unit_id??null]);
  const editors=new Set(scopes.map(scope=>scope.id));
  const write=async(key:string,value:unknown)=>{await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(value)]);};
  if(action.kind==='request'||action.kind==='publish'){
   if(action.kind==='publish'&&!editors.has(action.unit))throw new HttpError('Ви не керуєте цим підрозділом.',403);
   if(action.kind==='request'&&action.type==='Переведення'&&(!action.targetUnit||action.targetUnit===account.unit_id||
     !(await c.query('SELECT id FROM units WHERE id=$1 AND active',[action.targetUnit])).rowCount))throw new HttpError('Оберіть інший чинний підрозділ.');
   if(action.kind==='publish'&&action.module==='calendar'&&!action.date)throw new HttpError('Вкажіть дату події.');
   if(action.kind==='publish'&&action.replaces){
    const {rows:[previous]}=await c.query<{value:Entry}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+action.replaces]);
    if(action.module!=='regulations'||!previous||previous.value.module!==action.module||previous.value.unit!==action.unit||previous.value.archived||!action.revision)
     throw new HttpError('Оберіть чинний документ того самого підрозділу й укажіть редакцію.',409);
    await write(prefix+action.replaces,{...previous.value,archived:true});
    await audit(c,actor,'service.archive',action.replaces,previous.value,{...previous.value,archived:true});
   }
   const id=randomUUID();
   const entry:Entry={id,module:action.kind==='request'?'requests':action.module,unit:action.kind==='request'?account.unit_id??null:action.unit,
    author:actor.id,name:actor.name,title:action.kind==='request'?action.type:action.title,body:action.body,createdAt:new Date().toISOString(),
    ...(action.kind==='request'?{status:'pending' as const,targetUnit:action.type==='Переведення'?action.targetUnit:undefined}:{url:action.url,date:action.date,revision:action.revision,category:action.category,replaces:action.replaces})};
   await write(prefix+id,entry);
   await audit(c,actor,'service.'+action.kind,id,null,entry);
   return {saved:true};
  }
  const {rows:[row]}=await c.query<{value:Entry}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+action.id]);
  const entry=row?.value;
  if(!entry||entry.archived)throw new HttpError('Запис не знайдено.',404);
  const canEdit=!!entry.unit&&editors.has(entry.unit);
  if(action.kind==='decide'){
   if(entry.module!=='requests'||entry.author===actor.id||(!canEdit&&account.role!=='admin'&&!(entry.targetUnit&&editors.has(entry.targetUnit))))throw new HttpError('Рішення недоступне.',403);
   if(entry.status!=='pending')throw new HttpError('Рішення вже зафіксовано.',409);
   // Requests record a decision. Existing personnel controls apply changes to the roster.
   const next={...entry,status:action.status,decision:action.body,decidedBy:actor.name,decidedAt:new Date().toISOString()};
   await write(prefix+entry.id,next);
   await audit(c,actor,'service.request.decision',entry.id,entry,next,action.body);
  }else if(action.kind==='transfer'){
   if(account.role!=='admin'&&account.leadership_role!=='leadership')throw new HttpError('Переведення застосовує керівний склад.',403);
   if(entry.author===actor.id||entry.module!=='requests'||entry.title!=='Переведення'||entry.status!=='approved'||!entry.targetUnit||!editors.has(entry.targetUnit))
    throw new HttpError('Заявка недоступна для переведення.',409);
   if(entry.appliedAt)return {saved:true};
   const {rows:[person]}=await c.query(`SELECT p.id,p.unit_id,d.value->>'leadershipRole' AS leadership_role,u.role
    FROM personnel p JOIN app_user u ON u.id=p.user_id LEFT JOIN settings d ON d.key='service:'||p.id::text
    WHERE p.user_id=$1 AND p.active FOR UPDATE OF p`,[entry.author]);
   if(!person||person.unit_id!==entry.unit||person.role==='admin'||(person.leadership_role&&person.leadership_role!=='member'))
    throw new HttpError('Кадровий профіль змінився або потребує окремого призначення.',409);
   await c.query('UPDATE personnel SET unit_id=$1 WHERE id=$2',[entry.targetUnit,person.id]);
   const next={...entry,appliedAt:new Date().toISOString()};
   await write(prefix+entry.id,next);
   await audit(c,actor,'unit.transfer',person.id,{unitId:person.unit_id},{unitId:entry.targetUnit,entryId:entry.id,member:entry.author});
  }else if(action.kind==='attendance'){
   if(entry.module!=='calendar'||!entry.unit||!entry.date)throw new HttpError('Це не подія календаря.',409);
   const tracking=action.status==='present'||action.status==='absent';
   const member=tracking?action.member:actor.id;
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
   if(tracking?(!canEdit||!member||entry.date>today):(entry.unit!==account.unit_id||entry.date<today))
    throw new HttpError('Ця дія для події недоступна.',403);
   if(!(await c.query('SELECT 1 FROM personnel WHERE active AND user_id=$1 AND unit_id=$2',[member,entry.unit])).rowCount)
    throw new HttpError('Боєць не належить до підрозділу.',403);
   const key='service-attendance:'+entry.id+':'+member;
   const {rows:[previous]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   if(!tracking&&['present','absent'].includes(previous?.value?.status))throw new HttpError('Відвідування вже зафіксовано.',409);
   const next={entry:entry.id,unit:entry.unit,member,status:action.status};
   await write(key,next);
   await audit(c,actor,'service.attendance',entry.id,previous?.value??null,next);
  }else if(action.kind==='archive'){
   if(!canEdit||entry.module==='requests')throw new HttpError('Архівування недоступне.',403);
   await write(prefix+entry.id,{...entry,archived:true});
   await audit(c,actor,'service.archive',entry.id,entry,{...entry,archived:true});
  }else{
   if(!canEdit||entry.module!=='training'||!(await c.query('SELECT id FROM personnel WHERE user_id=$1 AND unit_id=$2 AND active',[action.member,entry.unit])).rowCount)
    throw new HttpError('Результат можна вказати для бійця цього підрозділу.',403);
   const key='service-result:'+entry.id+':'+action.member;
   const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   const next={entry:entry.id,unit:entry.unit,member:action.member,status:action.status};
   await write(key,next);
   await audit(c,actor,'service.training.result',entry.id,old?.value??null,next);
  }
  return {saved:true};
 });
}
