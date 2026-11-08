import Link from 'next/link';
import {ArrowUpRight,Bell,CalendarDays,ClipboardList,FileText,GraduationCap,Users} from 'lucide-react';
import type {Viewer} from '@/lib/domain';
import {dateLabel} from '@/lib/domain';
import {notifications} from '@/lib/notifications';
import {loadCabinetActivity} from '@/lib/cabinet-activity';
import {promotionRankName} from '@/lib/promotion-rules';
import {promotionProgress} from '@/lib/promotion-points';
import {promotionChecklist} from '@/lib/promotion-checklist';
import {promotionRestriction} from '@/lib/promotion-limit';
import {query} from '@/db';
import {ResumePromotionDraft} from './resume-promotion-draft';
import {CardLink} from './card-link';

const shortcuts=[
 ['/portal/promotion-points/submit','Звіт на підвищення','Подати завдання, додати докази й переглянути бали.','unit-actions/rank',ClipboardList],
 ['/my-unit','Мій підрозділ','Склад, новини й службова інформація.','cabinet/unit',Users],
 ['/portal/requests','Службові заявки','Подання заявок і рішення командування.','cabinet/requests',ClipboardList],
 ['/portal/military-ticket','Військовий квиток','Умови КМБ і УКМБ та стан видачі.','cabinet/training',GraduationCap],
 ['/portal/calendar','Календар','Найближчі заходи підрозділу.','cabinet/calendar',CalendarDays],
 ['/portal/regulations','Документи','Чинні документи й регламенти підрозділу.','cabinet/documents',FileText],
] as const;
const entryLink=(module:string,id:string)=>'/portal/'+module+'?entry='+encodeURIComponent(id)+'#service-'+id;
const shortDate=new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'medium'});

export async function CabinetActivity({user,today,joinedOn,joinedVerified,historyPage=1}:{user:Viewer;today:string;joinedOn?:string|null;joinedVerified?:boolean;historyPage?:number}){
 const [{requests,learning,event,reports,history,hasMoreHistory,promotionClarifications},feed,progress]=await Promise.all([loadCabinetActivity(user.id,today,historyPage),notifications(user.id),promotionProgress(user.id)]);
 const timeline=[...history.map(item=>({...item,date:new Date(item.date).toISOString()})),
  ...(joinedOn&&historyPage===1?[{id:'joined',date:joinedOn+'T12:00:00.000Z',label:joinedVerified?'Підтверджена дата вступу до НГУ':'Заявлена дата вступу до НГУ',detail:null,author:null,reason:null}]:[]),
 ].sort((a,b)=>b.date.localeCompare(a.date));
 const complete=learning.filter(item=>item.status==='passed').length;
 const next=learning.find(item=>item.status!=='passed');
 const attention=[
  ...promotionClarifications.map(item=>({key:'promotion-'+item.id,title:'Доповнити виконання: '+item.title,detail:item.reason,
   href:'/portal/promotion-points/history?'+new URLSearchParams({entry:item.id})})),
  ...requests.filter(item=>item.status==='clarification').map(item=>({key:item.id,title:'Уточнити заявку: '+item.title,detail:item.decision,href:entryLink('requests',item.id)})),
  ...reports.map(report=>({key:report.id,title:'Звіт '+report.number+' потребує уточнення',detail:report.reason,
   href:'/weekly-bonus/me?'+new URLSearchParams({from:report.week,to:report.week,report:report.id})+'#report-'+report.id})),
  ...learning.filter(item=>item.status==='retry').slice(0,5).map(item=>({key:item.id,title:'Повторити етап КМБ: '+item.title,detail:null,href:entryLink('training',item.id)})),
  ...requests.filter(item=>item.status!=='clarification').map(item=>({key:item.id,title:(item.status==='approved'?'Погоджено: ':'Відхилено: ')+item.title,detail:item.decision,href:entryLink('requests',item.id)})),
 ];
 const [first,...remaining]=attention.filter((item,index)=>attention.findIndex(candidate=>candidate.key===item.key)===index);
 const urgent=first&&!requests.some(request=>request.id===first.key&&request.status!=='clarification')?first:null;
 let ready=false;
 if(!urgent&&progress.profile&&progress.step&&progress.points>=progress.step[2]){
  const [restriction,checklist,pending,nextRank]=await Promise.all([
   promotionRestriction(progress.profile.id),promotionChecklist(progress.profile),
   query("SELECT 1 FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'userId'=$1 AND value->>'status'='pending' LIMIT 1",[user.id]),
   query<{name:string}>('SELECT name FROM ranks WHERE id=$1',[progress.profile.rank+1]),
  ]);
  ready=!restriction&&!pending.length&&!!nextRank[0]&&
   promotionRankName(progress.profile.rank+1,nextRank[0].name).toLocaleLowerCase('uk')===progress.step[1].toLocaleLowerCase('uk')&&
   checklist.every(item=>!!item.confirmation);
 }
 const primary=urgent??(ready?{href:'/portal/personnel-actions',title:'Подати запит на підвищення',detail:null}:null);
 const other=urgent?remaining:first?[first,...remaining]:[];
 return <>
  <div className="cabinet-overview">
   <section className="panel" aria-labelledby="cabinet-attention">
    <h2 id="cabinet-attention"><Bell size={19} aria-hidden="true"/> Потребує уваги</h2>
    <p><Link href="/portal/notifications">Сповіщення · {feed.filter(item=>!item.read).length} непрочитаних</Link></p>
    {primary?<><Link className="button" href={primary.href}>{primary.title}<ArrowUpRight size={15} aria-hidden="true"/></Link>
     {primary.detail&&<p>{primary.detail}</p>}
    </>:<ResumePromotionDraft userId={user.id} fallback={first}/>}
    {other.length>0&&<details><summary>Інші справи ({other.length})</summary><ul className="cabinet-items">{other.map(item=><li key={item.key}>
     <Link href={item.href}>{item.title}</Link>{item.detail&&<p>{item.detail}</p>}
    </li>)}</ul></details>}
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
   <p><Link href="/portal/discipline">Мої дисциплінарні справи</Link></p>
   {timeline.length?<ol className="cabinet-items">
    {timeline.map(item=><li key={item.id}><time dateTime={item.date}>{shortDate.format(new Date(item.date))}</time>
     <strong>{item.label}</strong>{item.detail&&<p>{item.detail}</p>}
     {(item.author||item.reason)&&<details><summary>Деталі рішення</summary>
      {item.author&&<p>Оформив: {item.author}</p>}{item.reason&&<p>{item.reason}</p>}
     </details>}</li>)}
   </ol>:<p className="muted">На цій сторінці записів немає.</p>}
   {(historyPage>1||hasMoreHistory)&&<nav className="pagination" aria-label="Сторінки історії служби">
    {historyPage>1&&<Link href={'/cabinet?historyPage='+(historyPage-1)+'#cabinet-history'}>Назад</Link>}
    <span>Сторінка {historyPage}</span>
    {hasMoreHistory&&historyPage<10000&&<Link href={'/cabinet?historyPage='+(historyPage+1)+'#cabinet-history'}>Далі</Link>}
   </nav>}
  </section>
 </>;
}
