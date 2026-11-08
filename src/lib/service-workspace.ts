import {promotionProgress} from './promotion-points';
import {promotionChecklist,type Requirement} from './promotion-checklist';
import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {evidence} from './validation';
import {HttpError} from './security';
import {defaultRecruitment,recruitmentRequirements} from './recruitment';
import {accessibleUnits} from './unit-page';
import {workspaceUnits} from './workspace-scope';
import type {Viewer} from './domain';

import {serviceModules,type ServiceModule} from './portal-navigation';
const moduleSchema=z.enum(serviceModules);
const title=z.string().trim().min(1).max(120);
const body=z.string().trim().min(1).max(5000);
const uuid=z.string().uuid();
const absenceTypes=['IC-відгул','OOC-відпустка','Відпустка'];
const requestTypes=['Переведення','Вступ до підрозділу','IC-відгул','OOC-відпустка','Відпустка','Вступ або поновлення','Звільнення або оскарження','Звільнення','Виправлення особової справи'] as const;
const correction=z.discriminatedUnion('field',[
 z.object({field:z.literal('joinedOn'),value:z.iso.date()}),
 z.object({field:z.literal('bio'),value:z.string().trim().max(500)}),
 z.object({field:z.literal('callsign'),value:z.string().trim().min(1).max(40)}),
]);
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('recruitment'),unit:uuid,body,minRank:z.number().int().min(1).max(15).nullable().optional()}),
 z.object({kind:z.literal('request'),draft:z.boolean().optional(),draftId:uuid.optional(),recruitmentEvidence:z.object({licenses:z.array(z.enum(['B','C','S'])).max(3),fitness:z.string().trim().max(1000),manual:z.string().trim().max(1500)}).optional(),type:z.enum(requestTypes),correction:correction.optional(),post:z.string().trim().max(160).optional(),replacement:z.string().trim().max(160).optional(),body:z.string().trim().max(5000),targetUnit:uuid.optional(),from:z.union([z.iso.date(),z.iso.datetime({local:true})]).optional(),to:z.union([z.iso.date(),z.iso.datetime({local:true})]).optional(),links:z.array(evidence).max(20).default([])}),
 z.object({kind:z.literal('delete-draft'),id:uuid}),
 z.object({kind:z.literal('cancel-absence'),id:uuid}),
 z.object({kind:z.literal('decide'),id:uuid,status:z.enum(['approved','rejected','clarification']),side:z.enum(['source','destination']).optional(),manualVerified:z.boolean().optional(),body}),
 z.object({kind:z.literal('publish'),module:moduleSchema.exclude(['requests']),unit:uuid,title,body,
  url:z.url({protocol:/^https$/}).max(2048).refine(value=>{const link=new URL(value);return !link.username&&!link.password;}).optional(),date:z.iso.date().optional(),revision:title.optional(),category:title.optional(),replaces:uuid.optional(),draft:z.boolean().optional(),requiresProof:z.boolean().optional(),responsible:title.optional(),requirementId:uuid.optional()}),
 z.object({kind:z.literal('resubmit'),id:uuid,body,links:z.array(evidence).max(20).default([])}),
 z.object({kind:z.literal('apply'),id:uuid,rank:z.number().int().positive().optional()}),
 z.object({kind:z.literal('transfer'),id:uuid}),
 z.object({kind:z.literal('attendance'),id:uuid,member:z.string().min(1).max(100).optional(),status:z.enum(['confirmed','declined','present','absent'])}),
 z.object({kind:z.literal('publish-draft'),id:uuid}),
 z.object({kind:z.literal('training-proof'),id:uuid,links:z.array(evidence).min(1).max(20)}),
 z.object({kind:z.literal('archive'),id:uuid}),
 z.object({kind:z.literal('enroll'),id:uuid,member:z.string().min(1).max(100)}),
 z.object({kind:z.literal('result'),id:uuid,member:z.string().min(1).max(100),status:z.enum(['passed','retry']),note:z.string().trim().max(2000).optional()}),
]);

type ServiceDraft={id:string;title:string;body:string;request:Extract<z.infer<typeof operation>,{kind:'request'}>};
type Entry={
 id:string;module:ServiceModule;unit:string|null;author:string;name:string;title:string;body:string;createdAt:string;
 correction?:z.infer<typeof correction>&{previous:string|null;profileId:string};orderId?:string;reportId?:string;
 transferApprovals?:Partial<Record<'source'|'destination',{actorId:string;name:string;at:string;body:string}>>;
 recruitmentEvidence?:{licenses:string[];fitness:string;manual:string};manualVerified?:boolean;
 requirementId?:string;post?:string;replacement?:string;recruitmentRequirements?:ReturnType<typeof recruitmentRequirements>;recruitmentRules?:string;targetUnit?:string;from?:string;to?:string;links?:string[];replies?:{body:string;links:string[];at:string}[];url?:string;date?:string;revision?:string;category?:string;replaces?:string;draft?:boolean;requiresProof?:boolean;responsible?:string;appliedAt?:string;status?:'pending'|'approved'|'rejected'|'clarification'|'cancelled';decision?:string;decidedBy?:string;decidedAt?:string;archived?:boolean;
};
const prefix='service-entry:';

