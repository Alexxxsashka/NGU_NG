import {WorkspaceRoster,type RosterPerson} from './workspace-roster';
import {CardLink} from './card-link';
import {unitCover} from '@/lib/unit-artwork';
import {notFound,redirect} from 'next/navigation';
import {CalendarDays,ClipboardList,FileText,Megaphone,Shield,Users} from 'lucide-react';
import {query} from '@/db';
import {accessibleUnits,loadUnitContent} from '@/lib/unit-page';
import {UnitEditor} from './unit-editor';

export async function UnitSpace({userId,unitId,mode='personal',ownOnly=false}:{userId:string;unitId?:string;ownOnly?:boolean;mode?:'personal'|'content'|'roster'}){
 if(unitId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(unitId))notFound();
 const allowed=await accessibleUnits(userId,unitId);
 const [own]=ownOnly?await query<{unit_id:string}>('SELECT unit_id FROM personnel WHERE user_id=$1 AND active',[userId]):[];
 const units=ownOnly?allowed.filter(unit=>unit.id===own?.unit_id):allowed;
 if(!unitId){
  if(units.length===1)redirect('/units/'+units[0].id);
  return <section id="content" className="panel">
   <h1>{units.length>1?'Підрозділи':'Мої підрозділи'}</h1>
   {units.length?<div className="home-card-grid">{units.map(unit=><CardLink key={unit.id} href={'/units/'+unit.id} title={unit.name} image={unitCover(unit.name)||'/portal-art/home/service.webp'} icon={<Shield size={19}/>}/>)}</div>:<p>Після призначення до підрозділу його сторінка з’явиться в кабінеті.</p>}
  </section>;
 }
 const unit=units[0];
 if(!unit||(mode!=='personal'&&!unit.editor))notFound();
 const [content,roster,ranks]=await Promise.all([loadUnitContent(unit.id),query<RosterPerson>(`
  SELECT p.static_id,p.first_name,p.last_name,k.name AS rank_name,d.value->>'position' AS position,p.active,
  CASE WHEN $2::boolean THEN (SELECT count(*)::int FROM settings result WHERE result.key LIKE 'service-result:%' AND result.value->>'member'=p.user_id AND result.value->>'status'='passed') ELSE 0 END AS completed
  FROM personnel p LEFT JOIN ranks k ON k.id=p.rank LEFT JOIN settings d ON d.key='service:'||p.id::text
  WHERE p.unit_id=$1 AND ($2::boolean OR p.active) ORDER BY p.rank DESC NULLS LAST,p.last_name,p.first_name
 `,[unit.id,mode==='roster']),unit.editor?query<{id:number;name:string}>('SELECT id,name FROM ranks ORDER BY id'):[]]);
 const editor=mode!=='personal'?<UnitEditor canAppoint={unit.appoint} mode={mode} ranks={ranks} unitId={unit.id} info={content} news={content.news.map(({id,title,draft,archived})=>({id,title,draft,archived}))}/>:null;
 if(mode==='content')return <div id="content">{editor}<div className="home-card-grid portal-shortcuts">
  <CardLink href={'/command/'+unit.id+'/calendar'} title="Додати подію" image="/portal-art/cabinet/calendar.webp"/>
  <CardLink href={'/command/'+unit.id+'/documents'} title="Додати документ" image="/portal-art/cabinet/documents.webp"/>
 </div></div>;
 const sections=[
  ['Про підрозділ',content.overview,Shield],
  ['Розклад і заходи',content.schedule,CalendarDays],
  ['Правила та матеріали',content.rules,FileText],
  ['Контакти командування',content.contacts,ClipboardList],
 ] as const;
 return <div id="content">
  {mode==='personal'&&<>
  <header className="portal-preview-header"><span className="pill prime">Внутрішня сторінка</span><h1>{unit.name}</h1><p>Новини, службова інформація й особовий склад підрозділу.</p>
  </header>
  <nav className="home-card-grid portal-shortcuts" aria-label="Розділи підрозділу">
   <CardLink href="/portal/promotion-points/submit" title="Звіт на підвищення" image="/portal-art/unit-actions/rank.webp" icon={<ClipboardList size={19}/>}/>
   <CardLink href="#unit-news" title="Новини" image="/portal-art/unit-actions/news.webp" icon={<Megaphone size={19}/>}/>
   <CardLink href="#unit-roster" title="Особовий склад" image={unitCover(unit.name)||'/portal-art/home/service.webp'} icon={<Users size={19}/>}/>
   <CardLink href="/portal/calendar" title="Календар і участь" image="/portal-art/cabinet/calendar.webp" icon={<CalendarDays size={19}/>}/>
   <CardLink href="/portal/regulations" title="Документи" image="/portal-art/cabinet/documents.webp" icon={<FileText size={19}/>}/>
  </nav>
  <div className="portal-feature-grid">{sections.map(([title,body,Icon])=><section key={title}><h2><Icon size={18}/>{title}</h2><p className="unit-copy">{body||'Інформацію ще не додано.'}</p></section>)}</div>
  <section className="panel" id="unit-news"><h2>Новини й оголошення</h2>
   {content.news.some(news=>!news.draft&&!news.archived)?content.news.filter(news=>!news.draft&&!news.archived).map(news=><article key={news.id} className="unit-news-item">
    <span className={'pill '+(news.kind==='announcement'?'prime':'any')}>{news.kind==='announcement'?'Оголошення':'Новина'}</span>
    <h3>{news.title}</h3><time dateTime={news.publishedAt}>{new Date(news.publishedAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}</time>
    <p className="unit-copy">{news.body}</p>
   </article>):<p>Публікацій ще немає.</p>}
  </section>
  </>}
  <WorkspaceRoster people={roster} managed={mode==='roster'}/>
  {editor}
 </div>;
}
