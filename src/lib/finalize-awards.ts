import 'server-only';
import {createHash} from 'node:crypto';
import Decimal from 'decimal.js';
import {z} from 'zod';
import {transaction} from '@/db';
import {audit,lockAdmin} from './admin';
import {awardPreview,type AwardChange} from './award-register';
import {recalculateAwards} from './recalculate-awards';
import {HttpError} from './security';
import {week} from './validation';
import type {Viewer} from './domain';
import type {AwardOrder} from './award-order-docx';

export async function recalculateAwardWeek(input:unknown,actor:Viewer){
 const p=z.object({week,token:z.string().regex(/^[a-f0-9]{64}$/).optional()}).parse(input);
 return transaction(async c=>{
  await lockAdmin(c,actor);
  if((await c.query('SELECT 1 FROM settings WHERE key=$1',['award-order:'+p.week])).rowCount)
   throw new HttpError('Виплату за цей тиждень уже зафіксовано.',409);
  const before=await awardPreview(p.week,c);
  const previousAmounts=new Map(before.map(row=>[row.static_id,row.approved]));
  await c.query('SAVEPOINT award_recalculation');
  const recalculated=await recalculateAwards(c,p.week);
  const after=await awardPreview(p.week,c);
  const changes:AwardChange[]=after.flatMap(row=>{
   const previous=previousAmounts.get(row.static_id)??null;
   return previous===row.approved?[]:[{staticId:row.static_id,before:previous,after:row.approved}];
  });
  const totalDifference=changes.reduce((sum,row)=>sum.plus(row.after??0).minus(row.before??0),new Decimal(0)).toFixed(2);
  const token=createHash('sha256').update(JSON.stringify([p.week,before,after,recalculated])).digest('hex');
  if(!p.token){
   await c.query('ROLLBACK TO SAVEPOINT award_recalculation');
   return {recalculated,changes,totalDifference,token};
  }
  if(p.token!==token)throw new HttpError('Розрахунок змінився. Перегляньте оновлені суми перед застосуванням.',409);
  await audit(c,actor,'award.recalculate',p.week,null,{recalculated,changes,totalDifference});
  return {recalculated,changes,totalDifference,token};
 });
}

export async function finalizeAwards(input:unknown,actor:Viewer):Promise<AwardOrder>{
 const p=z.object({week,confirmed:z.literal(true)}).parse(input);
 return transaction(async c=>{
  await lockAdmin(c,actor);
  const orderKey='award-order:'+p.week;
  const {rows:[stored]}=await c.query<{value:AwardOrder}>('SELECT value FROM settings WHERE key=$1',[orderKey]);
  if(stored)return stored.value;
  const {rows:[period]}=await c.query('SELECT open FROM reporting_periods WHERE week_start=$1 FOR UPDATE',[p.week]);
  if(!period||period.open)throw new HttpError('Спочатку закрийте прийом звітів за цей тиждень.',409);
  const recalculated=await recalculateAwards(c,p.week);
  const {rows}=await c.query<{id:string;static_id:string;first_name:string;last_name:string;pending:number;amount:string}>(`
   SELECT r.id,coalesce(nullif(ltrim(r.static_id,'0'),''),'0') AS static_id,r.first_name,r.last_name,
    count(*) FILTER(WHERE i.status IN ('pending','clarification') OR (i.status='approved' AND i.approved_amount IS NULL))::int AS pending,
    coalesce(sum(i.approved_amount) FILTER(WHERE i.status='approved'),0)::text AS amount
   FROM reports r JOIN report_items i ON i.report_id=r.id
   WHERE r.week_start=$1 AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key='report-paid:'||r.id::text)
   GROUP BY r.id ORDER BY r.submitted_at DESC,r.id DESC`,[p.week]);
  const pending=rows.filter(row=>row.pending>0).length;
  if(pending)throw new HttpError('Завершіть перевірку звітів і погодьте суми. Залишилося звітів: '+pending+'.',409);
  const {rows:[blocked]}=await c.query<{count:number}>(`SELECT count(DISTINCT r.static_id)::int AS count
   FROM reports r JOIN personnel p ON (p.id=r.personnel_id OR (r.personnel_id IS NULL AND ltrim(p.static_id,'0')=ltrim(r.static_id,'0')))
   JOIN settings d ON d.key LIKE 'discipline:%' AND d.value->>'person'=p.id::text
   WHERE r.week_start=$1 AND (d.value#>>'{decision,until}')::timestamptz>now()
   AND d.value->'lifted' IS NULL AND (d.value#>>'{appealResult,cancel}') IS DISTINCT FROM 'true' AND (d.value#>>'{externalDecision,cancel}') IS DISTINCT FROM 'true'
   AND EXISTS(SELECT 1 FROM report_items i WHERE i.report_id=r.id AND i.status='approved' AND i.approved_amount>0)
   AND NOT EXISTS(SELECT 1 FROM settings payment WHERE payment.key='report-paid:'||r.id::text)`,[p.week]);
  if(blocked.count)throw new HttpError('Преміювання заблоковано через чинні догани. Бійців із доганою: '+blocked.count+'.',409);
  const paidAt=new Date().toISOString();
  const recipients=new Map<string,AwardOrder['recipients'][number]>();
  const payments=rows.filter(row=>new Decimal(row.amount).gt(0));
  if(!payments.length)throw new HttpError('За цей тиждень немає погоджених сум до виплати.',409);
  for(const row of payments){
   const previous=recipients.get(row.static_id);
   recipients.set(row.static_id,{
    staticId:row.static_id,name:previous?.name??row.last_name+' '+row.first_name,
    firstName:previous?.firstName??row.first_name,lastName:previous?.lastName??row.last_name,
    amount:new Decimal(previous?.amount??0).plus(row.amount).toFixed(2),
   });
  }
  const order:AwardOrder={
   number:'НГУ-П-'+p.week.replaceAll('-',''),week:p.week,paidAt,
   total:payments.reduce((sum,row)=>sum.plus(row.amount),new Decimal(0)).toFixed(2),
   recipients:[...recipients.values()].sort((a,b)=>a.name.localeCompare(b.name,'uk')||a.staticId.localeCompare(b.staticId)),
  };
  await c.query(`INSERT INTO settings(key,value)
   SELECT 'report-paid:'||entry.id,jsonb_build_object('amount',entry.amount,'paidAt',$2::text)
   FROM jsonb_to_recordset($1::jsonb) AS entry(id text,amount text)`,[JSON.stringify(payments.map(({id,amount})=>({id,amount}))),paidAt]);
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2)',[orderKey,JSON.stringify(order)]);
  await audit(c,actor,'award.order',p.week,null,{number:order.number,total:order.total,recipients:order.recipients.length,recalculated});
  return order;
 });
}
