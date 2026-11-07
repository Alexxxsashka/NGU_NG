import 'server-only';
import {query} from '@/db';
import {reportWhere,type Filters} from './reports';
export async function unitMatrix(f:Filters){
  const w=reportWhere(f);
  const columns=await query(`SELECT DISTINCT t.id,t.name,t.active,t.time_category FROM tasks t WHERE
    (t.active=true AND (t.unit_id IS NULL OR t.unit_id::text=$1)) OR EXISTS(
      SELECT 1 FROM report_items i JOIN reports r ON r.id=i.report_id WHERE i.task_id=t.id AND r.unit_id::text=$1 AND r.week_start BETWEEN $2 AND $3)
    ORDER BY t.name`,[f.unit,f.from,f.to]);
  const data=await query(`SELECT r.static_id,i.task_id,sum(i.quantity)::float8 quantity,sum(i.points)::float8 points,
    coalesce(sum(i.points) FILTER(WHERE i.status='approved'),0)::float8 approved_points,
    coalesce(sum(i.approved_amount) FILTER(WHERE i.status='approved'),0)::text approved_amount
    FROM reports r JOIN report_items i ON i.report_id=r.id WHERE ${w.sql} GROUP BY r.static_id,i.task_id`,w.values);
  const people=await query(`WITH filtered AS(SELECT DISTINCT r.* FROM reports r JOIN report_items i ON i.report_id=r.id WHERE ${w.sql}),
    latest AS(SELECT DISTINCT ON(static_id) static_id,first_name,last_name,rank,submitted_at FROM filtered ORDER BY static_id,submitted_at DESC,id DESC)
    SELECT l.*, (SELECT count(*)::int FROM filtered f WHERE f.static_id=l.static_id) reports FROM latest l ORDER BY rank DESC,last_name,first_name`,w.values);
  return {columns,people:people.map(p=>({...p,cells:data.filter(d=>d.static_id===p.static_id)})),updatedAt:new Date().toISOString()};
}
