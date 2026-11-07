import {headers} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {viewer} from '@/lib/auth';
import {ReportForm} from '@/components/report-form';
import {AuthScreen} from '@/components/auth-screen';
import {AdminWorkspace} from '@/components/admin-workspace';
import {Personal} from '@/components/personal';
export default async function Page({params}:{params:Promise<{slug:string[]}>}){
 const {slug}=await params;const path=slug.join('/');
 if(path==='report')return <ReportForm/>;
 if(['login','register','recover','setup'].includes(path))return <AuthScreen mode={path as 'login'|'register'|'recover'|'setup'}/>;
 if(path==='me'){const u=await viewer(await headers());if(!u)redirect('/login');return <Personal/>;}
 if(slug[0]==='admin'){
  const u=await viewer(await headers());if(!u)redirect('/login');if(u.role!=='admin')redirect('/me');
  const section=slug[1]||'overview';if(!['overview','reports','units','tasks','personnel','periods','settings','import','audit'].includes(section)||slug.length>3)notFound();
  return <AdminWorkspace section={section} unitId={section==='units'?slug[2]:undefined}/>;
 }
 notFound();
}