const trainingUnitSql=`SELECT id FROM units WHERE active AND (
 id::text=(SELECT value->>'unitId' FROM settings WHERE key='training:kmb') OR
 (NOT EXISTS(SELECT 1 FROM settings WHERE key='training:kmb') AND (name='НЦП' OR name='Навчальний центр підготовки')))
 ORDER BY id LIMIT 1`;

export async function kmbUnitId(){
 const [unit]=await query<{id:string}>(trainingUnitSql);
 return unit?.id;
}

export async function serviceWorkspace(actor:Viewer,module:ServiceModule,focus:string|null=null,unitId:string|null=null){
 const membership=await query<{unit_id:string|null}>('SELECT p.unit_id FROM personnel p JOIN units u ON u.id=p.unit_id AND u.active WHERE p.user_id=$1 AND p.active',[actor.id]);
 const trainingUnit=module==='training'?await kmbUnitId():undefined;
 const units=(unitId?await workspaceUnits(actor.id,unitId):[]).filter(unit=>module!=='training'||unit.id===trainingUnit);
 const personalUnit=membership[0]?.unit_id;
 const readUnits=unitId?units.map(unit=>unit.id):personalUnit?[personalUnit]:[];
 const editors=units.filter(unit=>unit.editor).map(unit=>unit.id);
 const [rows,people,results,targets,attendance,authority,absences,ranks,drafts,requirements]=await Promise.all([
  query<{value:Entry}>(`SELECT value FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'=$1
   AND (($5::boolean AND $1='requests' AND value->>'author'=$2) OR value->>'unit'=ANY($3::text[]) OR value->>'targetUnit'=ANY($4::text[]) OR ($5::boolean AND $1='orders' AND EXISTS(
    SELECT 1 FROM settings report WHERE report.key='service-entry:'||(settings.value->>'reportId')
     AND report.value->>'author'=$2))
   OR ($5::boolean AND $1='training' AND EXISTS(SELECT 1 FROM personnel WHERE user_id=$2 AND active) AND EXISTS(
    SELECT 1 FROM settings enrollment WHERE enrollment.key='service-result:'||(settings.value->>'id')||':'||$2)))
   AND ($7::boolean OR coalesce(value->>'draft','false')='false')
   AND (coalesce(value->>'archived','false')='false' OR ($1='regulations' AND value->>'unit'=ANY($3::text[]))) ORDER BY (value->>'id'=$6) DESC NULLS LAST, CASE WHEN $1='calendar' THEN value->>'date' END ASC, value->>'createdAt' DESC LIMIT 200`,
   [module,actor.id,module==='requests'?editors:readUnits,module==='requests'?editors:[],!unitId,focus,!!unitId]),
  (module==='training'||module==='calendar')&&editors.length?query<{id:string;name:string;unit:string}>(
   "SELECT user_id AS id,first_name||' '||last_name AS name,unit_id AS unit FROM personnel WHERE active AND user_id IS NOT NULL AND ($2::boolean OR unit_id=ANY($1::uuid[])) ORDER BY last_name",[editors,module==='training']):[],
  module==='training'?query<{value:{entry:string;member:string;status?:string;links?:string[];note?:string}}>(`SELECT value FROM settings WHERE key LIKE 'service-result:%' AND
   (value->>'member'=$1 OR value->>'unit'=ANY($2::text[]))`,[actor.id,editors]):[],
  module==='requests'?query<{id:string;name:string;rules:string|null;min_rank:number|null}>(`SELECT u.id,u.name,s.value->>'body' AS rules,(s.value->>'minRank')::int AS min_rank FROM units u LEFT JOIN settings s ON s.key='recruitment:'||u.id::text WHERE u.active ORDER BY u.sort_order,u.name`):[],
  module==='calendar'?query<{value:{entry:string;member:string;status:string}}>(`SELECT value FROM settings WHERE key LIKE 'service-attendance:%' AND (value->>'member'=$1 OR value->>'unit'=ANY($2::text[]))`,[actor.id,editors]):[],
  module==='requests'?query("SELECT 1 FROM personnel p WHERE p.user_id=$1 AND p.active AND p.rank BETWEEN 13 AND 15",[actor.id]):[],
  module==='calendar'&&readUnits.length?query<{id:string;name:string;from:string;to:string}>(`SELECT value->>'id' AS id,value->>'name' AS name,
   value->>'from' AS "from",value->>'to' AS "to" FROM settings
   WHERE key LIKE 'service-entry:%' AND value->>'module'='requests' AND value->>'status'='approved'
   AND value->>'unit'=ANY($1::text[]) AND value->>'title'=ANY($2::text[])
   AND left(value->>'to',10)>=to_char(now() AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD')
   ORDER BY value->>'from',key LIMIT 100`,[readUnits,absenceTypes]):[],
  module==='requests'&&unitId?query<{id:number;name:string}>('SELECT id,name FROM ranks ORDER BY id'):[],
  module==='requests'&&!unitId?query<{value:ServiceDraft}>(`SELECT value FROM settings WHERE key LIKE 'service-draft:%'
   AND value->>'author'=$1 ORDER BY value->>'at' DESC LIMIT 50`,[actor.id]):[],
  module==='calendar'&&editors.length?query<{value:Requirement}>("SELECT value FROM settings WHERE key LIKE 'promotion-requirement:%' ORDER BY value->>'title'"):[],
 ]);
 return {units,entries:rows.map(({value})=>value),people,results:results.map(({value})=>value),trainingUnit,absences,requirements:requirements.map(row=>row.value),drafts:drafts.map(row=>row.value),targets:targets.map(unit=>({...unit,rules:unit.rules??defaultRecruitment(unit.name),requirements:{...recruitmentRequirements(unit.name),minRank:unit.min_rank??recruitmentRequirements(unit.name).minRank}})),ranks,attendance:attendance.map(row=>row.value),memberUnit:personalUnit,canTransfer:actor.role==='admin'||authority.length>0,actorId:actor.id,admin:actor.role==='admin'};
}

