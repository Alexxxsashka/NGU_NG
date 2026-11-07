'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {commandSections,workspaceForPath} from '@/lib/command-sections';

export function WorkspaceSwitch({units,isAdmin,trainingUnitId}:{isAdmin:boolean;trainingUnitId?:string;units:{id:string;name:string}[]}){
 const path=usePathname(),router=useRouter();
 const workspace=workspaceForPath(path);
 const [remembered,setRemembered]=useState('');
 const selected=units.find(unit=>path.startsWith('/command/'+unit.id+'/'));
 useEffect(()=>{
  try{
   if(selected){setRemembered(selected.id);sessionStorage.setItem('ngu.command.unit',selected.id);}
   else setRemembered(sessionStorage.getItem('ngu.command.unit')??'');
  }catch{if(selected)setRemembered(selected.id);}
 },[selected]);
 const current=selected??units.find(unit=>unit.id===remembered)??(units.length===1?units[0]:undefined);
 const section=commandSections.find(([key])=>path.endsWith('/'+key))?.[0]??'overview';
 return <div className="workspace-switch">
  <div className="actions" aria-label="Робочий простір">
   <Link className="button secondary" aria-current={workspace==='personal'?'page':undefined} href="/cabinet">Моя служба</Link>
   <Link className="button secondary" aria-current={workspace==='command'?'page':undefined} href={current?'/command/'+current.id+'/overview':'/command'}>Керування підрозділом</Link>
   {isAdmin&&<Link className="button secondary" aria-current={workspace==='admin'?'page':undefined} href="/admin">Адміністрування</Link>}
  </div>
  {selected&&<label>Підрозділ<select value={selected.id} onChange={event=>router.push('/command/'+event.target.value+'/'+(section==='training'&&event.target.value!==trainingUnitId?'overview':section))}>
   {units.map(unit=><option value={unit.id} key={unit.id}>{unit.name}</option>)}
  </select></label>}
 </div>;
}
