import 'server-only';
import Decimal from 'decimal.js';
import {currentWeek} from './domain';
import {z} from 'zod';
import {transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import {MAX_TASK_EVIDENCE} from './report-limits';
import type {Viewer} from './domain';

export async function clarifyReport(input:unknown,actor:Viewer){
 const p=z.object({itemId:z.uuid(),quantity:z.number().int().min(1).max(10000).optional(),links:z.array(evidence).min(1).max(MAX_TASK_EVIDENCE)}).parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[item]}=await c.query(`SELECT i.*,r.week_start,r.id AS report_id FROM report_items i JOIN reports r ON r.id=i.report_id
   WHERE i.id=$1 AND (r.author_id=$2 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$2 AND p.active))
   AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key IN ('report-paid:'||r.id::text,'award-order:'||r.week_start::text))
   FOR UPDATE OF i`,[p.itemId,actor.id]);
  if(!item||(p.quantity===undefined?item.status!=='clarification':!['pending','approved','clarification'].includes(item.status)||item.week_start!==currentWeek()))throw new HttpError('Це завдання недоступне для уточнення.',409);
  const {rows}=await c.query<{url:string;sort_order:number}>('SELECT url,sort_order FROM evidence_links WHERE item_id=$1 ORDER BY sort_order',[item.id]);
  if(p.quantity!==undefined){
   if(!(await c.query('SELECT 1 FROM reporting_periods WHERE week_start=$1 AND open',[item.week_start])).rowCount)
    throw new HttpError('Прийом звітів за цей тиждень закрито.',409);
   const urls=[...new Set(p.links)];
   const estimated=item.reward_rate==null||item.rank_multiplier==null?null:new Decimal(item.reward_rate).mul(item.rank_multiplier).mul(p.quantity).toFixed(2);
   await c.query('DELETE FROM evidence_links WHERE item_id=$1',[item.id]);
   await c.query('INSERT INTO evidence_links(item_id,url,sort_order) SELECT $1,url,(n-1)::int FROM unnest($2::text[]) WITH ORDINALITY AS links(url,n)',[item.id,urls]);
   await c.query("UPDATE report_items SET quantity=$2,points=points_rate*$2,estimated_amount=$3,approved_amount=NULL,status='pending',reason=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=$1",[item.id,p.quantity,estimated]);
   await audit(c,actor,'report.amend-item',item.id,{status:item.status,quantity:item.quantity,links:rows.map(row=>row.url),amount:item.approved_amount},{status:'pending',quantity:p.quantity,links:urls});
   return {saved:true};
  }
  const existing=new Set(rows.map(row=>row.url));
  const added=[...new Set(p.links)].filter(url=>!existing.has(url));
  if(!added.length)throw new HttpError('Додайте нові посилання на докази.');
  if(rows.length+added.length>MAX_TASK_EVIDENCE)throw new HttpError('Перевищено ліміт посилань для цього завдання.');
  const offset=(rows.at(-1)?.sort_order??-1)+1;
  await c.query('INSERT INTO evidence_links(item_id,url,sort_order) SELECT $1,url,$3::int+(n-1)::int FROM unnest($2::text[]) WITH ORDINALITY AS links(url,n)',[item.id,added,offset]);
  await c.query("UPDATE report_items SET status='pending',reason=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=$1",[item.id]);
  await audit(c,actor,'report.clarify',item.id,{status:item.status,reason:item.reason},{status:'pending',added,reportId:item.report_id});
  return {saved:true};
 });
}
