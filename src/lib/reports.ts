import 'server-only';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import {taskReward} from './rewards';
import { query,transaction } from '@/db';
import { viewer } from './auth';
import { hash,HttpError,throttle } from './security';
import { submitSchema,week,itemStatus } from './validation';
import { currentWeek,reportStatus } from './domain';
import type { Viewer } from './domain';
export async function submitReport(request:Request,input:unknown){
  const p=submitSchema.parse(input);await throttle(request,'submit',30);
  const u=await viewer(request.headers);const digest=hash(JSON.stringify({...p,contextToken:undefined,idempotencyKey:undefined}));
  const context=hash((u?.id||'anonymous')+':'+p.contextToken);
  return transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[p.idempotencyKey]);
    const old=(await c.query('SELECT id,number,payload_hash,context_hash FROM reports WHERE idempotency_key=$1',[p.idempotencyKey])).rows[0];
    if(old){if(old.payload_hash!==digest||old.context_hash!==context)throw new HttpError('Конфлікт повторного подання.',409);return {reportId:old.id,number:old.number,week:p.week};}
    const period=(await c.query('SELECT open FROM reporting_periods WHERE week_start=$1 FOR SHARE',[p.week])).rows[0];
    if(!period?.open)throw new HttpError('Прийом за цей тиждень закрито.',409);
    const unit=(await c.query('SELECT * FROM units WHERE id=$1 AND active=true FOR SHARE',[p.unitId])).rows[0];
    const rank=(await c.query('SELECT * FROM ranks WHERE id=$1 FOR SHARE',[p.rank])).rows[0];
    if(!unit||!rank)throw new HttpError('Оберіть чинні підрозділ і звання.');
    const found=(await c.query('SELECT * FROM tasks WHERE id=ANY($1::uuid[]) FOR SHARE',[p.entries.map(e=>e.taskId)])).rows;
    const prepared=p.entries.map(e=>{const t=found.find(t=>t.id===e.taskId);if(!t||!t.active||(t.unit_id&&t.unit_id!==p.unitId)||t.version!==e.version)throw new HttpError('Довідник змінився. Оновіть завдання; докази залишаться у формі.',409);return {e,t};});
    const profile=u?(await c.query('SELECT id FROM personnel WHERE user_id=$1 AND static_id=$2 AND active=true',[u.id,p.staticId])).rows[0]:null;
    const cap=(await c.query("SELECT value FROM settings WHERE key='weeklyCap'")).rows[0]?.value??null;
    await c.query('INSERT INTO weekly_awards(static_id,week_start,cap) VALUES($1,$2,$3) ON CONFLICT(static_id,week_start) DO NOTHING',[p.staticId,p.week,cap]);
    const id=randomUUID(),number='НГУ-'+id.slice(0,8).toUpperCase();
    await c.query(`INSERT INTO reports(id,number,author_id,personnel_id,static_id,first_name,last_name,rank,unit_id,unit_name,week_start,idempotency_key,payload_hash,context_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,number,u?.id??null,profile?.id??null,p.staticId,p.firstName,p.lastName,p.rank,p.unitId,unit.name,p.week,p.idempotencyKey,digest,context]);
    const pointValue=(await c.query("SELECT value FROM settings WHERE key='pointValue' FOR SHARE")).rows[0]?.value??null;
    let total=0;
    for(const {e,t} of prepared){const itemId=randomUUID();const points=t.points*e.quantity;total+=points;
      const reward=taskReward(t.points,pointValue);
      const estimated=reward!==null&&rank.multiplier!==null?new Decimal(reward).mul(rank.multiplier).mul(e.quantity).toFixed(2):null;
      await c.query(`INSERT INTO report_items(id,report_id,task_id,task_name,quantity,points_rate,points,reward_rate,rank_multiplier,estimated_amount,time_category,starts_at,ends_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[itemId,id,t.id,t.name,e.quantity,t.points,points,reward,rank.multiplier,estimated,t.time_category,t.starts_at,t.ends_at]);
      await c.query('INSERT INTO evidence_links(item_id,url,sort_order) SELECT $1,url,(ordinal-1)::int FROM unnest($2::text[]) WITH ORDINALITY AS evidence(url,ordinal)',[itemId,e.evidenceUrls]);
    }
    return {reportId:id,number,week:p.week,points:total,quantity:p.entries.reduce((n,e)=>n+e.quantity,0)};
  });
}
export type Filters={from:string;to:string;unit:string;search:string;status:string;time:string;page:number};
export function filters(url:URL):Filters{const f=url.searchParams;const from=week.parse(f.get('from')||currentWeek()),to=week.parse(f.get('to')||from);if(from>to)throw new HttpError('Початок періоду має передувати завершенню.');if((+new Date(to)-+new Date(from))/86400000>366)throw new HttpError('Оберіть період до одного року.');return {from,to,unit:f.get('unit')||'',search:(f.get('search')||'').slice(0,80),status:f.get('status')||'',time:f.get('time')||'',page:Math.max(1,Math.min(10000,Math.floor(Number(f.get('page')))||1))};}
export function reportWhere(f:Filters,personnelId?:string){const values:unknown[]=[f.from,f.to];const clauses=['r.week_start BETWEEN $1 AND $2'];const add=(sql:string,v:unknown)=>{values.push(v);clauses.push(sql.replace('?',`$${values.length}`));};if(f.unit)add('r.unit_id::text=?',f.unit);if(f.search)add("(r.static_id || ' ' || r.first_name || ' ' || r.last_name) ILIKE ?",'%'+f.search.replace(/[%_\\]/g,'\\$&')+'%');if(f.status)add('i.status=?',itemStatus.parse(f.status));if(f.time)add('i.time_category=?',f.time);if(personnelId)add('r.personnel_id::text=?',personnelId);return {sql:clauses.join(' AND '),values};}
export async function listReports(f:Filters,u:Viewer,personal=false){
  let profile;if(personal){profile=(await query('SELECT * FROM personnel WHERE user_id=$1 AND active=true',[u.id]))[0];if(!profile)return {profile:null,reports:[],total:0,metrics:null,updatedAt:new Date().toISOString()};}
  const w=reportWhere(f,profile?.id);
  const [metrics]=await query(`SELECT count(DISTINCT r.id)::int AS reports,count(DISTINCT r.static_id)::int AS people,coalesce(sum(i.quantity),0)::float8 AS quantity,
    coalesce(sum(i.points) FILTER(WHERE i.status='approved'),0)::float8 AS approved_points,
    coalesce(sum(i.points) FILTER(WHERE i.status='pending'),0)::float8 AS pending_points,
    coalesce(sum(i.points) FILTER(WHERE i.status='clarification'),0)::float8 AS clarification_points,
    coalesce(sum(i.points) FILTER(WHERE i.status='rejected'),0)::float8 AS rejected_points
    ${!personal?",coalesce(sum(i.approved_amount) FILTER(WHERE i.status='approved'),0)::text AS approved_amount,coalesce(sum(i.estimated_amount) FILTER(WHERE i.status IN ('pending','clarification')),0)::text AS pending_amount,count(*) FILTER(WHERE i.estimated_amount IS NULL)::int AS unresolved_amounts":''}
    FROM reports r JOIN report_items i ON i.report_id=r.id WHERE ${w.sql}`,w.values);
  const matched=await query(`SELECT DISTINCT r.* FROM reports r JOIN report_items i ON i.report_id=r.id WHERE ${w.sql} ORDER BY r.submitted_at DESC,r.id DESC LIMIT 20 OFFSET $${w.values.length+1}`,[...w.values,(f.page-1)*20]);
  const ids=matched.map(r=>r.id);
  const items=ids.length?await query(`SELECT i.id,i.report_id,i.task_id,i.task_name,i.quantity,i.points,i.time_category,i.starts_at,i.ends_at,i.status,i.reason,i.legacy_description,
      coalesce((SELECT json_agg(e.url ORDER BY e.sort_order) FROM evidence_links e WHERE e.item_id=i.id),'[]') AS evidence_urls
      ${!personal?',i.reward_rate,i.rank_multiplier,i.estimated_amount,i.approved_amount':''}
      FROM report_items i WHERE i.report_id=ANY($1::uuid[]) ORDER BY i.id`,[ids]):[];
  return {profile:personal&&profile?{staticId:profile.static_id,firstName:profile.first_name,lastName:profile.last_name}:undefined,metrics,total:metrics.reports,reports:matched.map(r=>({id:r.id,number:r.number,week:r.week_start,submittedAt:r.submitted_at,staticId:r.static_id,firstName:r.first_name,lastName:r.last_name,rank:r.rank,unit:r.unit_name,personnelId:r.personnel_id,status:reportStatus(items.filter(i=>i.report_id===r.id).map(i=>i.status)),items:items.filter(i=>i.report_id===r.id)})),updatedAt:new Date().toISOString()};
}
