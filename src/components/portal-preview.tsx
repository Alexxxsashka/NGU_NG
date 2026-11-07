import Link from 'next/link';
import {ArrowUpRight, HardHat} from 'lucide-react';
import {portalGroups,portalPreviews} from '@/lib/portal-navigation';

export function PortalPreview({slug}:{slug:string}){
 const page=portalPreviews[slug];
 const group=portalGroups.find(group=>group.links.some(([url])=>url==='/portal/'+slug));
 const title=group?.links.find(([url])=>url==='/portal/'+slug)?.[1];
 if(!page||!title)return null;
 return <div id="content" className="portal-preview">
  <nav aria-label="Шлях до сторінки" className="portal-crumb"><Link href="/">Портал НГУ</Link><span>/</span><span>{group?.title}</span></nav>
  <header className="portal-preview-header">
   <span className="pill prime"><HardHat size={15}/>У розробці</span>
   <h1>{title}</h1>
   <p>{page.description}</p>
  </header>
  <div className="portal-feature-grid">{page.panels.map(([name,description])=><section key={name}><h2>{name}</h2><p>{description}</p></section>)}</div>
  <section className="panel portal-workspace">
   <div className="section-heading"><h2>Робоча область</h2><button type="button" disabled>{page.action}</button></div>
   <div className="table-wrap"><table><thead><tr>{page.columns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody><tr><td colSpan={page.columns.length}>Тут з’являться дані після запуску розділу.</td></tr></tbody>
   </table></div>
  </section>
  <Link className="button secondary" href="/">До головної<ArrowUpRight size={16}/></Link>
 </div>;
}
