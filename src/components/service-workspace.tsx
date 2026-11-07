'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {serviceWorkspace} from '@/lib/service-workspace';
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
const statusLabels={pending:'На розгляді',approved:'Погоджено',rejected:'Відхилено'};

export function ServiceWorkspace({module,focus}:{module:ServiceModule;focus?:string}){
 const {data,error,refresh}=useResource<Awaited<ReturnType<typeof serviceWorkspace>>>('service/'+module+(focus?'?entry='+encodeURIComponent(focus):''));
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
 const editors=data?.units.filter(unit=>unit.editor)??[];
 const canEdit=(id?:string|null)=>editors.some(unit=>unit.id===id);
 return <div id="content">
  <header className="portal-preview-header" data-portal-art={module}><h1>{labels[module]}</h1></header>
  {error&&<Notice error>{error} <button className="text-button" onClick={refresh}>Повторити</button></Notice>}
  {failure&&<Notice error>{failure}</Notice>}{message&&<Notice>{message}</Notice>}
  {!data&&!error&&<Loading/>}
  {data&&(module==='requests'||editors.length>0)&&<details className="account-action profile-action">
   <IllustratedSummary title={actions[module]} image={'/portal-art/catalog/'+artwork[module]+'.webp'}/>
   <form className="stack account-action-content" onSubmit={e=>void save(e,f=>module==='requests'?
    {kind:'request',type:f.get('type'),body:f.get('body'),targetUnit:f.get('targetUnit')||undefined}:
    {kind:'publish',module,unit:f.get('unit'),title:f.get('title'),body:f.get('body'),
     date:f.get('date')||undefined,url:f.get('url')||undefined,revision:f.get('revision')||undefined})}>
    {module==='requests'?<>
     <Field label="Тип заявки"><select name="type">{['Переведення','Відпустка','Вступ або поновлення','Звільнення або оскарження'].map(type=><option key={type}>{type}</option>)}</select></Field>
     <Field label="Бажаний підрозділ для переведення"><select name="targetUnit"><option value="">Оберіть підрозділ</option>{data.targets.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
    </>:<>
     <Field label="Підрозділ"><select name="unit">{editors.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
     <Field label="Заголовок"><input name="title" maxLength={120} required/></Field>
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
  {data?.entries.length===0&&<p>Записів поки немає.</p>}
  {data?.entries.map(entry=>{
   const ownResult=data.results.find(result=>result.entry===entry.id&&result.member===data.actorId);
   return <article className="panel cabinet-target" id={'service-'+entry.id} key={entry.id}>
    <h2>{entry.title}</h2>
    <p className="muted">{data.units.find(unit=>unit.id===entry.unit)?.name||data.targets.find(unit=>unit.id===entry.unit)?.name||'Без підрозділу'} · {entry.name}</p>
    {entry.targetUnit&&<p>Бажаний підрозділ: {data.targets.find(unit=>unit.id===entry.targetUnit)?.name||'Архівний'}</p>}
    {entry.date&&<time dateTime={entry.date}>{entry.date}</time>}
    {entry.revision&&<p>Редакція {entry.revision}</p>}
    <p className="unit-copy">{entry.body}</p>
    {entry.url&&<a href={entry.url} target="_blank" rel="noopener noreferrer">Відкрити документ</a>}
    {entry.status&&<p>{statusLabels[entry.status]}{entry.decision?' · '+entry.decision:''}{entry.decidedBy?' · '+entry.decidedBy:''}</p>}
    {entry.status==='pending'&&entry.author!==data.actorId&&(data.admin||canEdit(entry.unit)||canEdit(entry.targetUnit))&&
     <form className="stack" onSubmit={e=>void save(e,f=>({kind:'decide',id:entry.id,status:f.get('status'),body:f.get('body')}))}>
      <Field label="Рішення"><select name="status"><option value="approved">Погодити</option><option value="rejected">Відхилити</option></select></Field>
      <Field label="Пояснення"><textarea name="body" required maxLength={5000}/></Field>
      <button disabled={busy}>Зберегти рішення</button>
     </form>}
    {module==='training'&&<p>{ownResult?.status==='passed'?'Зараховано':ownResult?'Потрібно повторити':'Результат ще не внесено'}</p>}
    {module==='training'&&canEdit(entry.unit)&&<form className="stack" onSubmit={e=>void save(e,f=>({kind:'result',id:entry.id,member:f.get('member'),status:f.get('status')}))}>
     <Field label="Боєць"><select name="member" required><option value="">Оберіть бійця</option>{data.people.filter(person=>person.unit===entry.unit).map(person=>{
      const result=data.results.find(row=>row.entry===entry.id&&row.member===person.id);
      return <option key={person.id} value={person.id}>{person.name}{result?(result.status==='passed'?' · зараховано':' · повторити'):''}</option>;
     })}</select></Field>
     <Field label="Результат"><select name="status"><option value="passed">Зараховано</option><option value="retry">Повторити</option></select></Field>
     <button disabled={busy}>Зберегти результат</button>
    </form>}
    {module!=='requests'&&canEdit(entry.unit)&&<form onSubmit={e=>{if(confirm('Архівувати запис?'))void save(e,()=>({kind:'archive',id:entry.id}));else e.preventDefault();}}>
     <button className="text-button" disabled={busy}>Архівувати</button>
    </form>}
   </article>;
  })}
 </div>;
}
