import Link from 'next/link';
import {query} from '@/db';
import {currentWeek,statusLabels} from '@/lib/domain';
import type {Viewer} from '@/lib/domain';
import {loadUnitContent} from '@/lib/unit-page';
import Image from 'next/image';
import {PortalMatrix} from './portal-matrix';
import {ServiceTablet} from './service-tablet';

export async function PortalDashboard({user}:{user:Viewer}){
 const units=await query<{id:string;name:string}>('SELECT u.id,u.name FROM personnel p JOIN units u ON u.id=p.unit_id AND u.active WHERE p.user_id=$1 AND p.active',[user.id]);
 const [reports,news]=await Promise.all([
  query<{number:string;status:string}>(`SELECT r.number,CASE WHEN bool_or(i.status='clarification') THEN 'clarification'
   WHEN bool_or(i.status='pending') THEN 'pending' WHEN count(DISTINCT i.status)>1 THEN 'partial' ELSE min(i.status) END AS status
   FROM reports r JOIN report_items i ON i.report_id=r.id
   WHERE r.week_start=$2 AND (r.author_id=$1 OR EXISTS(SELECT 1 FROM personnel p WHERE p.id=r.personnel_id AND p.user_id=$1 AND p.active))
   GROUP BY r.id ORDER BY r.submitted_at DESC LIMIT 5`,[user.id,currentWeek()]),
  Promise.all(units.map(async unit=>{
   const content=await loadUnitContent(unit.id);
   return content.news.filter(item=>!item.draft&&!item.archived).map(item=>({...item,unit}));
  })),
 ]);
 const latest=news.flat().sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))[0];
 return <div id="content">
  <header className="home-briefing">
   <Image className="home-briefing-art" src="/portal-art/home/cabinet.webp" alt="" fill sizes="(max-width: 700px) 100vw, 80vw"/>
   <Image className="home-briefing-emblem" src="/ngu-emblem.svg" alt="" width={68} height={68}/>
   <div><p>Службовий портал НГУ</p><h1>{user.name}</h1><span>Моя служба</span></div>
  </header>
  <PortalMatrix signedIn/>
  <div className="portal-feature-grid">
   <section><h2>Цього тижня</h2>{reports.length?<ul>{reports.map(report=><li key={report.number}>{report.number} · {statusLabels[report.status]||report.status}</li>)}</ul>:<p>Звітів за цей тиждень ще немає.</p>}
    <Link className="button secondary" href="/weekly-bonus">Щотижневе преміювання</Link></section>
   <section><h2>Остання новина підрозділу</h2>{latest?<Link href={'/units/'+latest.unit.id+'#unit-news'}>{latest.title} · {latest.unit.name}</Link>:<p>Новин підрозділу поки немає.</p>}</section>
  </div>

  <ServiceTablet user={user} editable={false}/>
 </div>;
}
