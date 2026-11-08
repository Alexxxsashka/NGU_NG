import 'server-only';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit,lockAdmin} from './admin';
import {HttpError} from './security';
import {week} from './validation';
import type {Viewer} from './domain';

export type AwardPreviewRow={static_id:string;name:string;estimate:string|null;cap:string|null;approved:string|null;manual:number};
export type AwardChange={staticId:string;before:string|null;after:string|null};
type Correction={id:string;week:string;staticId:string;delta:string;reason:string;createdAt:string};
type OrderListRow={week:string;number:string;paidAt:string;total:string;recipientCount:number};

const previewSql=`SELECT r.static_id,min(r.last_name||' '||r.first_name) AS name,sum(i.estimated_amount)::text AS estimate,
 a.cap::text AS cap,sum(i.approved_amount)::text AS approved,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM audit_logs log WHERE log.entity_id=i.id::text AND log.action='award.adjust'
  AND (log.after->>'estimatedAmount')::numeric IS NOT DISTINCT FROM i.estimated_amount))::int AS manual
 FROM reports r JOIN report_items i ON i.report_id=r.id AND i.status='approved'
 LEFT JOIN weekly_awards a ON a.week_start=r.week_start AND a.static_id=r.static_id
 WHERE r.week_start=$1 AND NOT EXISTS(SELECT 1 FROM settings p WHERE p.key='report-paid:'||r.id::text)
 GROUP BY r.static_id,a.cap ORDER BY name,r.static_id`;

export function awardPreview(day:string,client?:PoolClient){
 return client?client.query<AwardPreviewRow>(previewSql,[day]).then(result=>result.rows):query<AwardPreviewRow>(previewSql,[week.parse(day)]);
}

export type AwardBlocker={id:string;number:string;name:string;pending:number;clarification:number;missing:number;total:number};
export function awardBlockers(day:string){
 return query<AwardBlocker>(`WITH blocked AS (
  SELECT r.id,r.number,r.last_name||' '||r.first_name AS name,r.submitted_at,
   count(*) FILTER(WHERE i.status='pending')::int AS pending,
   count(*) FILTER(WHERE i.status='clarification')::int AS clarification,
   count(*) FILTER(WHERE i.status='approved' AND i.approved_amount IS NULL)::int AS missing
  FROM reports r JOIN report_items i ON i.report_id=r.id
  WHERE r.week_start=$1 AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key='report-paid:'||r.id::text)
  GROUP BY r.id
 )
 SELECT id,number,name,pending,clarification,missing,count(*) OVER()::int AS total FROM blocked
 WHERE pending+clarification+missing>0 ORDER BY submitted_at,id LIMIT 30`,[week.parse(day)]);
}

export async function awardOrders(){
 const [orders,corrections]=await Promise.all([
  query<OrderListRow>(`SELECT value->>'week' AS week,value->>'number' AS number,value->>'paidAt' AS "paidAt",value->>'total' AS total,
   jsonb_array_length(value->'recipients') AS "recipientCount" FROM settings WHERE key LIKE 'award-order:%' ORDER BY key DESC`),
  query<{value:Correction}>("SELECT value FROM settings WHERE key LIKE 'award-correction:%' ORDER BY value->>'createdAt' DESC"),
 ]);
 return {orders,corrections:corrections.map(row=>row.value)};
}

export async function correctAwardOrder(input:unknown,actor:Viewer){
 const p=z.object({week,staticId:z.string().regex(/^[0-9]{1,30}$/),delta:z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/).refine(v=>Number(v)!==0),reason:z.string().trim().min(5).max(2000)}).parse(input);
 return transaction(async c=>{
  await lockAdmin(c,actor);
  const {rows:[order]}=await c.query("SELECT value FROM settings WHERE key=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(value->'recipients') person WHERE person->>'staticId'=$2)",['award-order:'+p.week,p.staticId]);
  if(!order)throw new HttpError('Цього отримувача немає в наказі.',404);
  const entry={...p,id:randomUUID(),createdAt:new Date().toISOString()};
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2)',['award-correction:'+entry.id,JSON.stringify(entry)]);
  await audit(c,actor,'award.correction',entry.id,null,entry,p.reason);
  return {saved:true};
 });
}

export function awardRecipients(day:string){
 return query<{staticId:string;name:string;amount:string;paidAt:string|null;paidBy:string|null}>(`
  SELECT person->>'staticId' AS "staticId",person->>'name' AS name,person->>'amount' AS amount,
   payment.value->>'paidAt' AS "paidAt",payment.value->>'paidBy' AS "paidBy"
  FROM settings orders CROSS JOIN LATERAL jsonb_array_elements(orders.value->'recipients') AS person
  LEFT JOIN settings payment ON payment.key='award-recipient-paid:'||$2||':'||(person->>'staticId')
  WHERE orders.key=$1 ORDER BY person->>'name',person->>'staticId'`,['award-order:'+week.parse(day),day]);
}

export async function markAwardRecipientPaid(input:unknown,actor:Viewer){
 const p=z.object({week,staticId:z.string().regex(/^[0-9]{1,30}$/)}).parse(input);
 return transaction(async c=>{
  await lockAdmin(c,actor);
  const {rows:[recipient]}=await c.query<{person:{amount:string}}>(`
   SELECT person FROM settings CROSS JOIN LATERAL jsonb_array_elements(value->'recipients') AS person
   WHERE key=$1 AND person->>'staticId'=$2`,['award-order:'+p.week,p.staticId]);
  if(!recipient)throw new HttpError('Цього отримувача немає в наказі.',404);
  const key='award-recipient-paid:'+p.week+':'+p.staticId;
  const payment={...p,amount:recipient.person.amount,paidAt:new Date().toISOString(),paidBy:actor.name};
  const saved=await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING',[key,JSON.stringify(payment)]);
  if(saved.rowCount)await audit(c,actor,'award.recipient.paid',key,null,payment);
  return {saved:true};
 });
}
