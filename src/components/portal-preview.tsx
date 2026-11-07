import Link from 'next/link';
import {ArrowUpRight, HardHat, Home, PanelTop} from 'lucide-react';
import {portalGuides} from '@/lib/portal-guides';
import {IllustratedSummary} from './illustrated-summary';
import {PortalIcon} from './portal-icon';
import {portalAdminLinks,portalGroups,portalPreviews} from '@/lib/portal-navigation';

export function PortalPreview({slug,showAdminLinks=false}:{slug:string;showAdminLinks?:boolean}){
 const page=portalPreviews[slug];
 const guide=portalGuides[slug];
 const group=portalGroups.find(group=>group.links.some(([url])=>url==='/portal/'+slug));
 const title=group?.links.find(([url])=>url==='/portal/'+slug)?.[1];
 if(!page||!title||!guide)return null;
 return <div id="content" className="portal-preview">
  <nav aria-label="Шлях до сторінки" className="portal-crumb"><Link href="/">Портал НГУ</Link><span>/</span><span>{group?.title}</span></nav>
  <header className="portal-preview-header" data-portal-art={slug}>
   <div className="portal-preview-insignia"><PortalIcon href={'/portal/'+slug} size={72}/></div>
   <span className="pill prime"><HardHat size={15}/>{showAdminLinks?'Доступно частково':'У розробці'}</span>
   <h1>{title}</h1>
   <p>{page.description}</p>
  </header>
  <section className="portal-guide">
   <h2>{guide.title}</h2>
   {guide.format==='steps'?<ol className="portal-steps">{guide.topics.map(([name,description])=><li key={name}><h3>{name}</h3><p>{description}</p></li>)}</ol>:
    guide.format==='reference'?<div className="portal-reference">{guide.topics.map(([name,description,artwork])=><details key={name}>{artwork?<IllustratedSummary title={name} artwork={artwork}/>:<summary>{name}</summary>}<p>{description}</p></details>)}</div>:
    <div className="portal-feature-grid">{guide.topics.map(([name,description])=><section key={name}><h3>{name}</h3><p>{description}</p></section>)}</div>}
   {guide.link&&<Link className="button secondary" href={guide.link[0]}>{guide.link[1]}<ArrowUpRight size={16} aria-hidden="true"/></Link>}
  </section>
  {showAdminLinks&&<section className="panel">
   <h2>Доступні інструменти</h2>
   <div className="actions">{portalAdminLinks.map(([href,label])=><Link className="button secondary" key={href} href={href}><PanelTop size={17} aria-hidden="true"/>{label}</Link>)}</div>
  </section>}
  <Link className="button secondary" href="/"><Home size={16} aria-hidden="true"/>До головної<ArrowUpRight size={16}/></Link>
 </div>;
}
