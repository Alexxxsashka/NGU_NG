import {MilitaryTicket} from '@/components/military-ticket';
import Link from 'next/link';
import {query} from '@/db';
import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {viewer} from '@/lib/auth';
import {CommandWorkspace} from '@/components/command-workspace';
import {PromotionPoints} from '@/components/promotion-points';
import {PersonnelWorkflow} from '@/components/personnel-workflow';
import {AwardRegister} from '@/components/award-register';
import {NotificationCenter} from '@/components/notification-center';
import {CardLink} from '@/components/card-link';
import {IllustratedSummary} from '@/components/illustrated-summary';
import {ReportList} from '@/components/report-list';
import {ReportForm} from '@/components/report-form';
import {AuthScreen} from '@/components/auth-screen';
import {AdminWorkspace} from '@/components/admin-workspace';
import {PortalPreview} from '@/components/portal-preview';
import {adminPortalRoutes,portalPreviews,serviceModules,type ServiceModule} from '@/lib/portal-navigation';
import {Personal} from '@/components/personal';
import {UnitSpace} from '@/components/unit-space';
import {ServiceWorkspace} from '@/components/service-workspace';
import {ServiceTablet} from '@/components/service-tablet';
export default async function Page({params,searchParams}:{params:Promise<{slug:string[]}>;searchParams:Promise<{password?:string;next?:string;entry?:string;task?:string;report?:string;from?:string}>}){
 const {slug}=await params;const path=slug.join('/');
 if(path==='weekly-bonus')return <div id="content"><section className="panel portal-preview-header weekly-bonus-banner">
  <h1>Щотижневе преміювання</h1>
  <p>Подавайте звіти за виконані завдання та переглядайте підтверджені результати.</p>
 </section>
 <nav className="home-card-grid portal-shortcuts" aria-label="Щотижневе преміювання">
  <CardLink href="/weekly-bonus/report" title="Подати звіт" description="Додати завдання й докази виконання." image="/portal-art/home/reports.webp"/>
  <CardLink href="/weekly-bonus/me" title="Мої звіти" description="Історія, рішення та виплати." image="/portal-art/catalog/report-journal.webp"/>
 </nav></div>;
 if(path==='weekly-bonus/report'){
  const user=await viewer(await headers());
  if(user?.mustChangePassword)redirect('/cabinet');
  if(!user)return <section id="content" className="panel narrow">
   <h1>Подати звіт на премію</h1>
   <p className="notice error" role="alert">Щоб подати звіт, увійдіть або створіть акаунт.</p>
   <div className="actions"><Link className="button" href="/register?next=report">Створити акаунт</Link><Link className="button secondary" href="/login?next=report">Увійти</Link></div>
  </section>;
  const [profile]=await query<{static_id:string|null;first_name:string|null;last_name:string|null;rank:number|null;unit_id:string|null}>(`SELECT coalesce(p.static_id,substring(u.username from '^static_([0-9]+)$'),
   (SELECT static_id FROM profile_claims WHERE user_id=u.id AND status='pending' ORDER BY created_at DESC LIMIT 1)) AS static_id,
   p.first_name,p.last_name,p.rank,(SELECT id FROM units WHERE id=p.unit_id AND active) AS unit_id FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id AND p.active WHERE u.id=$1`,[user.id]);
  return <ReportForm key={user.id} userId={user.id} profile={profile}/>;
 }
 if(['login','register','recover','setup'].includes(path))return <AuthScreen returnToReport={(await searchParams).next==='report'} passwordChanged={path==='login'&&(await searchParams).password==='changed'} mode={path as 'login'|'register'|'recover'|'setup'}/>;
 if(path==='portal/command')redirect('/command');
 if(path==='portal/administration')redirect('/admin');
 if(path==='my-unit'||path==='portal/structure'||slug[0]==='units'&&slug.length===2){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');return <UnitSpace userId={u.id} ownOnly={path==='my-unit'} unitId={slug[0]==='units'?slug[1]:undefined}/>;}
 if(path==='weekly-bonus/me'){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');return <section id="content"><h1>Мої звіти</h1><details className="account-action profile-action service-reports" open={!!((await searchParams).report||(await searchParams).from)}><IllustratedSummary title="Журнал звітів" image="/portal-art/catalog/report-journal.webp"/><div className="account-action-content"><ReportList personal/></div></details></section>;}
 if(slug[0]==='command'&&(slug.length===1||slug.length===3)){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');return <CommandWorkspace actor={u} unitId={slug[1]} section={slug[2]} filters={await searchParams}/>;}
 if(slug[0]==='portal'&&slug[1]==='promotion-points'&&(slug.length===2||slug.length===3&&['tasks','submit','history'].includes(slug[2]))){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');return <PromotionPoints screen={slug[2]} taskId={(await searchParams).task} focus={(await searchParams).entry}/>;}
 if(path==='portal/military-ticket'){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');return <MilitaryTicket/>;}
 if(path==='cabinet'){const u=await viewer(await headers());if(!u)redirect('/login');return <Personal mustChangePassword={u.mustChangePassword} overview={u.mustChangePassword?null:<ServiceTablet user={u}/>}/>;}
 if(slug[0]==='portal'&&slug.length===2&&Object.hasOwn(portalPreviews,slug[1])){
  const section=slug[1];
  const user=await viewer(await headers());
  if(section==='personnel-actions'){
   if(!user)redirect('/login');
   if(user.mustChangePassword)redirect('/cabinet');
   return <PersonnelWorkflow/>;
  }
  if(section==='notifications'){
   if(!user)redirect('/login');
   if(user.mustChangePassword)redirect('/cabinet');
   return <NotificationCenter/>;
  }
  if(section==='payments'&&user&&!user.mustChangePassword)redirect('/weekly-bonus/me');
  if(serviceModules.includes(section as ServiceModule)){
   if(!user)redirect('/login');
   if(user.mustChangePassword)redirect('/cabinet');
   return <ServiceWorkspace key={section} module={section as ServiceModule} focus={(await searchParams).entry}/>;
  }
  if(!user||user.role!=='admin'||user.mustChangePassword)notFound();
  if(Object.hasOwn(adminPortalRoutes,section))redirect(adminPortalRoutes[section]);
  return <PortalPreview slug={section} showAdminLinks={section==='administration'}/>;
 }
 if(slug[0]==='admin'){
  const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/cabinet');if(u.role!=='admin')notFound();
  if(slug.length===1)redirect('/admin/weekly-bonus');
  if(slug.length===2&&['personnel','audit','unit-directory'].includes(slug[1]))return <AdminWorkspace section={slug[1]}/>;
  if(slug[1]!=='weekly-bonus')notFound();
  const section=slug[2]||'overview';
  if(section==='award-orders'&&slug.length===3)return <AwardRegister/>;
  if(!['overview','reports','units','tasks','periods','settings','import'].includes(section)||slug.length>(section==='units'?4:3))notFound();
  return <AdminWorkspace section={section} unitId={section==='units'?slug[3]:undefined}/>;
 }
 notFound();
}
