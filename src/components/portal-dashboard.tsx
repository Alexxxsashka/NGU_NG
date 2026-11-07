import Link from 'next/link';
import {query} from '@/db';
import {currentWeek,statusLabels} from '@/lib/domain';
import type {Viewer} from '@/lib/domain';
import {accessibleUnits,loadUnitContent} from '@/lib/unit-page';
import {ServiceTablet} from './service-tablet';

export async function PortalDashboard({user}:{user:Viewer}){
 const units=await accessibleUnits(user.id);
 const managed=units.filter(unit=>unit.editor);
 const [reports,roster,news]=await Promise.all([
  query<{number:string;status:string}>(`SELECT r.number,CASE WHEN bool_or(i.status='clarification') THEN 'clarification'
   WHEN bool_or(i.status='pending') THEN 'pending' WHEN count(DISTINCT i.status)>1 THEN 'partial' ELSE min(i.status) END AS status
   FROM reports r JOIN report_items i ON i.report_id=r.id
   WHERE r.week_start=$2 AND (r.author_id=$1 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$1 AND p.active))
   GROUP BY r.id ORDER BY r.submitted_at DESC LIMIT 5`,[user.id,currentWeek()]),
  managed.length?query<{unit_id:string;total:number}>('SELECT unit_id,count(*)::int AS total FROM personnel WHERE active AND unit_id=ANY($1::uuid[]) GROUP BY unit_id',[managed.map(unit=>unit.id)]):[],
  Promise.all(units.map(async unit=>{
   const content=await loadUnitContent(unit.id);
   return content.news.map(item=>({...item,unit}));
  })),
 ]);
 const latest=news.flat().sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
 return <div id="content">
  <ServiceTablet user={user} editable={false}/>
  <div className="portal-feature-grid">
   <section><h2>Цього тижня</h2>{reports.length?<ul>{reports.map(report=><li key={report.number}>{report.number} · {statusLabels[report.status]||report.status}</li>)}</ul>:<p>Звітів за цей тиждень ще немає.</p>}
    <Link className="button secondary" href="/weekly-bonus">Щотижневе преміювання</Link></section>
   <section><h2>Остання новина підрозділу</h2>{latest?<Link href={'/units/'+latest.unit.id+'#unit-news'}>{latest.title} · {latest.unit.name}</Link>:<p>Новин підрозділу поки немає.</p>}</section>
   <section><h2>Моя служба</h2><div className="actions"><Link href="/cabinet">Особистий кабінет</Link><Link href="/portal/requests">Заявки</Link><Link href="/portal/training">КМБ</Link><Link href="/portal/calendar">Календар</Link></div></section>
  </div>
  {managed.length>0&&<section className="panel"><h2>{user.role==='admin'||managed.length>1?'Огляд підрозділів':'Мій підрозділ'}</h2>
   <ul>{managed.map(unit=><li key={unit.id}><Link href={'/units/'+unit.id}>{unit.name}</Link> · {roster.find(row=>row.unit_id===unit.id)?.total??0} у складі</li>)}</ul>
   <Link className="button secondary" href="/portal/requests">Черга службових заявок</Link>
  </section>}
 </div>;
}
