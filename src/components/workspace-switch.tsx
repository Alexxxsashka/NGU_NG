'use client';
import Link from 'next/link';
import {ChevronDown} from 'lucide-react';
import {usePathname} from 'next/navigation';
import {commandSections,workspaceForPath} from '@/lib/command-sections';

export function WorkspaceSwitch({units,isAdmin,trainingUnitId,disciplineAccess}:{isAdmin:boolean;trainingUnitId?:string;disciplineAccess:boolean;units:{id:string;name:string;appoint:boolean}[]}){
 const path=usePathname();
 const workspace=workspaceForPath(path);
 const selected=units.find(unit=>path.startsWith('/command/'+unit.id+'/'));
 const section=commandSections.find(([key])=>path.endsWith('/'+key))?.[0]??'overview';
 return <div className="workspace-switch portal-workspace-bar">
  <nav className="actions" aria-label="Робочі простори">
   <Link className="button secondary" aria-current={workspace==='personal'?'true':undefined} href="/cabinet">Моя служба</Link>
   {(units.length>0||disciplineAccess)&&<Link className="button secondary" aria-current={workspace==='command'?'true':undefined} href={units.length?'/command':'/command/discipline'}>{units.some(unit=>unit.appoint)?'Керування фракцією':'Керування'}</Link>}
   {isAdmin&&<Link className="button secondary" aria-current={workspace==='admin'?'true':undefined} href="/admin">Адміністрування</Link>}
  </nav>
  {selected&&(units.length>1?<details className="unit-switcher" key={path}>
   <summary>Підрозділ · {selected.name}<ChevronDown size={16} aria-hidden="true"/></summary>
   <nav aria-label="Вибір підрозділу">{units.map(unit=>{
    const available=(section!=='training'||unit.id===trainingUnitId)&&(section!=='assignment-conflicts'||unit.appoint);
    return <Link href={'/command/'+unit.id+'/'+(available?section:'overview')} aria-current={unit.id===selected.id?'true':undefined} key={unit.id}>{unit.name}</Link>;
   })}</nav>
  </details>:<span className="muted">Підрозділ · {selected.name}</span>)}
 </div>;
}
