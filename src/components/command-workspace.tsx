import {MilitaryTicket} from './military-ticket';
import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {query} from '@/db';
import {accessibleUnits} from '@/lib/unit-page';
import {kmbUnitId} from '@/lib/service-workspace';
import {unitCover} from '@/lib/unit-artwork';
import {commandSections} from '@/lib/command-sections';
import type {Viewer} from '@/lib/domain';
import {CommandQueue,commandQueueHref,type QueueFilters} from './command-queue';
import {CardLink} from './card-link';
import {UnitSpace} from './unit-space';
import {PersonnelWorkflow} from './personnel-workflow';
import {PromotionPoints} from './promotion-points';
import {ServiceWorkspace} from './service-workspace';

export async function CommandWorkspace({actor,unitId,section,filters}:{actor:Viewer;unitId?:string;section?:string;filters:QueueFilters}){
 const units=(await accessibleUnits(actor.id)).filter(unit=>unit.editor);
 if(!units.length)notFound();
 if(!unitId){
  const canSeeFaction=units.some(unit=>unit.appoint);
  const summary=canSeeFaction?await query<{id:string;name:string;commander:boolean;overdue:number;conflicts:number}>(`
   SELECT u.id,u.name,
    EXISTS(SELECT 1 FROM personnel p JOIN settings s ON s.key='service:'||p.id::text
     WHERE p.unit_id=u.id AND p.active AND p.rank BETWEEN 11 AND 12
     AND s.value->>'leadershipRole'='commander' AND s.value->>'commanderUnitId'=u.id::text) AS commander,
    (SELECT count(*)::int FROM settings s WHERE s.key LIKE 'service-entry:%'
     AND s.value->>'module'='requests' AND s.value->>'status'='pending'
     AND coalesce(s.value->>'targetUnit',s.value->>'unit')=u.id::text
     AND (s.value->>'createdAt')::timestamptz < now()-interval '72 hours') AS overdue,
    (SELECT count(*)::int FROM personnel p JOIN settings s ON s.key='service:'||p.id::text
     WHERE s.value->>'commanderUnitId'=u.id::text AND s.value->>'leadershipRole' IN ('commander','deputy')
     AND (NOT p.active OR p.unit_id IS DISTINCT FROM u.id OR p.rank IS NULL OR p.rank NOT BETWEEN 11 AND 12)) AS conflicts
   FROM units u WHERE u.id=ANY($1::uuid[]) ORDER BY u.sort_order,u.name`,[units.map(unit=>unit.id)]):[];
  if(units.length===1&&!canSeeFaction)redirect('/command/'+units[0].id+'/overview');
  return <section id="content" className="panel"><h1>Керування підрозділами</h1><p>Оберіть підрозділ для роботи.</p>
   {canSeeFaction&&<section className="portal-shortcuts">
    <h2>Зведення фракції</h2>
    <p>Простроченими вважаються заявки, які очікують рішення понад 72 години.</p>
    <div className="table-wrap"><table><thead><tr><th>Підрозділ</th><th>Командир</th><th>Прострочені заявки</th><th>Конфлікти призначень</th></tr></thead>
     <tbody>{summary.map(row=><tr key={row.id}>
      <td><Link href={'/command/'+row.id+'/overview'}>{row.name}</Link></td>
      <td><Link href={'/command/'+row.id+'/roster'}>{row.commander?'Призначений':'Вакансія'}</Link></td>
      <td><Link href={'/command/'+row.id+'/queue?kind=requests&overdue=1'}>{row.overdue}</Link></td>
      <td><Link href={'/command/'+row.id+'/roster'}>{row.conflicts}</Link></td>
     </tr>)}</tbody>
    </table></div>
   </section>}
   <div className="home-card-grid">{units.map(unit=><CardLink key={unit.id} href={'/command/'+unit.id+'/overview'} title={unit.name} showImageTitle={false} image={unitCover(unit.name)??'/portal-art/home/service.webp'}/>)}</div>
  </section>;
 }
 const unit=units.find(unit=>unit.id===unitId);
 const view=commandSections.find(([key])=>key===section);
 if(!unit||!view)notFound();
 const managesKmb=unit.id===await kmbUnitId();
 if(section==='training'&&!managesKmb)notFound();
 const root='/command/'+unit.id;
 if(section==='overview'){
  const [counts]=await query<{people:number;requests:number;reports:number;promotions:number;event:string|null}>(`SELECT
   (SELECT count(*)::int FROM personnel WHERE unit_id=$1::uuid AND active) AS people,
   (SELECT count(*)::int FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'='requests' AND value->>'status'='pending' AND (value->>'unit'=$1::uuid::text OR value->>'targetUnit'=$1::uuid::text)) AS requests,
   (SELECT count(DISTINCT coalesce(value->>'reportId',value->>'id'))::int FROM settings WHERE key LIKE 'promotion-credit:%' AND value->>'unitId'=$1::uuid::text AND value->>'status'='pending') AS reports,
   (SELECT count(*)::int FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'unitId'=$1::uuid::text AND value->>'status'='pending') AS promotions,
   (SELECT value->>'title' FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'='calendar' AND value->>'unit'=$1::uuid::text
    AND coalesce(value->>'archived','false')='false' AND coalesce(value->>'draft','false')='false' AND value->>'date'>=to_char(now() AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD')
    ORDER BY value->>'date' LIMIT 1) AS event`,[unit.id]);
  const descriptions:Record<string,string>={
   roster:counts.people+' у складі',requests:counts.requests+' на розгляді',review:counts.reports+' на перевірці',
   'promotion-decisions':counts.promotions+' на розгляді',calendar:counts.event??'Запланованих подій поки немає.',
  };
  return <div id="content"><header className="portal-preview-header"><h1>{unit.name}</h1><p>Робочий простір командування</p></header>
   <div className="home-card-grid portal-shortcuts">{commandSections.filter(([key])=>key!=='overview'&&(key!=='training'||managesKmb)).map(([key,label,art])=><CardLink key={key} href={root+'/'+key} title={label} image={'/portal-art/'+art+'.webp'} description={descriptions[key]}/>)}</div>
  </div>;
 }
 return <><nav className="portal-crumb" aria-label="Шлях до розділу"><Link href={root+'/overview'}>{unit.name}</Link><span>/</span><span>{view[1]}</span>{filters.fromQueue==='1'&&<Link href={commandQueueHref(unit.id,filters)}>Повернутися до черги</Link>}</nav>
  {section==='military-ticket'&&<MilitaryTicket key={unit.id} unitId={unit.id}/>}
  {section==='queue'&&<CommandQueue unitId={unit.id} actorId={actor.id} filters={filters}/>}
  {section==='content'&&<UnitSpace userId={actor.id} unitId={unit.id} mode="content"/>}
  {section==='roster'&&<><UnitSpace userId={actor.id} unitId={unit.id} mode="roster"/><PersonnelWorkflow key={root+'/roster'} unitId={unit.id} mode="record"/></>}
  {section==='audit'&&<PersonnelWorkflow key={root+'/audit'} unitId={unit.id} mode="audit"/>}
  {section==='promotion-decisions'&&<PersonnelWorkflow key={root+'/promotion-decisions'} unitId={unit.id} mode="review" focus={filters.entry}/>}
  {(section==='review'||section==='catalog')&&<PromotionPoints key={root+'/'+section} unitId={unit.id} mode={section} focus={filters.entry}/>}
  {(section==='requests'||section==='orders'||section==='calendar'||section==='training'||section==='documents')&&
   <ServiceWorkspace key={root+'/'+section} unitId={unit.id} focus={filters.entry} module={section==='documents'?'regulations':section}/>}
 </>;
}
