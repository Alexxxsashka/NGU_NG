import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import type {Viewer} from './domain';

const text=z.string().trim().min(5).max(2000);
const links=z.array(evidence).max(20);
const id=z.uuid();
const sanction=z.enum(['remark','reprimand','severe']);
const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('file'),person:id,rule:text,body:text,links}),
 z.object({kind:z.literal('explain'),id,body:text,links}),
 z.object({kind:z.literal('decide'),id,outcome:z.enum(['dismiss',...sanction.options]),body:text}),
 z.object({kind:z.literal('acknowledge'),id}),
 z.object({kind:z.literal('request-work'),id,body:text}),
 z.object({kind:z.literal('assign-work'),id,body:text}),
 z.object({kind:z.literal('submit-work'),id,body:text,links:links.min(1)}),
 z.object({kind:z.literal('review-work'),id,accept:z.boolean(),body:text}),
 z.object({kind:z.literal('lift'),id,body:text}),
 z.object({kind:z.literal('appeal'),id,body:text,links}),
 z.object({kind:z.literal('resolve-appeal'),id,cancel:z.boolean(),body:text}),
]);
type Note={body:string;links?:string[];at:string};
type Case={
 id:string;person:string;name:string;author:string;at:string;rule:string;body:string;links:string[];
 explanation?:Note;decision?:Note&{by:string;outcome:'dismiss'|z.infer<typeof sanction>;until?:string};
 acknowledged?:string;lifted?:Note;appeal?:Note;appealResult?:Note&{cancel:boolean};
 work?:{request:Note;assignment?:Note;submission?:Note;review?:Note&{accept:boolean}};
};
const prefix='discipline:';
const rolesSql=`SELECT p.id,p.rank,coalesce(u.name ~* '^(ВСП|ЗВП)(\\s|$)|військова служба правопорядку',false) AS inspector
 FROM personnel p LEFT JOIN units u ON u.id=p.unit_id AND u.active WHERE p.user_id=$1 AND p.active`;
export async function canOpenDiscipline(actorId:string){
 const [role]=await query<Role>(rolesSql,[actorId]);
 return role?.rank===15||!!role?.inspector;
}
type Role={id:string;rank:number;inspector:boolean};
const active=(entry:Case,now:Date)=>!!entry.decision?.until&&Date.parse(entry.decision.until)>now.getTime()&&!entry.lifted&&!entry.appealResult?.cancel;
const calendarDay=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(date);
export async function disciplineCases(actor:Viewer,staff:boolean){
 const [role]=await query<Role>(rolesSql,[actor.id]);
 const leader=role?.rank===15;
 if(staff&&!leader&&!role?.inspector)throw new HttpError('Доступ до дисциплінарної черги обмежено.',403);
 const cases=await query<{value:Case}>(`SELECT value FROM settings WHERE key LIKE 'discipline:%' AND
  (value->>'person'=$1 OR ($2 AND ($3 OR value->>'author'=$4)))
  ORDER BY value->>'at' DESC,key LIMIT 100`,[role?.id??null,staff,leader,actor.id]);
 const people=staff?await query<{id:string;name:string;static_id:string}>(`SELECT id,first_name||' '||last_name AS name,static_id FROM personnel
  WHERE active AND rank IS DISTINCT FROM 15 AND user_id IS NOT NULL AND user_id<>$1 AND ($2 OR NOT EXISTS(SELECT 1 FROM units WHERE units.id=personnel.unit_id AND name ~* '^ссо|nord division')) ORDER BY last_name,first_name`,[actor.id,leader]):[];
 return {cases:cases.map(({value})=>({...value,active:active(value,new Date()),own:value.person===role?.id})),people,leader};
}

