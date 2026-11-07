'use client';

import {useId,useRef,useState,type KeyboardEvent} from 'react';
import Image from 'next/image';
import {CardLink} from './card-link';
import {adminPortalRoutes,portalPreviews,serviceModules,visiblePortalGroups} from '@/lib/portal-navigation';
import {PortalIcon} from './portal-icon';

const covers:Record<string,string>={
 Головне:'cabinet','Моя служба':'service',Підготовка:'training','Моя звітність':'reports',Документи:'documents',Управління:'command',
};
const art:Record<string,string>={
 '/portal/promotion-points':'cabinet/training','/portal/personnel-actions':'unit-actions/rank','/portal/notifications':'workflows/notifications','/cabinet':'tablet','/my-unit':'home/service','/weekly-bonus':'weekly','/weekly-bonus/report':'home/reports',
 '/weekly-bonus/me':'catalog/report-journal','/portal/requests':'home/service','/portal/calendar':'calendar',
 '/portal/training':'training','/portal/lectures':'home/training','/portal/regulations':'home/documents',
 '/portal/orders':'home/documents','/portal/announcements':'home/command','/portal/payments':'weekly',
};
const descriptions:Record<string,string>={
 '/portal/promotion-points':'Виконані завдання й прогрес до наступного звання.',
 '/cabinet':'Службова картка, звання та особисті дані.',
 '/my-unit':'Склад, новини й робоча інформація підрозділу.',
 '/weekly-bonus':'Звіти, перевірка та підсумки звітного тижня.',
 '/weekly-bonus/report':'Додати виконані завдання й посилання на докази.',
 '/weekly-bonus/me':'Переглянути історію, статуси та виплати.',
};

export function PortalMatrix({signedIn=false,admin=false}:{signedIn?:boolean;admin?:boolean}){
 const [active,setActive]=useState('Головне');
 const id=useId();
 const tabs=useRef<(HTMLButtonElement|null)[]>([]);
 const groups=visiblePortalGroups(admin,signedIn).map(group=>{
  const links:Array<readonly [string,string]>=group.links.filter(([href])=>href!=='/');
  if(group.title==='Моя звітність'){
   links.splice(1,0,['/weekly-bonus/report','Подати звіт']);
  }
  return {...group,links};
 }).filter(group=>group.links.length);
 const sections=groups;
 function move(event:KeyboardEvent<HTMLButtonElement>,index:number){
  const next=event.key==='ArrowRight'?(index+1)%sections.length:event.key==='ArrowLeft'?(index+sections.length-1)%sections.length:
   event.key==='Home'?0:event.key==='End'?sections.length-1:null;
  if(next===null)return;
  event.preventDefault();
  setActive(sections[next].title);
  tabs.current[next]?.focus();
 }
 return <section className="home-directory" aria-labelledby={id+'-title'}>
  <div className="home-directory-heading"><h2 id={id+'-title'}>Розділи порталу</h2><span>Швидкий доступ</span></div>
  <div className="home-tablist" role="tablist" aria-label="Категорії порталу">
   {sections.map(({title},index)=><button key={title} ref={button=>{tabs.current[index]=button;}}
    type="button" role="tab" id={id+'-tab-'+index} aria-controls={id+'-panel-'+index} aria-selected={active===title}
    tabIndex={active===title?0:-1} onClick={()=>setActive(title)} onKeyDown={e=>move(e,index)}>
    <Image src={'/portal-art/home/'+(covers[title]||'cabinet')+'.webp'} alt="" fill sizes="144px"/><span>{title}</span>
   </button>)}
  </div>
  {sections.map(({title,links},index)=><div key={title} role="tabpanel" id={id+'-panel-'+index}
   aria-labelledby={id+'-tab-'+index} hidden={active!==title}>
   {active===title&&<div className="home-card-grid">{links.map(([href,label])=>{
    const slug=href.startsWith('/portal/')?href.slice(8):'';
    const preview=slug?portalPreviews[slug]:undefined;
    const pending=!!preview&&slug!=='payments'&&slug!=='notifications'&&slug!=='personnel-actions'&&slug!=='structure'&&!serviceModules.some(module=>module===slug)&&!Object.hasOwn(adminPortalRoutes,slug);
    return <CardLink key={href} href={href} title={label} description={descriptions[href]||preview?.description}
     image={'/portal-art/'+(art[href]||'home/'+(covers[title]||'cabinet'))+'.webp'} icon={<PortalIcon href={href} size={19}/>} badge={pending?'У розробці':undefined}/>;
   })}</div>}
  </div>)}
 </section>;
}
