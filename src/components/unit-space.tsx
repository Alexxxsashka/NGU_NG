import Link from 'next/link';
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
   <h1>Мої підрозділи</h1>
   {units.length?<div className="actions">{units.map(unit=><Link key={unit.id} className="button secondary" href={'/units/'+unit.id}><Shield size={18}/>{unit.name}</Link>)}</div>:<p>Після призначення до підрозділу його сторінка з’явиться в кабінеті.</p>}
  </section>;
 }
 const unit=units[0];
 if(!unit)notFound();
 const [content,roster]=await Promise.all([loadUnitContent(unit.id),query<{static_id:string;first_name:string;last_name:string;rank_name:string|null;position:string|null}>(`
  SELECT p.static_id,p.first_name,p.last_name,k.name AS rank_name,d.value->>'position' AS position
  FROM personnel p LEFT JOIN ranks k ON k.id=p.rank LEFT JOIN settings d ON d.key='service:'||p.id::text
  WHERE p.unit_id=$1 AND p.active ORDER BY p.rank DESC NULLS LAST,p.last_name,p.first_name
 `,[unit.id])]);
 const sections=[
  ['Про підрозділ',content.overview,Shield],
  ['Розклад і заходи',content.schedule,CalendarDays],
  ['Правила та матеріали',content.rules,FileText],
  ['Контакти командування',content.contacts,ClipboardList],
 ] as const;
 return <div id="content">
  <header className="portal-preview-header"><span className="pill prime">Внутрішня сторінка</span><h1>{unit.name}</h1><p>Новини, службова інформація й особовий склад підрозділу.</p>
   <div className="actions"><a className="button secondary" href="#unit-news"><Megaphone size={17}/>Новини</a><a className="button secondary" href="#unit-roster"><Users size={17}/>Склад</a>{unit.editor&&<a className="button" href="#unit-management">Керування</a>}</div>
  </header>
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
  {unit.editor&&<UnitEditor unitId={unit.id} info={content} news={content.news.map(({id,title})=>({id,title}))}/>}
 </div>;
}
