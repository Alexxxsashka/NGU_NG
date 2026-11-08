import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit,lockAdmin} from './admin';
import {HttpError,throttle} from './security';
import {week} from './validation';
import type {Viewer} from './domain';
import type {AwardOrder} from './award-order-docx';

const digest=(code:string)=>createHash('sha256').update(code).digest('hex');
type SharedTask={id:string;name:string;quantity:number;rate:number;points:number;reward:string|null;multiplier:string|null;estimate:string|null;approved:string|null;links:string[]};
type Snapshot={number:string;week:string;total:string;expiresAt:string;reports:{number:string;staticId:string;name:string;points:number;amount:string;tasks?:SharedTask[]}[]};

export async function createAwardShare(input:unknown,actor:Viewer){
 const p=z.object({week,revoke:z.boolean().optional()}).parse(input);
 return transaction(async c=>{
  await lockAdmin(c,actor);
  const {rows:[order]}=await c.query<{value:AwardOrder}>('SELECT value FROM settings WHERE key=$1',['award-order:'+p.week]);
  if(!order)throw new HttpError('Спочатку затвердьте наказ за цей тиждень.',409);
  const key='award-share:'+p.week;
  if(p.revoke){
   await c.query('DELETE FROM settings WHERE key=$1',[key]);
   await audit(c,actor,'award.share.revoke',p.week,null,null);
   return {code:null};
  }
  const {rows:reports}=await c.query<Snapshot['reports'][number]>(`
   SELECT r.number,coalesce(nullif(ltrim(r.static_id,'0'),''),'0') AS "staticId",
    r.first_name||' '||r.last_name AS name,coalesce(sum(i.points),0)::float8 AS points,
    (payment.value->>'amount') AS amount,
    jsonb_agg(jsonb_build_object('id',i.id,'name',i.task_name,'quantity',i.quantity,'rate',i.points_rate,
     'points',i.points,'reward',i.reward_rate::text,'multiplier',i.rank_multiplier::text,
     'estimate',i.estimated_amount::text,'approved',i.approved_amount::text,'links',coalesce(e.links,'[]'::jsonb)) ORDER BY i.id) AS tasks
   FROM reports r JOIN settings payment ON payment.key='report-paid:'||r.id::text
   JOIN report_items i ON i.report_id=r.id AND i.status='approved'
   LEFT JOIN LATERAL (SELECT jsonb_agg(url ORDER BY sort_order,url) AS links FROM evidence_links WHERE item_id=i.id AND url ~* '^https://') e ON true
   WHERE r.week_start=$1 GROUP BY r.id,payment.value ORDER BY r.last_name,r.first_name,r.number`,[p.week]);
  if(!reports.length)throw new HttpError('У наказі немає звітів для перевірки.',409);
  const code=randomBytes(18).toString('base64url');
  const snapshot:Snapshot={number:order.value.number,week:p.week,total:order.value.total,reports,expiresAt:new Date(Date.now()+7*86400000).toISOString()};
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify({hash:digest(code),snapshot})]);
  await audit(c,actor,'award.share.create',p.week,null,{expiresAt:snapshot.expiresAt});
  return {code};
 });
}

export async function readAwardShare(request:Request,input:unknown){
 await throttle(request,'award-share',30,3600);
 const {code}=z.object({code:z.string().trim().regex(/^[A-Za-z0-9_-]{24}$/,'Вкажіть код доступу з наказу.')}).parse(input);
 const [row]=await query<{snapshot:Snapshot}>(`SELECT value->'snapshot' AS snapshot FROM settings
  WHERE key LIKE 'award-share:%' AND value->>'hash'=$1 AND (value#>>'{snapshot,expiresAt}')::timestamptz>now()`,[digest(code)]);
 if(!row)throw new HttpError('Код недійсний або строк його дії минув.',404);
 return row.snapshot;
}
