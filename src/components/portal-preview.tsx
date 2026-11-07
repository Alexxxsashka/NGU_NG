import Link from 'next/link';
import {ArrowUpRight, HardHat, Home, LockKeyhole, PanelTop} from 'lucide-react';
import {PortalIcon} from './portal-icon';
import {portalAdminLinks,portalGroups,portalPreviews} from '@/lib/portal-navigation';

export function PortalPreview({slug,showAdminLinks=false}:{slug:string;showAdminLinks?:boolean}){
 const page=portalPreviews[slug];
 const group=portalGroups.find(group=>group.links.some(([url])=>url==='/portal/'+slug));
 const title=group?.links.find(([url])=>url==='/portal/'+slug)?.[1];
 if(!page||!title)return null;
 return <div id="content" className="portal-preview">
  <nav aria-label="Шлях до сторінки" className="portal-crumb"><Link href="/">Портал НГУ</Link><span>/</span><span>{group?.title}</span></nav>
  <header className="portal-preview-header">
   <div className="portal-preview-insignia"><PortalIcon href={'/portal/'+slug} size={72}/></div>
   <span className="pill prime"><HardHat size={15}/>У розробці</span>
   <h1>{title}</h1>
   <p>{page.description}</p>
  </header>
  <div className="portal-feature-grid">{page.panels.map(([name,description])=><section key={name}><h2><PortalIcon href={'/portal/'+slug}/>{name}</h2><p>{description}</p></section>)}</div>
  {showAdminLinks&&<section className="panel">
   <h2>Доступні інструменти</h2>
   <div className="actions">{portalAdminLinks.map(([href,label])=><Link className="button secondary" key={href} href={href}><PanelTop size={17} aria-hidden="true"/>{label}</Link>)}</div>
  </section>}
  <section className="panel portal-workspace">
   <div className="section-heading"><h2>Робоча область</h2><button type="button" disabled><LockKeyhole size={15} aria-hidden="true"/>{page.action}</button></div>
   <div className="table-wrap"><table><thead><tr>{page.columns.map(column=><th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody><tr><td colSpan={page.columns.length}>Тут з’являться дані після запуску розділу.</td></tr></tbody>
   </table></div>
  </section>
  <Link className="button secondary" href="/"><Home size={16} aria-hidden="true"/>До головної<ArrowUpRight size={16}/></Link>
 </div>;
}
