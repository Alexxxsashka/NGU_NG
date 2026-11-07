import 'server-only';
import {z} from 'zod';
import {transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {evidence} from './validation';
import {MAX_TASK_EVIDENCE} from './report-limits';
import type {Viewer} from './domain';

export async function clarifyReport(input:unknown,actor:Viewer){
 const p=z.object({itemId:z.uuid(),links:z.array(evidence).min(1).max(MAX_TASK_EVIDENCE)}).parse(input);
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[item]}=await c.query(`SELECT i.id,i.status,i.reason,r.id AS report_id FROM report_items i JOIN reports r ON r.id=i.report_id
   WHERE i.id=$1 AND (r.author_id=$2 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$2 AND p.active))
   AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key IN ('report-paid:'||r.id::text,'award-order:'||r.week_start::text))
   FOR UPDATE OF i`,[p.itemId,actor.id]);
  if(!item||item.status!=='clarification')throw new HttpError('Це завдання недоступне для уточнення.',409);
  const {rows}=await c.query<{url:string;sort_order:number}>('SELECT url,sort_order FROM evidence_links WHERE item_id=$1 ORDER BY sort_order',[item.id]);
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