export async function changeDiscipline(actor:Viewer,input:unknown){
 const action=operation.parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[role]}=await c.query<Role>(rolesSql,[actor.id]);
  const leader=role?.rank===15;
  const now=new Date(),at=now.toISOString();
  let entry:Case,previous:Case|null=null;
  if(action.kind==='file'){
   if(!role?.inspector&&!leader)throw new HttpError('Фіксація доступна ВСП та Командувачу.',403);
   const {rows:[target]}=await c.query<{name:string}>(`SELECT first_name||' '||last_name AS name FROM personnel
    WHERE id=$1 AND active AND rank IS DISTINCT FROM 15 AND user_id<>$2 AND ($3 OR NOT EXISTS(SELECT 1 FROM units WHERE units.id=personnel.unit_id AND name ~* '^ссо|nord division'))`,[action.person,actor.id,leader]);
   if(!target)throw new HttpError('Профіль недоступний.',403);
   entry={id:randomUUID(),person:action.person,name:target.name,author:actor.id,at,rule:action.rule,body:action.body,links:action.links};
  }else{
   const {rows:[row]}=await c.query<{value:Case}>('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[prefix+action.id]);
   if(!row)throw new HttpError('Справу не знайдено.',404);
   previous=row.value;entry={...previous};
   const own=role?.id===entry.person;
   const subjectAction=['explain','acknowledge','request-work','submit-work','appeal'].includes(action.kind);
   if(subjectAction?!own:!leader||own)throw new HttpError('Дія поза межами ваших повноважень.',403);
   const unavailable=()=>new HttpError('Дія недоступна в поточному стані справи.',409);
   switch(action.kind){
    case 'explain':
     if(entry.decision)throw unavailable();
     entry.explanation={body:action.body,links:action.links,at};break;
    case 'decide': {
     if(entry.decision)throw unavailable();
     const day=86400000;
     if(action.outcome!=='dismiss'&&Date.parse(calendarDay(now))-Date.parse(calendarDay(new Date(entry.at)))>7*day)
      throw new HttpError('Строк застосування стягнення минув.',409);
     if(action.outcome==='reprimand'||action.outcome==='severe'){
      const {rows}=await c.query<{value:Case}>("SELECT value FROM settings WHERE key LIKE 'discipline:%' AND value->>'person'=$1",[entry.person]);
      const count=rows.reduce((total,{value})=>total+(active(value,now)?value.decision?.outcome==='severe'?2:1:0),0);
      if(count+(action.outcome==='severe'?2:1)>3)throw new HttpError('Досягнуто межу активних доган. Потрібне окреме кадрове рішення.',409);
     }
     entry.decision={body:action.body,by:actor.id,outcome:action.outcome,at,
      ...(action.outcome==='reprimand'||action.outcome==='severe'?{until:new Date(now.getTime()+7*day).toISOString()}:{})};
     break;
    }
    case 'acknowledge':
     if(!entry.decision)throw unavailable();
     if(entry.acknowledged)return {saved:true};
     entry.acknowledged=at;break;
    case 'request-work':
     if(!active(entry,now)||entry.work)throw unavailable();
     entry.work={request:{body:action.body,at}};break;
    case 'assign-work':
     if(!active(entry,now)||!entry.work||entry.work.assignment)throw unavailable();
     entry.work={...entry.work,assignment:{body:action.body,at}};break;
    case 'submit-work':
     if(!active(entry,now)||!entry.work?.assignment||(entry.work.submission&&entry.work.review?.accept!==false))throw unavailable();
     entry.work={request:entry.work.request,assignment:entry.work.assignment,submission:{body:action.body,links:action.links,at}};break;
    case 'review-work':
     if(!active(entry,now)||!entry.work?.submission||entry.work.review)throw unavailable();
     entry.work={...entry.work,review:{body:action.body,accept:action.accept,at}};break;
    case 'lift':
     if(!active(entry,now)||!entry.work?.review?.accept)throw unavailable();
     entry.lifted={body:action.body,at};break;
    case 'appeal':
     if(!entry.acknowledged||entry.appeal||entry.decision?.outcome==='dismiss'||now.getTime()-Date.parse(entry.acknowledged)>86400000)throw unavailable();
     entry.appeal={body:action.body,links:action.links,at};break;
    case 'resolve-appeal':
     if(!entry.appeal||entry.appealResult||entry.decision?.by===actor.id)throw unavailable();
     entry.appealResult={body:action.body,cancel:action.cancel,at};break;
   }
  }
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[prefix+entry.id,JSON.stringify(entry)]);
  await audit(c,actor,'discipline.'+action.kind,entry.id,previous,entry);
  return {saved:true};
 });
}
