'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {notifications} from '@/lib/notifications';
import {api,Loading,Notice,useResource} from './ui';

export function NotificationCenter(){
 const resource=useResource<Awaited<ReturnType<typeof notifications>>>('me/notifications');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function mark(id?:string){
  setBusy(true);setError('');
  try{await api('me/notifications',{id});await resource.refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const unread=resource.data?.filter(item=>!item.read).length??0;
 return <div id="content">
  <header className="portal-preview-header feature-cover notifications-cover"><h1>Сповіщення</h1><p>Непрочитаних: {unread}</p></header>
  {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}
  {resource.loading&&!resource.data&&<Loading/>}
  <section className="panel portal-shortcuts">
   <button type="button" disabled={!unread||busy} onClick={()=>void mark()}>Позначити всі як прочитані</button>
   {resource.data?.length===0&&<p>Сповіщень поки немає.</p>}
   <ul className="cabinet-items">{resource.data?.map(item=><li key={item.id}>
    <Link href={item.href}>{item.title}</Link>
    <time>{new Date(item.created).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}</time>
    {!item.read&&<button type="button" className="text-button notification-read" disabled={busy} onClick={()=>void mark(item.id)}>Позначити як прочитане</button>}
   </li>)}</ul>
  </section>
 </div>;
}