export async function changeServiceWorkspace(actor:Viewer,input:unknown){
 let action=operation.parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[account]}=await c.query(`SELECT u.role,p.id,p.unit_id,p.rank FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id AND p.active LEFT JOIN settings d ON d.key='service:'||p.id::text
   WHERE u.id=$1 AND NOT u.must_change_password`,[actor.id]);
  if(!account)throw new HttpError('Увійдіть повторно.',403);
  const editors=new Set((await accessibleUnits(actor.id,null,c)).filter(unit=>unit.editor).map(unit=>unit.id));
  const {rows:[trainingUnit]}=await c.query<{id:string}>(trainingUnitSql);
  const write=async(key:string,value:unknown)=>{await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(value)]);};
  if(action.kind==='delete-draft'){
   await c.query("DELETE FROM settings WHERE key=$1 AND value->>'author'=$2",['service-draft:'+action.id,actor.id]);
   return {saved:true};
  }
  if(action.kind==='request'&&action.draftId){
   const {rows:[stored]}=await c.query('SELECT value FROM settings WHERE key=$1 FOR UPDATE',['service-draft:'+action.draftId]);
   if(!stored||stored.value.author!==actor.id)throw new HttpError('Чернетка недоступна.',404);
   if(!action.draft){
    const draft=operation.parse({...stored.value.request,kind:'request',draft:false,draftId:action.draftId});
    if(draft.kind!=='request')throw new HttpError('Некоректна чернетка.',409);
    action=draft;
   }
  }
  if(action.kind==='request'&&action.draft){
   const id=action.draftId??randomUUID();
   await write('service-draft:'+id,{id,author:actor.id,title:action.type,body:action.body,request:action,at:new Date().toISOString()});
   return {saved:true};
  }
  if(action.kind==='recruitment'){
   if(!editors.has(action.unit))throw new HttpError('Ви не керуєте цим підрозділом.',403);
   const {rows:[unit]}=await c.query<{name:string}>('SELECT name FROM units WHERE id=$1',[action.unit]);
   if(/^ссо|nord division/i.test(unit.name)&&account.rank!==15)
    throw new HttpError('Умови набору ССО публікує Командувач НГУ.',403);
   if(recruitmentRequirements(unit.name).commanderApproval&&account.rank!==15)throw new HttpError('Поріг НЦП підтверджує Командувач НГУ.',403);
   if(action.minRank&&!(await c.query('SELECT 1 FROM ranks WHERE id=$1',[action.minRank])).rowCount)throw new HttpError('Оберіть ранг із кадрового довідника.');
   const key='recruitment:'+action.unit;
   const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   const next={body:action.body,minRank:action.minRank};
   await write(key,next);
   await audit(c,actor,'recruitment.rules',action.unit,old?.value??null,next);
   return {saved:true};
  }
  const issueOrder=async(entry:Entry,unit:string,appliedAt:string)=>{
   const id=randomUUID();
   const order:Entry={id,module:'orders',unit,author:actor.id,name:actor.name,
    title:'Наказ · '+entry.title,body:'Щодо: '+entry.name,
    createdAt:appliedAt,date:appliedAt.slice(0,10),reportId:entry.id};
   await write(prefix+id,order);
   await audit(c,actor,'service.order.issued',id,null,{requestId:entry.id,unit});
   return id;
  };
  let proposed:Entry['correction'];
  let recruitmentRules:string|undefined;
  let requirements:Entry['recruitmentRequirements'];
  if(action.kind==='request'||action.kind==='publish'){
   if(action.kind==='publish'&&action.module==='training'&&action.unit!==trainingUnit?.id)throw new HttpError('Програмою КМБ керує НЦП.',403);
   if(action.kind==='publish'&&!editors.has(action.unit))throw new HttpError('Ви не керуєте цим підрозділом.',403);
   if(action.kind==='request'&&['Переведення','Вступ до підрозділу'].includes(action.type)&&(!action.targetUnit||action.targetUnit===account.unit_id||
     !(await c.query('SELECT id FROM units WHERE id=$1 AND active',[action.targetUnit])).rowCount))throw new HttpError('Оберіть інший чинний підрозділ.');
   if(action.kind==='request'){
    if(action.type==='Виправлення особової справи'){
     if(!account.id||!account.unit_id||!action.correction)throw new HttpError('Оберіть поле й нове значення.');
     const {rows:[details]}=await c.query('SELECT value FROM settings WHERE key=$1',['service:'+account.id]);
     const previous=details?.value?.[action.correction.field]??null;
     if(previous===action.correction.value&&!(action.correction.field==='joinedOn'&&details?.value?.joinedOnVerified!==true))
      throw new HttpError('Нове значення збігається з поточним.');
     if(action.correction.field==='joinedOn'&&action.correction.value>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date()))
      throw new HttpError('Дата вступу не може бути в майбутньому.');
     proposed={...action.correction,previous,profileId:account.id};
    }
    if(action.type!=='OOC-відпустка'&&!action.body)throw new HttpError('Вкажіть підставу заявки.');
    if(action.type==='Вступ до підрозділу'){
     const {rows:[unit]}=await c.query<{name:string;rules:string|null;min_rank:number|null}>(`SELECT u.name,s.value->>'body' AS rules,(s.value->>'minRank')::int AS min_rank FROM units u
      LEFT JOIN settings s ON s.key='recruitment:'||u.id::text WHERE u.id=$1 AND u.active`,[action.targetUnit]);
     if(!unit)throw new HttpError('Оберіть чинний підрозділ.');
     recruitmentRules=unit.rules??defaultRecruitment(unit.name);
     requirements=recruitmentRequirements(unit.name);
     requirements.minRank=unit.min_rank??requirements.minRank;
     if(requirements.fitness&&!action.recruitmentEvidence?.fitness)throw new HttpError('Опишіть фізичну підготовку.');
     if(requirements.manualReview&&!action.recruitmentEvidence?.manual)throw new HttpError('Заповніть відомості для ручної перевірки.');
     const licenses=action.recruitmentEvidence?.licenses??[];
     if(requirements.licenses.some(category=>!licenses.includes(category as 'B'|'C'|'S')))throw new HttpError('Вкажіть необхідні категорії посвідчення.');
     if(!account.id)throw new HttpError('Для вступу потрібен активний кадровий профіль.',403);
     if((await c.query(`SELECT 1 FROM settings WHERE key LIKE 'service-entry:%'
      AND value->>'title'='Вступ до підрозділу' AND value->>'author'=$1 AND value->>'targetUnit'=$2
      AND value->>'status' IN ('pending','clarification','approved') LIMIT 1`,[actor.id,action.targetUnit])).rowCount)
      throw new HttpError('Заявка до цього підрозділу вже існує.',409);
    }
    if(action.type==='IC-відгул'){
     if(!action.post)throw new HttpError('Вкажіть пост або службове завдання.');
     const minutes=(Date.parse(action.to+'Z')-Date.parse(action.from+'Z'))/60000;
     if(!action.from?.includes('T')||!action.to?.includes('T')||!(minutes>0&&minutes<=120))throw new HttpError('Відгул має тривати від 1 хвилини до 2 годин.');
    }
    if(['Відпустка','OOC-відпустка'].includes(action.type)&&(!action.from||!action.to||action.from.includes('T')||action.to.includes('T')||action.from>action.to))throw new HttpError('Вкажіть коректні дати відпустки.');
    if(action.type==='Вступ або поновлення'&&(!action.targetUnit||!(await c.query('SELECT 1 FROM units WHERE id=$1 AND active',[action.targetUnit])).rowCount))
     throw new HttpError('Оберіть підрозділ для вступу.');
   }
   if(action.kind==='publish'&&action.requirementId&&(action.module!=='calendar'||!(await c.query('SELECT 1 FROM settings WHERE key=$1',['promotion-requirement:'+action.requirementId])).rowCount))
    throw new HttpError('Оберіть чинний норматив для події.');
   if(action.kind==='publish'&&action.module==='calendar'&&!action.date)throw new HttpError('Вкажіть дату події.');
   if(action.kind==='publish'&&action.replaces){
    const {rows:[previous]}=await c.query<{value:Entry}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+action.replaces]);
    if(action.module!=='regulations'||!previous||previous.value.module!==action.module||previous.value.unit!==action.unit||previous.value.archived||previous.value.draft||!action.revision)
     throw new HttpError('Оберіть чинний документ того самого підрозділу й укажіть редакцію.',409);
    if(!action.draft){
     await write(prefix+action.replaces,{...previous.value,archived:true});
     await audit(c,actor,'service.archive',action.replaces,previous.value,{...previous.value,archived:true});
    }
   }
   const previousUnit=action.kind==='request'&&action.type==='Вступ або поновлення'&&!account.unit_id?
    (await c.query<{unit_id:string|null}>('SELECT unit_id FROM personnel WHERE user_id=$1',[actor.id])).rows[0]?.unit_id:null;
   const id=randomUUID();
   const entry:Entry={id,module:action.kind==='request'?'requests':action.module,unit:action.kind==='request'?(action.type==='Вступ до підрозділу'?null:account.unit_id??previousUnit??null):action.unit,
    author:actor.id,name:actor.name,title:action.kind==='request'?action.type:action.title,body:action.body,createdAt:new Date().toISOString(),
    ...(action.kind==='request'?{status:'pending' as const,correction:proposed,recruitmentRequirements:requirements,recruitmentEvidence:requirements?action.recruitmentEvidence:undefined,recruitmentRules,targetUnit:['Переведення','Вступ до підрозділу','Вступ або поновлення'].includes(action.type)?action.targetUnit:undefined,from:action.from,to:action.to,post:action.type==='IC-відгул'?action.post:undefined,replacement:action.type==='IC-відгул'?action.replacement:undefined,links:action.links}:{url:action.url,date:action.date,revision:action.revision,category:action.category,replaces:action.replaces,draft:action.draft,requiresProof:action.requiresProof,responsible:action.responsible,requirementId:action.requirementId})};
   await write(prefix+id,entry);
   await audit(c,actor,'service.'+action.kind,id,null,entry);
   if(action.kind==='request'&&action.draftId)await c.query('DELETE FROM settings WHERE key=$1',['service-draft:'+action.draftId]);
   return {saved:true};
  }
  const {rows:[row]}=await c.query<{value:Entry}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+action.id]);
  const entry=row?.value;
  if(!entry||entry.archived)throw new HttpError('Запис не знайдено.',404);
  const canEdit=!!entry.unit&&editors.has(entry.unit)&&(entry.module!=='training'||entry.unit===trainingUnit?.id);
  if(action.kind==='resubmit'){
   if(entry.module!=='requests'||entry.author!==actor.id||entry.status!=='clarification')throw new HttpError('Уточнення недоступне.',403);
   const next={...entry,status:'pending',transferApprovals:undefined,replies:[...entry.replies??[],{body:action.body,links:action.links,at:new Date().toISOString()}]};
   await write(prefix+entry.id,next);
   await audit(c,actor,'service.request.resubmit',entry.id,entry,next);
  }else if(action.kind==='apply'){
   if(entry.module!=='requests'||entry.status!=='approved'||entry.author===actor.id||!['Вступ або поновлення','Звільнення','Відпустка'].includes(entry.title))
    throw new HttpError('Заявка недоступна для виконання.',409);
   const admission=entry.title==='Вступ або поновлення';
   const scope=admission?entry.targetUnit:entry.unit;
   if(!scope||!editors.has(scope))throw new HttpError('Виконання поза межами ваших повноважень.',403);
   if(entry.appliedAt)return {saved:true};
   const {rows:[person]}=await c.query(`SELECT p.id,p.unit_id,p.active,p.rank,u.role,d.value AS details
    FROM personnel p JOIN app_user u ON u.id=p.user_id LEFT JOIN settings d ON d.key='service:'||p.id::text
    WHERE p.user_id=$1 FOR UPDATE OF p`,[entry.author]);
   if(!person||person.role==='admin'||person.rank>=11||(person.details?.leadershipRole&&person.details.leadershipRole!=='member')||person.unit_id!==entry.unit)
    throw new HttpError('Потрібна актуальна кадрова картка звичайного бійця.',409);
   const next={...entry,appliedAt:new Date().toISOString()};
   if(admission){
    if((person.active&&person.unit_id)||(person.unit_id&&!editors.has(person.unit_id)&&account.role!=='admin'&&!(account.rank>=13&&account.rank<=15))||!action.rank||action.rank>=11||!(await c.query('SELECT 1 FROM ranks WHERE id=$1',[action.rank])).rowCount)
     throw new HttpError('Перевірте попереднє призначення та оберіть початкове звання.',409);
    await c.query('UPDATE personnel SET unit_id=$1,rank=$2,active=true WHERE id=$3',[scope,action.rank,person.id]);
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
    await write('service:'+person.id,{...person.details,joinedOn:date,joinedOnVerified:true});
   }else{
    if(!person.active)throw new HttpError('Службовий профіль неактивний.',409);
    if(entry.title==='Звільнення')await c.query('UPDATE personnel SET active=false WHERE id=$1',[person.id]);
   }
   const orderId=await issueOrder(entry,scope,next.appliedAt);
   await write(prefix+entry.id,{...next,orderId});
   await audit(c,actor,'service.request.applied',person.id,{unitId:person.unit_id,rank:person.rank,active:person.active},{...next,orderId,unitId:scope,rank:admission?action.rank:person.rank,active:entry.title!=='Звільнення'});
  }else if(action.kind==='cancel-absence'){
   if(entry.module!=='requests'||!absenceTypes.includes(entry.title)||(!canEdit&&entry.author!==actor.id))
    throw new HttpError('Скасування недоступне.',403);
   if(entry.status==='cancelled')return {saved:true};
   if(entry.appliedAt||!['pending','clarification','approved'].includes(entry.status??''))
    throw new HttpError('Цю заявку вже не можна скасувати.',409);
   const next={...entry,status:'cancelled'};
   await write(prefix+entry.id,next);
   await audit(c,actor,'service.request.cancel',entry.id,entry,next);
  }else if(action.kind==='decide'){
   if(entry.module!=='requests'||entry.status!=='pending'||entry.author===actor.id||(!canEdit&&account.role!=='admin'&&!(entry.targetUnit&&editors.has(entry.targetUnit))))throw new HttpError('Рішення недоступне.',403);
   if(action.status==='approved'&&absenceTypes.includes(entry.title)){
    if(!entry.from||!entry.to)throw new HttpError('У заявці немає коректного періоду.',409);
    const overlap=await c.query(`SELECT 1 FROM settings WHERE key LIKE 'service-entry:%'
     AND value->>'module'='requests' AND value->>'author'=$1 AND value->>'status'='approved'
     AND value->>'title'=ANY($2::text[]) AND value->>'id'<>$3
     AND (value->>'from')::timestamp < $5::timestamp + CASE WHEN length($5)=10 THEN interval '1 day' ELSE interval '0' END
     AND (value->>'to')::timestamp + CASE WHEN length(value->>'to')=10 THEN interval '1 day' ELSE interval '0' END > $4::timestamp
     LIMIT 1`,[entry.author,absenceTypes,entry.id,entry.from,entry.to]);
    if(overlap.rowCount)throw new HttpError('Цей період перетинається з уже погодженою відсутністю.',409);
   }
   if(action.status==='approved'&&entry.title==='Вступ до підрозділу'){
    const {rows:[unit]}=await c.query<{name:string}>('SELECT name FROM units WHERE id=$1 AND active',[entry.targetUnit]);
    if(!unit||!editors.has(entry.targetUnit!))throw new HttpError('Погодження доступне командуванню підрозділу призначення.',403);
    const defaults=recruitmentRequirements(unit.name);
    const rule={...defaults,...entry.recruitmentRequirements};
    if(rule.commanderApproval&&rule.minRank===null){
     const {rows:[configured]}=await c.query<{rank:number|null}>(`SELECT (value->>'minRank')::int AS rank FROM settings WHERE key=$1`,['recruitment:'+entry.targetUnit]);
     if(!configured?.rank)throw new HttpError('Командувач має підтвердити мінімальний ранг НЦП у редакторі набору.',409);
     rule.minRank=configured.rank;
    }
    if(rule.manualReview&&!action.manualVerified)throw new HttpError('Підтвердьте ручну перевірку вимог і доказів.',409);
    if(rule.commanderApproval&&(account.rank!==15||!action.body.trim()))throw new HttpError('Потрібне письмове погодження Командувача НГУ.',403);
    const {rows:[candidate]}=await c.query<{rank:number|null;days:number|null;sanction:boolean}>(`SELECT p.rank,
     CASE WHEN d.value->>'joinedOnVerified'='true' THEN (now() AT TIME ZONE 'Europe/Kyiv')::date-(d.value->>'joinedOn')::date END AS days,
     EXISTS(SELECT 1 FROM settings s WHERE s.key LIKE 'discipline:%' AND s.value->>'person'=p.id::text
      AND (s.value#>>'{decision,until}')::timestamptz>now() AND s.value->'lifted' IS NULL
      AND (s.value#>>'{appealResult,cancel}') IS DISTINCT FROM 'true' AND (s.value#>>'{externalDecision,cancel}') IS DISTINCT FROM 'true') AS sanction
     FROM personnel p LEFT JOIN settings d ON d.key='service:'||p.id::text
     WHERE p.user_id=$1 AND p.active`,[entry.author]);
    if(!candidate||(rule.minRank!==null&&(candidate.rank??0)<rule.minRank))
     throw new HttpError('Профіль або ранг не відповідає умовам набору.',409);
    if(rule.minDays&&(candidate.days??0)<rule.minDays)throw new HttpError('Недостатньо підтверджених днів служби.',409);
    if(rule.clearDiscipline&&candidate.sanction)throw new HttpError('У бійця є чинне дисциплінарне стягнення.',409);
   }
   const decidedAt=new Date().toISOString();
   let appliedAt=entry.appliedAt;
   if(action.status==='approved'&&entry.correction){
    const change=entry.correction;
    const {rows:[person]}=await c.query('SELECT id FROM personnel WHERE id=$1 AND user_id=$2 AND unit_id=$3 AND active FOR UPDATE',[change.profileId,entry.author,entry.unit]);
    if(!person||!canEdit)throw new HttpError('Кадрове призначення змінилося.',409);
    const key='service:'+person.id;
    const {rows:[details]}=await c.query('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[key]);
    if((details?.value?.[change.field]??null)!==change.previous)throw new HttpError('Поле вже змінилося. Потрібна нова заявка.',409);
    const nextDetails={...details?.value,[change.field]:change.value,
     ...(change.field==='joinedOn'?{joinedOnVerified:true,joinedOnVerifiedAt:decidedAt,joinedOnVerifiedBy:actor.id}:{})};
    await write(key,nextDetails);
    await audit(c,actor,'personnel.correction',person.id,{[change.field]:change.previous},{[change.field]:change.value,requestId:entry.id},action.body);
    appliedAt=decidedAt;
   }
   let transferApprovals=entry.transferApprovals;
   let status:Entry['status']=action.status;
   if(entry.title==='Переведення'){
    const side=action.side;
    const unit=side==='source'?entry.unit:entry.targetUnit;
    if(!side||!unit||!editors.has(unit))throw new HttpError('Оберіть сторону переведення в межах своїх повноважень.',403);
    if(action.status==='approved'){
     if(transferApprovals?.[side])throw new HttpError('Ця сторона вже погодила переведення.',409);
     const other=transferApprovals?.[side==='source'?'destination':'source'];
     if(other?.actorId===actor.id)throw new HttpError('Другу сторону має погодити інший уповноважений керівник.',409);
     transferApprovals={...transferApprovals,[side]:{actorId:actor.id,name:actor.name,at:decidedAt,body:action.body}};
     if(!other)status='pending';
    }else transferApprovals=undefined;
   }
   const next={...entry,status,appliedAt,transferApprovals,manualVerified:action.status==='approved'&&entry.title==='Вступ до підрозділу'?action.manualVerified:undefined,decision:action.body,decidedBy:actor.name,decidedAt};
   await write(prefix+entry.id,next);
   await audit(c,actor,'service.request.decision',entry.id,entry,next,action.body);
  }else if(action.kind==='transfer'){
   if(account.role!=='admin'&&!(account.rank>=13&&account.rank<=15))throw new HttpError('Переведення застосовує керівний склад.',403);
   if(entry.author===actor.id||entry.module!=='requests'||entry.title!=='Переведення'||entry.status!=='approved'||!entry.targetUnit||!editors.has(entry.targetUnit))
    throw new HttpError('Заявка недоступна для переведення.',409);
   if(entry.appliedAt)return {saved:true};
   const {rows:[person]}=await c.query(`SELECT p.id,p.unit_id,p.rank,u.role,d.value->>'leadershipRole' AS leadership_role
    FROM personnel p JOIN app_user u ON u.id=p.user_id LEFT JOIN settings d ON d.key='service:'||p.id::text
    WHERE p.user_id=$1 AND p.active FOR UPDATE OF p`,[entry.author]);
   if(!person||person.unit_id!==entry.unit||person.role==='admin'||person.rank>=11||(person.leadership_role&&person.leadership_role!=='member'))
    throw new HttpError('Кадровий профіль змінився або потребує окремого призначення.',409);
   await c.query('UPDATE personnel SET unit_id=$1 WHERE id=$2',[entry.targetUnit,person.id]);
   const next={...entry,appliedAt:new Date().toISOString()};
   const orderId=await issueOrder(entry,entry.targetUnit,next.appliedAt);
   await write(prefix+entry.id,{...next,orderId});
   await audit(c,actor,'unit.transfer',person.id,{unitId:person.unit_id},{unitId:entry.targetUnit,entryId:entry.id,orderId,member:entry.author});
  }else if(action.kind==='attendance'){
   if(entry.module!=='calendar'||entry.draft||!entry.unit||!entry.date)throw new HttpError('Це не подія календаря.',409);
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
   if(tracking&&entry.requirementId){
    const {profile}=await promotionProgress(member!,c);
    if(profile){
     const confirmationKey='promotion-confirmation:'+profile.id+':'+profile.cycle+':'+entry.requirementId;
     const {rows:[before]}=await c.query('SELECT value FROM settings WHERE key=$1',[confirmationKey]);
     if(action.status==='present'&&!before&&(await promotionChecklist(profile,c)).some(item=>item.rule.id===entry.requirementId)){
      const confirmation={id:randomUUID(),source:'/portal/calendar?entry='+entry.id,at:new Date().toISOString(),by:actor.id,eventId:entry.id};
      await write(confirmationKey,confirmation);
      await audit(c,actor,'promotion.requirement.attendance',profile.id,null,confirmation);
     }else if(action.status==='absent'&&before?.value.eventId===entry.id){
      await c.query('DELETE FROM settings WHERE key=$1',[confirmationKey]);
      await audit(c,actor,'promotion.requirement.attendance',profile.id,before.value,null);
     }
    }
   }
   await audit(c,actor,'service.attendance',entry.id,previous?.value??null,next);
  }else if(action.kind==='publish-draft'){
   if(!canEdit||!entry.draft)throw new HttpError('Публікація чернетки недоступна.',403);
   if(entry.replaces){
    const {rows:[previous]}=await c.query<{value:Entry}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+entry.replaces]);
    if(!previous||previous.value.module!==entry.module||previous.value.unit!==entry.unit||previous.value.archived||previous.value.draft)
     throw new HttpError('Попередня редакція вже змінилася.',409);
    await write(prefix+entry.replaces,{...previous.value,archived:true});
    await audit(c,actor,'service.archive',entry.replaces,previous.value,{...previous.value,archived:true});
   }
   const next={...entry,draft:false,createdAt:new Date().toISOString()};
   await write(prefix+entry.id,next);
   await audit(c,actor,'service.publish',entry.id,entry,next);
  }else if(action.kind==='training-proof'){
   if(entry.module!=='training'||entry.draft||!entry.requiresProof||(!account.id||entry.unit!==account.unit_id&&!(await c.query('SELECT 1 FROM settings WHERE key=$1',['service-result:'+entry.id+':'+actor.id])).rowCount))throw new HttpError('Етап недоступний для подання доказів.',403);
   const key='service-result:'+entry.id+':'+actor.id;
   const {rows:[previous]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   if(previous?.value?.status==='passed')throw new HttpError('Етап уже зараховано.',409);
   const next={...previous?.value,entry:entry.id,unit:entry.unit,member:actor.id,links:[...new Set(action.links)]};
   await write(key,next);
   await audit(c,actor,'service.training.proof',entry.id,previous?.value??null,next);
  }else if(action.kind==='archive'){
   if(!canEdit||entry.module==='requests'||entry.reportId)throw new HttpError('Архівування недоступне.',403);
   await write(prefix+entry.id,{...entry,archived:true});
   await audit(c,actor,'service.archive',entry.id,entry,{...entry,archived:true});
  }else if(action.kind==='enroll'){
   if(!canEdit||entry.module!=='training'||entry.unit!==trainingUnit?.id||entry.draft||
    !(await c.query('SELECT 1 FROM personnel WHERE user_id=$1 AND active',[action.member])).rowCount)
    throw new HttpError('Призначити етап КМБ може командування НЦП.',403);
   const next={entry:entry.id,unit:entry.unit,member:action.member};
   const saved=await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',['service-result:'+entry.id+':'+action.member,JSON.stringify(next)]);
   if(saved.rowCount)await audit(c,actor,'service.training.enroll',entry.id,null,next);
  }else{
   if(!canEdit||entry.module!=='training'||entry.unit!==trainingUnit?.id||entry.draft||!(await c.query('SELECT id FROM personnel WHERE user_id=$1 AND active AND (unit_id=$2 OR EXISTS(SELECT 1 FROM settings WHERE key=$3))',[action.member,entry.unit,'service-result:'+entry.id+':'+action.member])).rowCount)
    throw new HttpError('Результат можна вказати для бійця цього підрозділу.',403);
   const key='service-result:'+entry.id+':'+action.member;
   const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
   if(action.status==='passed'&&entry.requiresProof&&!old?.value?.links?.length)throw new HttpError('Для цього етапу боєць має подати докази.',409);
   const next={...old?.value,entry:entry.id,unit:entry.unit,member:action.member,status:action.status,note:action.note};
   await write(key,next);
   await audit(c,actor,'service.training.result',entry.id,old?.value??null,next);
  }
  return {saved:true};
 });
}
