import 'server-only';
import type {PoolClient} from 'pg';

// Preserve paid snapshots and distribute each weekly cap in submission order.
export async function recalculateAwards(c:PoolClient,week:string|null=null){
 const result=await c.query(`WITH paid AS (
   SELECT r.static_id,r.week_start,sum(i.approved_amount) AS amount
   FROM reports r JOIN report_items i ON i.report_id=r.id AND i.status='approved'
   JOIN settings payment ON payment.key='report-paid:'||r.id::text
   WHERE ($1::date IS NULL OR r.week_start=$1)
   GROUP BY r.static_id,r.week_start
 ), rates AS (
   SELECT i.id,i.quantity,i.status,r.static_id,r.week_start,r.submitted_at,r.id AS report_id,
    t.name,t.points,t.time_category,t.starts_at,t.ends_at,a.cap,coalesce(paid.amount,0) AS paid,
    CASE WHEN rate.key IS NULL THEN i.reward_rate ELSE round(t.points*(rate.value#>>'{}')::numeric,2) END AS reward,
    CASE WHEN rank.id IS NULL THEN i.rank_multiplier ELSE rank.multiplier END AS multiplier,
    i.estimated_amount, manual.after->>'estimatedAmount' AS override, manual.id IS NOT NULL AS has_override
   FROM report_items i JOIN reports r ON r.id=i.report_id JOIN tasks t ON t.id=i.task_id
   LEFT JOIN ranks rank ON rank.id=r.rank
   LEFT JOIN settings rate ON rate.key='pointValue'
   LEFT JOIN weekly_awards a ON a.static_id=r.static_id AND a.week_start=r.week_start
   LEFT JOIN paid ON paid.static_id=r.static_id AND paid.week_start=r.week_start
   LEFT JOIN LATERAL (
    SELECT id,after FROM audit_logs WHERE entity_id=i.id::text AND action='award.adjust'
    ORDER BY created_at DESC,id DESC LIMIT 1
   ) manual ON true
   WHERE ($1::date IS NULL OR r.week_start=$1) AND i.status<>'rejected'
   AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.key IN ('report-paid:'||r.id::text,'award-order:'||r.week_start::text))
 ), estimates AS (
   SELECT rates.*,CASE WHEN has_override AND estimated_amount IS NOT DISTINCT FROM override::numeric THEN estimated_amount
     ELSE round(reward*multiplier*quantity,2) END AS estimate
   FROM rates
 ), distribution AS (
   SELECT estimates.*,coalesce(sum(estimate) FILTER(WHERE status='approved') OVER (
    PARTITION BY static_id,week_start ORDER BY submitted_at,report_id,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
   ),0) AS earlier
   FROM estimates
 ), updates AS (
   SELECT distribution.*,CASE WHEN status='approved' AND estimate IS NOT NULL
    THEN CASE WHEN cap IS NULL THEN estimate ELSE least(estimate,greatest(0,cap-paid-earlier)) END
   END AS approved
   FROM distribution
 )
 UPDATE report_items i SET task_name=u.name,points_rate=u.points,points=u.points*u.quantity,
  reward_rate=u.reward,rank_multiplier=u.multiplier,estimated_amount=u.estimate,approved_amount=u.approved,
  time_category=u.time_category,starts_at=u.starts_at,ends_at=u.ends_at
 FROM updates u WHERE i.id=u.id AND
  (i.task_name,i.points_rate,i.points,i.reward_rate,i.rank_multiplier,i.estimated_amount,i.approved_amount,i.time_category,i.starts_at,i.ends_at)
  IS DISTINCT FROM (u.name,u.points,u.points*u.quantity,u.reward,u.multiplier,u.estimate,u.approved,u.time_category,u.starts_at,u.ends_at)`,[week]);
 return result.rowCount??0;
}
