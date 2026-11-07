import Link from 'next/link';
import {ArrowUpRight,Bell,CalendarDays,ClipboardList,FileText,GraduationCap,Users} from 'lucide-react';
import type {Viewer} from '@/lib/domain';
import {dateLabel} from '@/lib/domain';
import {notifications} from '@/lib/notifications';
import {loadCabinetActivity} from '@/lib/cabinet-activity';
import {CardLink} from './card-link';

const shortcuts=[
 ['/portal/promotion-points#promotion-submit','Звіт на підвищення','Подати завдання, додати докази й переглянути бали.','unit-actions/rank',ClipboardList],
 ['/my-unit','Мій підрозділ','Склад, новини й службова інформація.','cabinet/unit',Users],
 ['/portal/requests','Службові заявки','Подання заявок і рішення командування.','cabinet/requests',ClipboardList],
 ['/portal/training','КМБ','Етапи підготовки та результати.','cabinet/training',GraduationCap],
 ['/portal/calendar','Календар','Найближчі заходи підрозділу.','cabinet/calendar',CalendarDays],
 ['/portal/regulations','Документи','Чинні документи й регламенти підрозділу.','cabinet/documents',FileText],
] as const;
const entryLink=(module:string,id:string)=>'/portal/'+module+'?entry='+encodeURIComponent(id)+'#service-'+id;
const shortDate=new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium'});

export async function CabinetActivity({user,today,joinedOn}:{user:Viewer;today:string;joinedOn?:string|null}){
 const [{requests,learning,event,reports,history},feed]=await Promise.all([loadCabinetActivity(user.id,today),notifications(user.id)]);
 const timeline=[...history.map(item=>({...item,date:new Date(item.date).toISOString()})),
  ...(joinedOn?[{id:'joined',date:joinedOn+'T12:00:00.000Z',label:'Дата вступу до НГУ',detail:null}]:[]),
 ].sort((a,b)=>b.date.localeCompare(a.date));
 const complete=learning.filter(item=>item.status==='passed').length;
 const next=learning.find(item=>item.status!=='passed');
 const attention=[
  ...reports.map(report=>({key:report.id,title:'Звіт '+report.number+' потребує уточнення',detail:report.reason,
   href:'/weekly-bonus/me?'+new URLSearchParams({from:report.week,to:report.week,report:report.id})+'#report-'+report.id})),
  ...learning.filter(item=>item.status==='retry').slice(0,5).map(item=>({key:item.id,title:'Повторити етап КМБ: '+item.title,detail:null,href:entryLink('training',item.id)})),
  ...requests.map(item=>({key:item.id,title:(item.status==='approved'?'Погоджено: ':'Відхилено: ')+item.title,detail:item.decision,href:entryLink('requests',item.id)})),
 ];
 return <>
  <div className="cabinet-overview">
   <section className="panel" aria-labelledby="cabinet-attention">
    <h2 id="cabinet-attention"><Bell size={19} aria-hidden="true"/> Потребує уваги</h2>
    <p><Link href="/portal/notifications">Сповіщення · {feed.filter(item=>!item.read).length} непрочитаних</Link></p>
    {attention.length?<ul className="cabinet-items">{attention.map(item=><li key={item.key}>
     <Link href={item.href}>{item.title}<ArrowUpRight size={15} aria-hidden="true"/></Link>
     {item.detail&&<p>{item.detail}</p>}
    </li>)}</ul>:<p className="muted">Звітів на уточненні, повторних етапів КМБ і рішень за заявками поки немає.</p>}
   </section>
   <div className="cabinet-status">
    <section className="panel"><h2>Найближча подія</h2>
     {event?.date?<><time dateTime={event.date}>{dateLabel(event.date)}</time><p><Link href={entryLink('calendar',event.id)}>{event.title}</Link></p></>:<p className="muted">У календарі підрозділу поки немає запланованих подій.</p>}
    </section>
    <section className="panel"><h2>Прогрес КМБ</h2>
     {learning.length?<><p>{complete} із {learning.length} етапів зараховано</p><progress aria-label="Зараховані етапи КМБ" value={complete} max={learning.length}/>
      <p>{next?<Link href={entryLink('training',next.id)}>{next.status==='retry'?'Повторити: ':'Наступний етап: '}{next.title}</Link>:'Усі опубліковані етапи зараховано.'}</p></>:<p className="muted">Для вашого підрозділу ще немає опублікованих етапів.</p>}
    </section>
   </div>
  </div>
  <section className="portal-shortcuts" aria-labelledby="cabinet-shortcuts">
   <h2 id="cabinet-shortcuts">Моя служба</h2>
   <div className="home-card-grid">{shortcuts.map(([href,title,description,art,Icon])=><CardLink key={href} href={href} title={title} description={description} image={'/portal-art/'+art+'.webp'} icon={<Icon size={19} aria-hidden="true"/>}/>)}</div>
  </section>
  <section className="panel" aria-labelledby="cabinet-history">
   <h2 id="cabinet-history">Історія служби</h2>
   {timeline.length?<ol className="cabinet-items">
    {timeline.map(item=><li key={item.id}><time dateTime={item.date}>{shortDate.format(new Date(item.date))}</time>
     <strong>{item.label}</strong>{item.detail&&<p>{item.detail}</p>}</li>)}
   </ol>:<p className="muted">Кадрових рішень і результатів навчання поки немає.</p>}
  </section>
 </>;
}
