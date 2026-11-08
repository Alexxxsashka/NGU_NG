'use client';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {Shield,ClipboardList,ChartNoAxesCombined,Users,SlidersHorizontal,CalendarDays,Upload,LogOut,UserRound,Menu,ChevronDown} from 'lucide-react';
import {useState,type ReactNode} from 'react';
import {WorkspaceSwitch} from './workspace-switch';
import {commandSections,workspaceForPath} from '@/lib/command-sections';
import {PortalIcon} from './portal-icon';
import {visiblePortalGroups} from '@/lib/portal-navigation';
import type {Viewer} from '@/lib/domain';
const bonusLinks=[['/admin/weekly-bonus','Огляд',ChartNoAxesCombined],['/admin/weekly-bonus/reports','Звіти',ClipboardList],['/admin/weekly-bonus/units','Зведення за підрозділами',Users],['/admin/weekly-bonus/tasks','Завдання і бали',SlidersHorizontal],['/admin/weekly-bonus/periods','Звітні тижні',CalendarDays],['/admin/weekly-bonus/settings','Налаштування',SlidersHorizontal],['/admin/weekly-bonus/import','Перенесення історії',Upload]] as const;
const commandGroups=[
 ['Огляд і склад',['overview','roster','assignment-conflicts','audit']],
 ['Черги й рішення',['queue','requests','review','promotion-decisions','catalog','orders']],
 ['Робота підрозділу',['content','documents','calendar','training','military-ticket']],
] as const;
function matchesPath(path:string,href:string){return path===href||href!=='/'&&path.startsWith(href+'/');}
export function Shell({user,children,commandUnits,trainingUnitId,disciplineAccess}:{user:Viewer|null;children:ReactNode;trainingUnitId?:string;disciplineAccess:boolean;commandUnits:{id:string;name:string;appoint:boolean}[]}){
 const pathname=usePathname(),router=useRouter();const [menu,setMenu]=useState(false),[error,setError]=useState('');
 const isAdmin=user?.role==='admin'&&!user.mustChangePassword;
 const workspace=workspaceForPath(pathname);
 const inCommand=workspace==='command';
 const commandUnit=commandUnits.find(unit=>pathname.startsWith('/command/'+unit.id+'/'));
 const signedIn=!!user&&!user.mustChangePassword;
 const personalGroups=visiblePortalGroups(false,signedIn);
 const currentPersonal=personalGroups.flatMap(group=>group.links).filter(([href])=>matchesPath(pathname,href)).sort(([a],[b])=>b.length-a.length)[0]?.[0];
 const closeMenu=()=>setMenu(false);
 const bonusAdminOpen=pathname==='/admin/weekly-bonus'||pathname.startsWith('/admin/weekly-bonus/');
 async function logout(){setError('');try{const r=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw new Error();router.push('/login');router.refresh();}catch{setError('Не вдалося завершити сеанс.');}}
 return <div className="app-shell"><aside className={'sidebar '+(menu?'open':'')}><Link href={inCommand?'/command':workspace==='admin'?'/admin':'/'} className="brand"><span className="brand-mark"><Image src="/ngu-emblem.svg" alt="" width={44} height={44}/></span><span><strong>НГУ</strong><small>Єдина інформаційна система</small></span></Link><button className="mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="portal-sidebar" aria-label="Навігація"><Menu/></button><nav id="portal-sidebar" aria-label="Головна навігація" key={pathname}>
 {workspace==='personal'&&personalGroups.map(group=><details className="portal-nav-group" key={group.title} open={group.links.some(([href])=>currentPersonal===href)||group.title==='Головне'}>
  <summary className="nav-label">{group.title}<ChevronDown size={14} aria-hidden="true"/></summary>
  {group.links.map(([href,label])=><Link key={href} onClick={closeMenu} href={href} aria-current={currentPersonal===href?'page':undefined} className={currentPersonal===href?'selected':''}><PortalIcon href={href}/><span className="portal-nav-label">{label}</span></Link>)}
 </details>)}
 {inCommand&&commandUnits.length>0&&<Link href="/command" onClick={closeMenu} aria-current={pathname==='/command'?'page':undefined} className={pathname==='/command'?'selected':''}><Users size={18}/>Зведення підрозділів</Link>}
 {inCommand&&disciplineAccess&&<Link href="/command/discipline" onClick={closeMenu} aria-current={pathname==='/command/discipline'?'page':undefined} className={pathname==='/command/discipline'?'selected':''}><Shield size={18}/>Дисциплінарний облік ВСП</Link>}
 {inCommand&&commandUnit&&commandGroups.map(([title,keys])=>{
  const root='/command/'+commandUnit.id+'/';
  const links=commandSections.filter(([key])=>keys.some(item=>item===key)&&(key!=='training'||commandUnit.id===trainingUnitId)&&(key!=='assignment-conflicts'||commandUnit.appoint));
  return <details className="portal-nav-group" key={title} open={links.some(([key])=>pathname===root+key)}>
   <summary className="nav-label">{title}<ChevronDown size={14} aria-hidden="true"/></summary>
   {links.map(([key,label])=><Link href={root+key} key={key} onClick={closeMenu} aria-current={pathname===root+key?'page':undefined} className={pathname===root+key?'selected':''}>{label}</Link>)}
  </details>;
 })}
{isAdmin&&workspace==='admin'&&<details className="portal-nav-group" open={pathname.startsWith('/admin')}><summary className="nav-label">Робоча адмінпанель<ChevronDown size={14} aria-hidden="true"/></summary><Link onClick={()=>setMenu(false)} className={bonusAdminOpen?'selected':''} href="/admin/weekly-bonus"><SlidersHorizontal size={18}/>Налаштування щотижневого преміювання</Link>
 {bonusAdminOpen&&<div className="bonus-nav">{bonusLinks.map(([href,label,Icon])=><Link onClick={()=>setMenu(false)} className={pathname===href||(href==='/admin/weekly-bonus/units'&&pathname.startsWith(href+'/'))?'selected':''} key={href} href={href}><Icon size={18}/>{label}</Link>)}</div>}
 <Link onClick={()=>setMenu(false)} href="/admin/unit-directory" aria-current={pathname==='/admin/unit-directory'?'page':undefined}><SlidersHorizontal size={18}/>Довідник підрозділів</Link>
 <Link onClick={()=>setMenu(false)} className={pathname==='/admin/personnel'?'selected':''} href="/admin/personnel"><UserRound size={18}/>Особовий склад</Link>
 <Link onClick={closeMenu} href="/admin/audit" aria-current={pathname==='/admin/audit'?'page':undefined} className={pathname==='/admin/audit'?'selected':''}>Системний аудит</Link>
 <Link onClick={()=>setMenu(false)} href="/admin/weekly-bonus/award-orders">Накази про преміювання</Link></details>}</nav><div className="sidebar-bottom"><span className="flag"/>Ігрова організація<br/><small>NG GTA 5 RP</small></div></aside><div className="workspace"><header className="topbar"><span>Національна гвардія України</span><div>{user?<><details className="portal-account-menu" key={pathname}><summary><UserRound size={16}/><span className="account-name">{user.name}</span><ChevronDown size={14}/></summary>
 <div>{signedIn&&<><Link href="/cabinet">Особистий кабінет</Link><Link href="/portal/notifications">Сповіщення</Link></>}<button className="text-button" onClick={logout}><LogOut size={16}/>Вийти</button></div></details></>:<Link className="text-button" href="/login"><UserRound size={16}/>Увійти</Link>}</div></header><main>{signedIn&&<WorkspaceSwitch units={commandUnits} isAdmin={isAdmin} trainingUnitId={trainingUnitId} disciplineAccess={disciplineAccess}/>}{user?.role==='admin'&&!user.mustChangePassword&&<div className="admin-banner"><Shield size={18}/><strong>Ви увійшли як адміністратор</strong></div>}{error&&<p role="alert" className="notice error">{error}</p>}{children}</main><footer>Портал НГУ · NG GTA 5 RP. Не є офіційним державним сервісом.</footer></div></div>;
}
