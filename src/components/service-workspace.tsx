'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {serviceWorkspace} from '@/lib/service-workspace';
import {evidenceLines} from '@/lib/report-limits';
import type {ServiceModule} from '@/lib/portal-navigation';
import {IllustratedSummary} from './illustrated-summary';
import {api,Field,Loading,Notice,useResource} from './ui';

const labels:Record<ServiceModule,string>={
 requests:'Службові заявки',training:'КМБ і навчальний центр',calendar:'Календар служби',
 regulations:'Документи та регламенти',announcements:'Новини й оголошення',orders:'Накази та розпорядження',lectures:'Навчальні матеріали',
};
const actions:Record<ServiceModule,string>={
 requests:'Створити заявку',training:'Додати етап КМБ',calendar:'Додати подію',regulations:'Додати документ',
 announcements:'Додати новину',orders:'Додати наказ',lectures:'Додати матеріал',
};
const artwork:Record<ServiceModule,string>={requests:'transfer',training:'briefing',calendar:'assembly',regulations:'garrison',announcements:'command',orders:'approval',lectures:'radio'};
const statusLabels={clarification:'Потребує уточнення',pending:'На розгляді',approved:'Погоджено',rejected:'Відхилено'};

export function ServiceWorkspace({module,focus,unitId}:{module:ServiceModule;focus?:string;unitId?:string}){
 const {data,error,refresh}=useResource<Awaited<ReturnType<typeof serviceWorkspace>>>('service/'+module+'?'+new URLSearchParams({...focus?{entry:focus}:{},...unitId?{unit:unitId}:{}}));
 const visitedEntry=useRef<string|null>(null);
 useEffect(()=>{
  if(!focus||visitedEntry.current===focus||!data?.entries.some(entry=>entry.id===focus))return;
  document.getElementById('service-'+focus)?.scrollIntoView({block:'start'});
  visitedEntry.current=focus;
 },[data,focus]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 async function save(event:FormEvent<HTMLFormElement>,make:(fields:FormData)=>unknown){
  event.preventDefault();
  const form=event.currentTarget;
  const payload=make(new FormData(form));
  setBusy(true);setMessage('');setFailure('');
  try{await api('service',payload);form.reset();await refresh();setMessage('Зміни збережено.');}
  catch(e){setFailure((e as Error).message);}
  finally{setBusy(false);}
 }
 const [requestType,setRequestType]=useState('Переведення');
 const [requestFilter,setRequestFilter]=useState('');
 const [documentSearch,setDocumentSearch]=useState(''),[category,setCategory]=useState(''),[archive,setArchive]=useState(false);
 const categories=[...new Set(data?.entries.map(entry=>entry.category||'Без категорії'))].sort();
 const visibleEntries=data?.entries.filter(entry=>module==='requests'?(!requestFilter||entry.status===requestFilter||(requestFilter==='applied'&&entry.appliedAt)):module!=='regulations'||(
  !!entry.archived===archive&&(!category||(entry.category||'Без категорії')===category)&&
  [entry.title,entry.body,entry.revision].some(text=>text?.toLocaleLowerCase('uk').includes(documentSearch.trim().toLocaleLowerCase('uk')))
 ));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
 const editors=data?.units.filter(unit=>unit.editor)??[];
 const canEdit=(id?:string|null)=>editors.some(unit=>unit.id===id);
 return <div id="content">
  <header className="portal-preview-header" data-portal-art={module}><h1>{labels[module]}</h1></header>
  {error&&<Notice error>{error} <button className="text-button" onClick={refresh}>Повторити</button></Notice>}
  {failure&&<Notice error>{failure}</Notice>}{message&&<Notice>{message}</Notice>}
  {!data&&!error&&<Loading/>}
  {data&&((module==='requests'&&!unitId)||(module!=='requests'&&editors.length>0))&&<details className="account-action profile-action">
   <IllustratedSummary title={actions[module]} image={'/portal-art/catalog/'+artwork[module]+'.webp'}/>
   <form className="stack account-action-content" onSubmit={e=>void save(e,f=>module==='requests'?
    {kind:'request',type:f.get('type'),body:f.get('body'),targetUnit:f.get('targetUnit')||undefined,from:f.get('from')||undefined,to:f.get('to')||undefined,links:evidenceLines(String(f.get('links')??''))}:
    {kind:'publish',module,unit:f.get('unit'),title:f.get('title'),body:f.get('body'),
     date:f.get('date')||undefined,url:f.get('url')||undefined,revision:f.get('revision')||undefined,category:f.get('category')||undefined,replaces:f.get('replaces')||undefined,draft:f.has('draft'),requiresProof:f.has('requiresProof'),responsible:f.get('responsible')||undefined})}>
    {module==='requests'?<>
     <Field label="Тип заявки"><select name="type" value={requestType} onChange={e=>setRequestType(e.target.value)}>{['Переведення','Відпустка','Вступ або поновлення','Звільнення','Звільнення або оскарження','Виправлення особової справи'].map(type=><option key={type}>{type}</option>)}</select></Field>
     {['Переведення','Вступ або поновлення'].includes(requestType)&&<Field label="Бажаний підрозділ"><select name="targetUnit" required><option value="">Оберіть підрозділ</option>{data.targets.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
     {requestType==='Відпустка'&&<div className="form-grid"><Field label="Від"><input name="from" type="date" required/></Field><Field label="До"><input name="to" type="date" required/></Field></div>}
     <Field label="Докази"><textarea name="links" placeholder="Одне HTTPS-посилання на рядок"/></Field>
    </>:<>
     <Field label="Підрозділ"><select name="unit">{editors.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
     <Field label="Заголовок"><input name="title" maxLength={120} required/></Field>
     {module==='regulations'&&<>
      <Field label="Категорія"><input name="category" maxLength={120} list="document-categories"/><datalist id="document-categories">{categories.map(name=><option key={name} value={name}/>)}</datalist></Field>
      <Field label="Попередня редакція"><select name="replaces"><option value="">Новий документ</option>{data.entries.filter(entry=>!entry.archived&&!entry.draft&&canEdit(entry.unit)).map(entry=><option key={entry.id} value={entry.id}>{entry.title} · {data.units.find(unit=>unit.id===entry.unit)?.name}</option>)}</select></Field>
     </>}
     {['calendar','training'].includes(module)&&<Field label="Відповідальний"><input name="responsible" maxLength={120}/></Field>}
     {module==='training'&&<Field label="Навчальна група"><input name="category" maxLength={120}/></Field>}
     {module==='training'&&<label className="checkbox"><input name="requiresProof" type="checkbox"/>Вимагати докази для зарахування</label>}
     <label className="checkbox"><input name="draft" type="checkbox"/>Зберегти як чернетку</label>
     <p className="muted">Після публікації запис буде доступний учасникам вибраного підрозділу.</p>
     {module==='calendar'&&<Field label="Дата"><input type="date" name="date" required/></Field>}
     {['regulations','orders','lectures'].includes(module)&&<>
      <Field label="Редакція або номер"><input name="revision" maxLength={120}/></Field>
      <Field label="Посилання HTTPS"><input type="url" name="url"/></Field>
     </>}
    </>}
    <Field label={module==='requests'?'Підстава й дати':'Текст або опис'}><textarea name="body" rows={4} maxLength={5000} required/></Field>
    <button disabled={busy}>{module==='requests'?'Подати заявку':'Опублікувати'}</button>
   </form>
  </details>}
  {module==='regulations'&&data&&<div className="filters">
   <Field label="Пошук документів"><input type="search" value={documentSearch} onChange={e=>setDocumentSearch(e.target.value)}/></Field>
   <Field label="Категорія"><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Усі категорії</option>{categories.map(name=><option key={name}>{name}</option>)}</select></Field>
   <Field label="Стан"><select value={archive?'archive':'current'} onChange={e=>setArchive(e.target.value==='archive')}><option value="current">Чинні редакції</option><option value="archive">Архів</option></select></Field>
  </div>}
  {module==='requests'&&unitId&&<div className="filters"><Field label="Стан заявки"><select value={requestFilter} onChange={e=>setRequestFilter(e.target.value)}>
   <option value="">Усі</option>{Object.entries(statusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}<option value="applied">Застосовано</option>
  </select></Field></div>}
  {visibleEntries?.length===0&&<p>Записів за цим фільтром немає.</p>}
  {data&&visibleEntries?.map(entry=>{
   const ownResult=data.results.find(result=>result.entry===entry.id&&result.member===data.actorId);
   const roster=data.people.filter(person=>person.unit===entry.unit);
   const attendance=data.attendance.filter(row=>row.entry===entry.id);
   const myAttendance=attendance.find(row=>row.member===data.actorId);
   const unfinished=roster.filter(person=>!data.results.some(result=>result.entry===entry.id&&result.member===person.id&&result.status==='passed'));
   return <article className="panel cabinet-target" id={'service-'+entry.id} key={entry.id}>
    <h2>{entry.title}</h2>
    <p className="muted">{data.units.find(unit=>unit.id===entry.unit)?.name||data.targets.find(unit=>unit.id===entry.unit)?.name||'Без підрозділу'} · {entry.name}</p>
    {entry.targetUnit&&<p>Бажаний підрозділ: {data.targets.find(unit=>unit.id===entry.targetUnit)?.name||'Архівний'}</p>}
    {entry.draft&&<p className="pill pending">Чернетка</p>}
    {entry.responsible&&<p>Відповідальний: {entry.responsible}</p>}
    {entry.draft&&canEdit(entry.unit)&&<form onSubmit={e=>void save(e,()=>({kind:'publish-draft',id:entry.id}))}><button disabled={busy}>Опублікувати чернетку</button></form>}
    {entry.date&&<time dateTime={entry.date}>{entry.date}</time>}
    {entry.category&&<p className="muted">{entry.category}</p>}
    {entry.revision&&<p>Редакція {entry.revision}</p>}
    <p className="unit-copy">{entry.body}</p>
    {entry.url&&<a href={entry.url} target="_blank" rel="noopener noreferrer">Відкрити документ</a>}
    {entry.from&&entry.to&&<p>Період: {entry.from} — {entry.to}</p>}
    {entry.links?.map((link,index)=><p key={link}><a href={link} target="_blank" rel="noopener noreferrer">Доказ {index+1}</a></p>)}
    {entry.replies?.map(reply=><div className="notice" key={reply.at}><p>{reply.body}</p>{reply.links.map((link,index)=><a key={link} href={link} target="_blank" rel="noopener noreferrer">Доказ {index+1} </a>)}</div>)}
    {entry.status==='clarification'&&entry.author===data.actorId&&!unitId&&<form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'resubmit',id:entry.id,body:f.get('body'),links:evidenceLines(String(f.get('links')??''))}))}>
     <Field label="Уточнення"><textarea name="body" required maxLength={5000}/></Field>
     <Field label="Додаткові докази"><textarea name="links"/></Field>
     <button disabled={busy}>Повторно подати</button>
    </form>}
    {entry.status&&<p>{statusLabels[entry.status]}{entry.decision?' · '+entry.decision:''}{entry.decidedBy?' · '+entry.decidedBy:''}</p>}
    {entry.status==='pending'&&entry.author!==data.actorId&&(data.admin||canEdit(entry.unit)||canEdit(entry.targetUnit))&&
     <form className="stack" onSubmit={e=>void save(e,f=>({kind:'decide',id:entry.id,status:f.get('status'),body:f.get('body')}))}>
      <Field label="Рішення"><select name="status"><option value="approved">Погодити</option><option value="rejected">Відхилити</option><option value="clarification">Запросити уточнення</option></select></Field>
      <Field label="Пояснення"><textarea name="body" required maxLength={5000}/></Field>
      <button disabled={busy}>Зберегти рішення</button>
     </form>}
    {entry.appliedAt&&<p className="pill approved">Рішення застосовано</p>}
    {unitId&&entry.author!==data.actorId&&entry.status==='approved'&&!entry.appliedAt&&
     ((entry.title==='Вступ або поновлення'&&canEdit(entry.targetUnit))||(['Відпустка','Звільнення'].includes(entry.title)&&canEdit(entry.unit)))&&
     <form className="stack narrow" onSubmit={e=>{if(confirm('Застосувати погоджене рішення?'))void save(e,f=>({kind:'apply',id:entry.id,rank:f.get('rank')?Number(f.get('rank')):undefined}));else e.preventDefault();}}>
      {entry.title==='Вступ або поновлення'&&<Field label="Початкове звання"><select name="rank" required defaultValue=""><option value="">Оберіть звання</option>{data.ranks.map(rank=><option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>}
      <button disabled={busy}>Застосувати рішення</button>
     </form>}
    {unitId&&data.canTransfer&&entry.author!==data.actorId&&entry.title==='Переведення'&&entry.status==='approved'&&!entry.appliedAt&&<form onSubmit={e=>{
     if(confirm('Застосувати переведення та змінити доступ до підрозділів?'))void save(e,()=>({kind:'transfer',id:entry.id}));
     else e.preventDefault();
    }}><button disabled={busy}>Застосувати переведення</button></form>}
    {module==='calendar'&&!entry.draft&&entry.date&&<>
     {myAttendance&&<p>Участь: {({confirmed:'підтверджено',declined:'відмова',present:'присутній',absent:'відсутній'} as Record<string,string>)[myAttendance.status]}</p>}
     {!unitId&&data.memberUnit===entry.unit&&entry.date>=today&&!['present','absent'].includes(myAttendance?.status??'')&&
      <form className="actions" onSubmit={e=>void save(e,()=>({kind:'attendance',id:entry.id,status:myAttendance?.status==='confirmed'?'declined':'confirmed'}))}>
       <button disabled={busy}>{myAttendance?.status==='confirmed'?'Скасувати участь':'Підтвердити участь'}</button>
      </form>}
     {canEdit(entry.unit)&&<details><summary>Участь і відвідування ({attendance.filter(row=>row.status==='confirmed'||row.status==='present').length})</summary>
      <ul>{roster.map(person=><li key={person.id}>{person.name} · {({confirmed:'підтверджено',declined:'відмова',present:'присутній',absent:'відсутній'} as Record<string,string>)[attendance.find(row=>row.member===person.id)?.status??'']||'без відповіді'}</li>)}</ul>
      {entry.date<=today&&<form className="stack" onSubmit={e=>void save(e,f=>({kind:'attendance',id:entry.id,member:f.get('member'),status:f.get('status')}))}>
       <Field label="Боєць"><select name="member" required><option value="">Оберіть бійця</option>{roster.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
       <Field label="Відвідування"><select name="status"><option value="present">Присутній</option><option value="absent">Відсутній</option></select></Field>
       <button disabled={busy}>Записати відвідування</button>
      </form>}
     </details>}
    </>}
    {module==='training'&&canEdit(entry.unit)&&<details><summary>Залишилося пройти ({unfinished.length})</summary><ul>{unfinished.map(person=><li key={person.id}>{person.name}</li>)}</ul></details>}
    {module==='training'&&ownResult?.note&&<p>Рекомендація: {ownResult.note}</p>}
    {module==='training'&&!unitId&&entry.requiresProof&&ownResult?.status!=='passed'&&<form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'training-proof',id:entry.id,links:evidenceLines(String(f.get('links')??''))}))}>
     <Field label="Докази виконання"><textarea name="links" required placeholder="Одне HTTPS-посилання на рядок"/></Field>
     <button disabled={busy}>Подати докази</button>
    </form>}
    {module==='training'&&canEdit(entry.unit)&&data.results.filter(row=>row.entry===entry.id&&row.links?.length).map(row=><p key={row.member}>
     {roster.find(person=>person.id===row.member)?.name}: {row.links?.map((link,index)=><a key={link} href={link} target="_blank" rel="noopener noreferrer">Доказ {index+1} </a>)}
    </p>)}
    {module==='training'&&<p>{ownResult?.status==='passed'?'Зараховано':ownResult?'Потрібно повторити':'Результат ще не внесено'}</p>}
    {module==='training'&&!entry.draft&&canEdit(entry.unit)&&<form className="stack" onSubmit={e=>void save(e,f=>({kind:'result',id:entry.id,member:f.get('member'),status:f.get('status'),note:f.get('note')}))}>
     <Field label="Боєць"><select name="member" required><option value="">Оберіть бійця</option>{data.people.filter(person=>person.unit===entry.unit).map(person=>{
      const result=data.results.find(row=>row.entry===entry.id&&row.member===person.id);
      return <option key={person.id} value={person.id}>{person.name}{result?(result.status==='passed'?' · зараховано':' · повторити'):''}</option>;
     })}</select></Field>
     <Field label="Результат"><select name="status"><option value="passed">Зараховано</option><option value="retry">Повторити</option></select></Field>
     <Field label="Рекомендація"><textarea name="note" maxLength={2000}/></Field><button disabled={busy}>Зберегти результат</button>
    </form>}
    {module!=='requests'&&!entry.archived&&canEdit(entry.unit)&&<form onSubmit={e=>{if(confirm('Архівувати запис?'))void save(e,()=>({kind:'archive',id:entry.id}));else e.preventDefault();}}>
     <button className="text-button" disabled={busy}>Архівувати</button>
    </form>}
   </article>;
  })}
 </div>;
}
