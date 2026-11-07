'use client';

import {useState,type FormEvent} from 'react';
import type {personnelWorkflow} from '@/lib/personnel-workflow';
import {evidenceLines} from '@/lib/report-limits';
import {IllustratedSummary} from './illustrated-summary';
import {api,Field,Loading,Notice,useResource} from './ui';

const actionLabels={promote:'Підвищення',demote:'Пониження',dismiss:'Звільнення',admit:'Прийняття',transfer:'Переведення'} as const;
const statusLabels:Record<string,string>={pending:'На розгляді',approved:'Погоджено',rejected:'Відхилено'};

function Proof(){
 return <><Field label="Підстава"><textarea name="reason" required minLength={5} maxLength={3000} rows={3}/></Field>
  <Field label="Докази"><textarea name="links" required rows={3} placeholder="Одне HTTPS-посилання на скріншот або документ на рядок"/><small>До 20 посилань.</small></Field></>;
}

export function PersonnelWorkflow(){
 const resource=useResource<Awaited<ReturnType<typeof personnelWorkflow>>>('personnel-workflow');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [kind,setKind]=useState<keyof typeof actionLabels>('promote'),[target,setTarget]=useState(''),[search,setSearch]=useState('');
 async function save(event:FormEvent<HTMLFormElement>,make:(fd:FormData)=>unknown){
  event.preventDefault();
  const form=event.currentTarget;
  setBusy(true);setSaved(false);setError('');
  try{await api('personnel-workflow',make(new FormData(form)));form.reset();setTarget('');await resource.refresh();setSaved(true);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const data=resource.data;
 const person=data?.people.find(person=>person.id===target);
 const needsRank=kind!=='dismiss'&&kind!=='transfer';
 const needsUnit=kind==='admit'||kind==='transfer';
 const rankName=(id:number|null)=>data?.ranks.find(rank=>rank.id===id)?.name??(id??'Не призначено');
 const availablePeople=data?.people.filter(person=>kind==='admit'?(!person.active||!person.unit_id):person.active&&!!person.unit_id)??[];
 const filtered=availablePeople.filter(person=>(person.name+' '+person.static_id).toLocaleLowerCase('uk').includes(search.trim().toLocaleLowerCase('uk')));
 const proof=(fd:FormData)=>({reason:fd.get('reason'),links:evidenceLines(String(fd.get('links')||''))});
 return <div id="content">
  <header className="portal-preview-header feature-cover personnel-cover"><h1>Підвищення й кадровий аудит</h1><p>Звіти бійців, кадрові рішення та докази.</p></header>
  {(resource.error||error)&&<Notice error>{resource.error||error}</Notice>}{saved&&<Notice>Запис збережено.</Notice>}
  {!data&&!resource.error&&<Loading/>}
  {data&&<>
   <div className="cabinet-security-grid portal-shortcuts">
    <details className="account-action profile-action">
     <IllustratedSummary title="Подати звіт на підвищення" image="/portal-art/unit-actions/rank.webp"/>
     <div className="account-action-content">
      {data.me?.active&&data.me.rank&&data.me.unit_id?<form className="stack" onSubmit={e=>void save(e,fd=>({kind:'submit',rank:Number(fd.get('rank')),...proof(fd)}))}>
       <p>Поточне звання: {rankName(data.me.rank)}</p>
       <Field label="Запитуване звання"><select name="rank" required defaultValue=""><option value="">Оберіть вище звання</option>{data.ranks.filter(rank=>rank.id>data.me.rank!).map(rank=><option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>
       <Proof/><button disabled={busy}>Надіслати звіт</button>
      </form>:<p>Для подання потрібні активний кадровий профіль, підрозділ і звання.</p>}
     </div>
    </details>
    {data.units.length>0&&<details className="account-action profile-action">
     <IllustratedSummary title="Додати кадровий запис" image="/portal-art/unit-actions/info.webp"/>
     <form className="stack account-action-content" onSubmit={e=>{
      if(confirm('Застосувати кадрову зміну та записати її в журнал?'))void save(e,fd=>({kind:'record',action:kind,userId:target,
       rank:needsRank?Number(fd.get('rank')):undefined,unitId:needsUnit?fd.get('unitId'):undefined,...proof(fd)}));
      else e.preventDefault();
     }}>
      <Field label="Кадрова дія"><select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setTarget('');}}>{Object.entries(actionLabels).filter(([id])=>id!=='transfer'||data.canTransfer).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
      <Field label="Пошук за ім’ям або Static ID"><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setTarget('');}}/></Field>
      <Field label="Боєць"><select value={target} required onChange={e=>setTarget(e.target.value)}><option value="">Оберіть зареєстрованого бійця</option>{filtered.map(person=><option key={person.id} value={person.id}>{person.name} · {person.static_id}</option>)}</select></Field>
      {person&&<p>Поточні дані: {rankName(person.rank)} · {data.units.find(unit=>unit.id===person.unit_id)?.name??'Без підрозділу'}</p>}
      {needsRank&&<Field label="Нове звання"><select key={kind+target} name="rank" required defaultValue=""><option value="">Оберіть звання</option>{data.ranks.filter(rank=>kind==='admit'||(kind==='promote'?rank.id>(person?.rank??0):rank.id<(person?.rank??0))).map(rank=><option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>}
      {needsUnit&&<Field label="Новий підрозділ"><select name="unitId" required defaultValue=""><option value="">Оберіть підрозділ</option>{data.units.filter(unit=>kind==='admit'||unit.id!==person?.unit_id).map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>}
      <Proof/><button disabled={busy||!target}>Застосувати й записати</button>
     </form>
    </details>}
   </div>
   <section className="panel"><h2>Звіти на підвищення</h2>
    {!data.promotions.length&&<p>Звітів поки немає.</p>}
    {data.promotions.map(report=><details className="audit-row" key={report.id} id={'promotion-'+report.id}>
     <summary><strong>{report.name} · ID {report.staticId}</strong> · {rankName(report.fromRank)} → {rankName(report.rank)} · {statusLabels[report.status]}</summary>
     <p>{report.reason}</p>
     <ul>{report.links.map((link,index)=><li key={index}><a href={link} target="_blank" rel="noopener noreferrer">Доказ {index+1}</a></li>)}</ul>
     {report.decision&&<p>Рішення: {report.decision}</p>}
     {report.status==='pending'&&report.userId!==data.actorId&&data.units.some(unit=>unit.id===report.unitId)&&
      <form className="stack narrow" onSubmit={e=>void save(e,fd=>({kind:'decide',id:report.id,approve:fd.get('decision')==='approve',reason:fd.get('reason')}))}>
       <Field label="Рішення"><select name="decision"><option value="approve">Погодити й застосувати звання</option><option value="reject">Відхилити</option></select></Field>
       <Field label="Підстава рішення"><textarea name="reason" required minLength={5} maxLength={3000}/></Field>
       <button disabled={busy}>Зберегти рішення</button>
      </form>}
    </details>)}
   </section>
   {data.units.length>0&&<section className="panel"><h2>Кадровий аудит</h2>
    {!data.history.length&&<p>Кадрових записів поки немає.</p>}
    {data.history.map(record=><details key={record.id} className="audit-row">
     <summary><strong>{actionLabels[record.after.action as keyof typeof actionLabels]} · {record.after.name} · ID {record.after.staticId}</strong> · {new Date(record.created_at).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}</summary>
     <p>Запис вніс {record.after.author}{record.after.actorStaticId?' · ID '+record.after.actorStaticId:''}.</p>
     <p>Звання: {record.after.fromRankName??'—'} → {record.after.rankName??'—'}. Підрозділ: {record.after.fromUnitName??'—'} → {record.after.unitName??'—'}.</p>
     <p>{record.after.reason}</p>
     <ul>{record.after.links.map((link,index)=><li key={index}><a href={link} target="_blank" rel="noopener noreferrer">Доказ {index+1}</a></li>)}</ul>
    </details>)}
   </section>}
  </>}
 </div>;
}
