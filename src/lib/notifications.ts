import 'server-only';
import {z} from 'zod';
import {query} from '@/db';
import {HttpError} from './security';

type Notification={id:string;title:string;href:string;created:string;read:boolean};
export async function notifications(userId:string):Promise<Notification[]>{
 return query<Notification>(`WITH events AS (
  SELECT 'request:'||(s.value->>'id') AS id,'Рішення за заявкою: '||(s.value->>'title') AS title,
   '/portal/requests?entry='||(s.value->>'id')||'#service-'||(s.value->>'id') AS href, s.value->>'decidedAt' AS created
  FROM settings s WHERE s.key LIKE 'service-entry:%' AND s.value->>'author'=$1 AND s.value->>'decidedAt' IS NOT NULL
  UNION ALL
  SELECT 'promotion:'||a.id,'Рішення за звітом на підвищення',
   '/portal/personnel-actions#promotion-'||a.entity_id,a.created_at::text
  FROM audit_logs a WHERE a.action='personnel.promotion.decision' AND a.after->>'userId'=$1
  UNION ALL
  SELECT 'personnel:'||a.id,'Кадрова зміна у вашій особовій справі','/cabinet#cabinet-history',a.created_at::text
  FROM audit_logs a WHERE a.action='personnel.record' AND a.after->>'member'=$1
  UNION ALL
  SELECT 'transfer:'||a.id,'Переведення застосовано',
   '/portal/requests?entry='||(a.after->>'entryId')||'#service-'||(a.after->>'entryId'),a.created_at::text
  FROM audit_logs a WHERE a.action='unit.transfer' AND a.after->>'member'=$1
  UNION ALL
  SELECT 'report:'||i.id||':'||coalesce(i.reviewed_at::text,''),'Звіт '||r.number||' потребує уточнення',
   '/weekly-bonus/me?from='||r.week_start||'&to='||r.week_start||'&report='||r.id,i.reviewed_at::text
  FROM report_items i JOIN reports r ON r.id=i.report_id WHERE i.status='clarification'
   AND (r.author_id=$1 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$1 AND p.active))
  UNION ALL
  SELECT 'award:'||(s.value->>'number'),'Наказ про преміювання '||(s.value->>'number'),
   '/weekly-bonus/me?from='||(s.value->>'week')||'&to='||(s.value->>'week'),s.value->>'paidAt'
  FROM settings s WHERE s.key LIKE 'award-order:%' AND EXISTS(
   SELECT 1 FROM reports r JOIN settings payment ON payment.key='report-paid:'||r.id::text
   WHERE r.week_start::text=s.value->>'week'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(s.value->'recipients') recipient WHERE recipient->>'staticId'=coalesce(nullif(ltrim(r.static_id,'0'),''),'0')) AND (r.author_id=$1 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$1 AND p.active))
  )
  UNION ALL
  SELECT 'order:'||(s.value->>'id'),'Новий наказ: '||(s.value->>'title'),
   '/portal/orders?entry='||(s.value->>'id')||'#service-'||(s.value->>'id'),s.value->>'createdAt'
  FROM settings s JOIN personnel p ON p.user_id=$1 AND p.active AND p.unit_id::text=s.value->>'unit'
  JOIN units u ON u.id=p.unit_id AND u.active
  WHERE s.key LIKE 'service-entry:%' AND s.value->>'module'='orders' AND coalesce(s.value->>'archived','false')='false'
 )
 SELECT id,title,href,created,EXISTS(SELECT 1 FROM settings seen WHERE seen.key='notification-read:'||$1||':'||events.id) AS read
 FROM events WHERE created IS NOT NULL ORDER BY created::timestamptz DESC,id LIMIT 50`,[userId]);
}

export async function markNotifications(userId:string,input:unknown){
 const p=z.object({id:z.string().min(1).max(200).optional()}).parse(input);
 const available=await notifications(userId);
 const ids=p.id?available.filter(item=>item.id===p.id):available;
 if(!ids.length&&p.id)throw new HttpError('Сповіщення не знайдено.',404);
 await query(`INSERT INTO settings(key,value) SELECT key,'true'::jsonb FROM unnest($1::text[]) AS keys(key)
  ON CONFLICT(key) DO NOTHING`,[ids.map(item=>'notification-read:'+userId+':'+item.id)]);
 return {saved:true};
}
