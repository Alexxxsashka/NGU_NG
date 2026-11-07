import {CardLink} from './card-link';
import {unitCover} from '@/lib/unit-artwork';
import {notFound,redirect} from 'next/navigation';
import {CalendarDays,ClipboardList,FileText,Megaphone,Shield,Users} from 'lucide-react';
import {query} from '@/db';
import {accessibleUnits,loadUnitContent} from '@/lib/unit-page';
import {UnitEditor} from './unit-editor';

export async function UnitSpace({userId,unitId}:{userId:string;unitId?:string}){
 if(unitId&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(unitId))notFound();
 const units=await accessibleUnits(userId,unitId);
 if(!unitId){
  if(units.length===1)redirect('/units/'+units[0].id);
  return <section id="content" className="panel">
   <h1>{units.length>1?'Підрозділи':'Мої підрозділи'}</h1>
   {units.length?<div className="home-card-grid">{units.map(unit=><CardLink key={unit.id} href={'/units/'+unit.id} title={unit.name} image={unitCover(unit.name)||'/portal-art/home/service.webp'} icon={<Shield size={19}/>}/>)}</div>:<p>Після призначення до підрозділу його сторінка з’явиться в кабінеті.</p>}
  </section>;
 }
 const unit=units[0];
 if(!unit)notFound();
 const [content,roster,ranks]=await Promise.all([loadUnitContent(unit.id),query<{static_id:string;first_name:string;last_name:string;rank_name:string|null;position:string|null}>(`
  SELECT p.static_id,p.first_name,p.last_name,k.name AS rank_name,d.value->>'position' AS position
  FROM personnel p LEFT JOIN ranks k ON k.id=p.rank LEFT JOIN settings d ON d.key='service:'||p.id::text
  WHERE p.unit_id=$1 AND p.active ORDER BY p.rank DESC NULLS LAST,p.last_name,p.first_name
 `,[unit.id]),unit.editor?query<{id:number;name:string}>('SELECT id,name FROM ranks ORDER BY id'):[]]);
 const sections=[
  ['Про підрозділ',content.overview,Shield],
  ['Розклад і заходи',content.schedule,CalendarDays],
  ['Правила та матеріали',content.rules,FileText],
  ['Контакти командування',content.contacts,ClipboardList],
 ] as const;
 return <div id="content">
  <header className="portal-preview-header"><span className="pill prime">Внутрішня сторінка</span><h1>{unit.name}</h1><p>Новини, службова інформація й особовий склад підрозділу.</p>
  </header>
  <nav className="home-card-grid portal-shortcuts" aria-label="Розділи підрозділу">
   <CardLink href="#unit-news" title="Новини" image="/portal-art/unit-actions/news.webp" icon={<Megaphone size={19}/>}/>
   <CardLink href="#unit-roster" title="Особовий склад" image={unitCover(unit.name)||'/portal-art/home/service.webp'} icon={<Users size={19}/>}/>
   {unit.editor&&<>
    <CardLink href="#unit-management" title="Редагувати наповнення й керувати складом" image="/portal-art/home/command.webp" icon={<Shield size={19}/>}/>
    <CardLink href="/portal/regulations" title="Додати документ" image="/portal-art/home/documents.webp" icon={<FileText size={19}/>}/>
    <CardLink href="/portal/calendar" title="Додати подію" image="/portal-art/calendar.webp" icon={<CalendarDays size={19}/>}/>
   </>}
  </nav>
  <div className="portal-feature-grid">{sections.map(([title,body,Icon])=><section key={title}><h2><Icon size={18}/>{title}</h2><p className="unit-copy">{body||'Інформацію ще не додано.'}</p></section>)}</div>
  <section className="panel" id="unit-news"><h2>Новини й оголошення</h2>
   {content.news.length?content.news.map(news=><article key={news.id} className="unit-news-item">
    <span className={'pill '+(news.kind==='announcement'?'prime':'any')}>{news.kind==='announcement'?'Оголошення':'Новина'}</span>
    <h3>{news.title}</h3><time dateTime={news.publishedAt}>{new Date(news.publishedAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}</time>
    <p className="unit-copy">{news.body}</p>
   </article>):<p>Публікацій ще немає.</p>}
  </section>
  <section className="panel" id="unit-roster"><h2>Особовий склад · {roster.length}</h2>
   <div className="table-wrap"><table><thead><tr><th scope="col">Боєць</th><th scope="col">Static ID</th><th scope="col">Звання</th><th scope="col">Посада</th></tr></thead>
    <tbody>{roster.length?roster.map(person=><tr key={person.static_id}><td>{person.first_name} {person.last_name}</td><td>{person.static_id}</td><td>{person.rank_name??'Не призначено'}</td><td>{person.position||'Не призначено'}</td></tr>):<tr><td colSpan={4}>Склад ще не призначено.</td></tr>}</tbody>
   </table></div>
  </section>
  {unit.editor&&<UnitEditor ranks={ranks} unitId={unit.id} info={content} news={content.news.map(({id,title})=>({id,title}))}/>}
 </div>;
}
