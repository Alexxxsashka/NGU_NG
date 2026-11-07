import 'server-only';
import {query} from '@/db';

type Entry={id:string;title:string;status?:string;decision?:string;date?:string};
type Learning={id:string;title:string;status:string|null};
type Change={id:string;date:string;label:string;detail:string|null};
type Report={id:string;number:string;week:string;reason:string|null};

export async function loadCabinetActivity(userId:string,today:string){
 const [requests,learning,event,reports,history]=await Promise.all([
  query<{value:Entry}>(`SELECT value FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'='requests'
   AND value->>'author'=$1 AND value->>'status' IN ('approved','rejected')
   ORDER BY coalesce(value->>'decidedAt',value->>'createdAt') DESC LIMIT 5`,[userId]),
  query<Learning>(`SELECT entry.value->>'id' AS id,entry.value->>'title' AS title,result.value->>'status' AS status
   FROM personnel p JOIN units u ON u.id=p.unit_id AND u.active
   JOIN settings entry ON entry.key LIKE 'service-entry:%' AND entry.value->>'module'='training' AND entry.value->>'unit'=u.id::text
   LEFT JOIN settings result ON result.key='service-result:'||(entry.value->>'id')||':'||p.user_id
   WHERE p.user_id=$1 AND p.active AND coalesce(entry.value->>'archived','false')='false' AND coalesce(entry.value->>'draft','false')='false'
   ORDER BY entry.value->>'createdAt',entry.key`,[userId]),
  query<{value:Entry}>(`SELECT entry.value FROM personnel p JOIN units u ON u.id=p.unit_id AND u.active
   JOIN settings entry ON entry.key LIKE 'service-entry:%' AND entry.value->>'module'='calendar' AND entry.value->>'unit'=u.id::text
   WHERE p.user_id=$1 AND p.active AND coalesce(entry.value->>'archived','false')='false' AND coalesce(entry.value->>'draft','false')='false' AND entry.value->>'date'>=$2
   ORDER BY entry.value->>'date',entry.key LIMIT 1`,[userId,today]),
  query<Report>(`SELECT r.id,r.number,r.week_start AS week,review.reason FROM reports r
   JOIN LATERAL (SELECT i.reason FROM report_items i WHERE i.report_id=r.id AND i.status='clarification'
    ORDER BY i.reviewed_at DESC NULLS LAST,i.id LIMIT 1) review ON true
   WHERE r.author_id=$1 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$1 AND p.active)
   ORDER BY r.submitted_at DESC,r.id LIMIT 5`,[userId]),
  query<Change>(`SELECT a.id,a.created_at AS date,
    CASE WHEN a.action='service.training.result' THEN 'Результат КМБ'
         WHEN a.action='service.request.applied' THEN a.after->>'title'
         WHEN a.action='personnel.record' THEN CASE a.after->>'action' WHEN 'promote' THEN 'Підвищення' WHEN 'demote' THEN 'Пониження' WHEN 'admit' THEN 'Прийняття до НГУ' WHEN 'dismiss' THEN 'Звільнення з НГУ' ELSE 'Переведення' END
         WHEN a.action='unit.transfer' THEN 'Переведення до підрозділу'
         WHEN a.action='unit.member.grant' THEN 'Призначення до підрозділу'
         WHEN a.action='unit.member.revoke' THEN 'Виведення зі складу підрозділу'
         WHEN coalesce(a.before#>>'{profile,unit_id}',a.before->>'unit_id') IS DISTINCT FROM a.after->>'unitId' THEN 'Зміна підрозділу'
         WHEN coalesce(a.before#>>'{profile,rank}',a.before->>'rank') IS DISTINCT FROM a.after->>'rank' THEN 'Зміна звання'
         ELSE 'Кадрове призначення' END AS label,
    CASE WHEN a.action='service.training.result' THEN concat_ws(' · ',entry.value->>'title',
      CASE WHEN a.after->>'status'='passed' THEN 'Зараховано' ELSE 'Потрібно повторити' END)
    WHEN a.action='personnel.record' THEN concat_ws(' · ',a.after->>'rankName',a.after->>'unitName')
    ELSE coalesce(unit.name,rank.name,nullif(a.after->>'position','')) END AS detail
   FROM audit_logs a
   LEFT JOIN settings entry ON a.action='service.training.result' AND entry.key='service-entry:'||a.entity_id
   LEFT JOIN units unit ON unit.id::text=a.after->>'unitId'
   LEFT JOIN ranks rank ON rank.id::text=a.after->>'rank'
   WHERE (a.action='service.training.result' AND a.after->>'member'=$1)
   OR (a.action IN ('personnel.assign','personnel.save','unit.assignment','unit.member.grant','unit.member.revoke','unit.transfer','personnel.record','service.request.applied')
    AND EXISTS(SELECT 1 FROM personnel p WHERE p.user_id=$1 AND p.id::text=a.entity_id))
   ORDER BY a.created_at DESC,a.id DESC LIMIT 25`,[userId]),
 ]);
 return {requests:requests.map(row=>row.value),learning,event:event[0]?.value,reports,history};
}
