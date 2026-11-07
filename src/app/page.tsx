import Image from 'next/image';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {headers} from 'next/headers';
import {viewer} from '@/lib/auth';
import {PortalIcon} from '@/components/portal-icon';
import {adminPortalRoutes,portalGroups} from '@/lib/portal-navigation';

export default async function Home(){
 const user=await viewer(await headers()).catch(()=>null);
 const admin=user?.role==='admin'&&!user.mustChangePassword;
 return <div id="content">
  <section className="hero">
   <div className="formation-photo">
    <Image src="/ngu-formation.png" alt="Бійці НГУ на вечірньому шикуванні у Форт-Занкудо" width={1672} height={941} preload/>
   </div>
   <div className="hero-copy">
    <span className="hero-tag">Форт-Занкудо / NG GTA 5 RP</span>
    <h1>Портал НГУ</h1>
    <p>Єдина інформаційна система Національної гвардії в NG GTA 5 RP. Особовий склад, підготовка, документи та щотижневе преміювання.</p>
    <div className="actions">
     <Link className="button gold" href="/weekly-bonus"><PortalIcon href="/weekly-bonus"/>Щотижневе преміювання</Link>
     <Link className="button secondary portal-hero-link" href="/weekly-bonus/me"><PortalIcon href="/weekly-bonus/me"/>Особистий кабінет</Link>
    </div>
   </div>
  </section>
  <section className="portal-index" aria-labelledby="portal-index-title">
   <h2 id="portal-index-title">Розділи порталу</h2>
   <div className="portal-index-grid">{portalGroups.map(group=><section className="portal-index-group" key={group.title}>
    <h3><PortalIcon href={group.links[0][0]} size={22}/>{group.title}</h3>
    {group.links.map(([href,label])=><Link key={href} href={href}><PortalIcon href={href}/><span>{label}</span>{href.startsWith('/portal/')&&!(admin&&Object.hasOwn(adminPortalRoutes,href.slice(8)))&&<small>{admin&&href==='/portal/administration'?'Доступно частково':'У розробці'}</small>}<ArrowUpRight aria-hidden="true" size={15}/></Link>)}
   </section>)}</div>
  </section>
 </div>;
}
