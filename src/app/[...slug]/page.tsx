import Link from 'next/link';
import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {viewer} from '@/lib/auth';
import {ReportForm} from '@/components/report-form';
import {AuthScreen} from '@/components/auth-screen';
import {AdminWorkspace} from '@/components/admin-workspace';
import {PortalPreview} from '@/components/portal-preview';
import {adminPortalRoutes,portalPreviews} from '@/lib/portal-navigation';
import {Personal} from '@/components/personal';
import {UnitSpace} from '@/components/unit-space';
import {ServiceTablet} from '@/components/service-tablet';
export default async function Page({params,searchParams}:{params:Promise<{slug:string[]}>;searchParams:Promise<{password?:string}>}){
 const {slug}=await params;const path=slug.join('/');
 if(path==='weekly-bonus')return <section id="content" className="panel narrow">
  <h1>Щотижневе преміювання</h1>
  <p>Подавайте звіти за виконані завдання та переглядайте підтверджені результати.</p>
  <div className="actions">
   <Link className="button" href="/weekly-bonus/report">Подати звіт</Link>
   <Link className="button secondary" href="/weekly-bonus/me">Мої звіти</Link>
  </div>
 </section>;
 if(path==='weekly-bonus/report')return <ReportForm/>;
 if(['login','register','recover','setup'].includes(path))return <AuthScreen passwordChanged={path==='login'&&(await searchParams).password==='changed'} mode={path as 'login'|'register'|'recover'|'setup'}/>;
 if(path==='my-unit'||slug[0]==='units'&&slug.length===2){const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword)redirect('/weekly-bonus/me');return <UnitSpace userId={u.id} unitId={slug[1]}/>;}
 if(path==='weekly-bonus/me'){const u=await viewer(await headers());if(!u)redirect('/login');return <Personal mustChangePassword={u.mustChangePassword} overview={u.mustChangePassword?null:<ServiceTablet user={u}/>}/>;}
 if(slug[0]==='portal'&&slug.length===2&&Object.hasOwn(portalPreviews,slug[1])){
  const section=slug[1];
  const user=await viewer(await headers());
  if(!user||user.role!=='admin'||user.mustChangePassword)notFound();
  if(Object.hasOwn(adminPortalRoutes,section))redirect(adminPortalRoutes[section]);
  return <PortalPreview slug={section} showAdminLinks={section==='administration'}/>;
 }
 if(slug[0]==='admin'){
  const u=await viewer(await headers());if(!u)redirect('/login');if(u.mustChangePassword||u.role!=='admin')redirect('/weekly-bonus/me');
  if(slug.length===1)redirect('/admin/weekly-bonus');
  if(slug.length===2&&['personnel','audit'].includes(slug[1]))return <AdminWorkspace section={slug[1]}/>;
  if(slug[1]!=='weekly-bonus')notFound();
  const section=slug[2]||'overview';
  if(!['overview','reports','units','tasks','periods','settings','import'].includes(section)||slug.length>(section==='units'?4:3))notFound();
  return <AdminWorkspace section={section} unitId={section==='units'?slug[3]:undefined}/>;
 }
 notFound();
}
