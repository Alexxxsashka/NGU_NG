import 'server-only';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {accessibleUnits} from './unit-page';
import type {Viewer} from './domain';

const confirmation=z.object({
 program:z.enum(['kmb','ukmb']),course:z.boolean(),rankFive:z.boolean(),external:z.boolean(),
 lectures:z.array(z.string().trim().min(1).max(500)).max(5),
 assessments:z.array(z.string().trim().min(1).max(500)).max(5),
 exercises:z.array(z.string().trim().min(1).max(500)).max(2),
 orientation:z.boolean(),oath:z.boolean(),
});
type Ticket=z.infer<typeof confirmation>&{issued?:{at:string;by:string;reference:string}};
const profileSql=`SELECT p.id,p.unit_id,p.rank,p.active,p.first_name||' '||p.last_name AS name,p.static_id,
 CASE WHEN details.value->>'joinedOnVerified'='true' THEN details.value->>'joinedOn' END AS joined,
 t.value AS ticket FROM personnel p LEFT JOIN settings details ON details.key='service:'||p.id::text
 LEFT JOIN settings t ON t.key='military-ticket:'||p.id::text`;
type Profile={id:string;unit_id:string|null;rank:number|null;active:boolean;name:string;static_id:string;joined:string|null;ticket:Ticket|null};

export function ticketProgress(profile:Profile){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
 const days=profile.joined?Math.floor((Date.parse(today)-Date.parse(profile.joined))/86400000):null;
 const t=profile.ticket;
 const required=t?.program==='ukmb'?3:7;
 const ready=profile.active&&days!==null&&days>=required&&!!t&&(t.program==='kmb'
  ?t.course&&t.rankFive
  :t.external&&t.lectures.length===5&&t.assessments.length===5&&t.exercises.length===2&&t.orientation&&t.oath);
 return {days,required,ready};
}

export async function militaryTickets(actor:Viewer,unitId:string|null){
 if(!unitId){
  const [profile]=await query<Profile>(profileSql+' WHERE p.user_id=$1',[actor.id]);
  return {profiles:profile?[{...profile,...ticketProgress(profile)}]:[]};
 }
 const [unit]=await accessibleUnits(actor.id,z.uuid().parse(unitId));
 if(!unit?.editor)throw new HttpError('Керування квитками недоступне.',403);
 const profiles=await query<Profile>(profileSql+' WHERE p.unit_id=$1 AND p.active AND p.user_id IS NOT NULL ORDER BY p.last_name,p.id',[unitId]);
 return {profiles:profiles.map(profile=>({...profile,...ticketProgress(profile)}))};
}

export async function changeMilitaryTicket(actor:Viewer,input:unknown){
 const action=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('verify-date'),id:z.uuid(),date:z.iso.date()}),
  z.object({kind:z.literal('confirm'),id:z.uuid(),ticket:confirmation}),
  z.object({kind:z.literal('issue'),id:z.uuid(),reference:z.string().trim().max(120)}),
 ]).parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[profile]}=await c.query<Profile>(profileSql+' WHERE p.id=$1 AND p.active AND p.user_id IS NOT NULL AND p.user_id<>$2 FOR UPDATE OF p',[action.id,actor.id]);
  const [unit]=profile?.unit_id?await accessibleUnits(actor.id,profile.unit_id,c):[];
  if(!unit?.editor)throw new HttpError('Профіль поза межами ваших повноважень.',403);
  if(action.kind==='verify-date'){
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
   if(action.date>today)throw new HttpError('Дата вступу не може бути в майбутньому.');
   const key='service:'+profile.id;
   const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[key]);
   const next={...old?.value,joinedOn:action.date,joinedOnVerified:true,joinedOnVerifiedBy:actor.id,joinedOnVerifiedAt:new Date().toISOString()};
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(next)]);
   await audit(c,actor,'personnel.joined-on.verify',profile.id,{joinedOn:profile.joined},{joinedOn:action.date});
   return {saved:true};
  }
  if(profile.ticket?.issued){
   if(action.kind==='issue')return {saved:true};
   throw new HttpError('Квиток уже видано.',409);
  }
  if(action.kind==='confirm'){
   for(const records of [action.ticket.lectures,action.ticket.assessments,action.ticket.exercises]){
    if(new Set(records.map(record=>record.toLocaleLowerCase('uk'))).size!==records.length)throw new HttpError('Кожен результат можна врахувати один раз.');
   }
  }else if(!ticketProgress(profile).ready)throw new HttpError('Умови видачі квитка ще не виконані.',409);
  const next=action.kind==='confirm'?action.ticket:{...profile.ticket!,issued:{at:new Date().toISOString(),by:actor.id,reference:action.reference}};
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['military-ticket:'+profile.id,JSON.stringify(next)]);
  await audit(c,actor,'military-ticket.'+action.kind,profile.id,profile.ticket,next);
  return {saved:true};
 });
}
