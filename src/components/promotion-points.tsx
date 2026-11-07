'use client';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {promotionLadder,promotionRankName} from '@/lib/promotion-rules';
import {evidenceLines} from '@/lib/report-limits';
import type {promotionPoints} from '@/lib/promotion-points';
import {PromotionReportForm} from './promotion-report-form';
import {IllustratedSummary} from './illustrated-summary';
import {api,Field,Loading,Modal,Notice,useResource} from './ui';

const status={pending:'На перевірці',approved:'Зараховано',rejected:'Відхилено'};
export function PromotionPoints(){
 const resource=useResource<Awaited<ReturnType<typeof promotionPoints>>>('promotion-points');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>,make:(fd:FormData)=>unknown){
  event.preventDefault();const form=event.currentTarget;setBusy(true);setError('');setSaved(false);
  try{await api('promotion-points',make(new FormData(form)));form.reset();await resource.refresh();setSaved(true);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const data=resource.data;
 const links=(fd:FormData)=>evidenceLines(String(fd.get('links')??''));
 const editable=(unitId:string|null)=>data?.units.some(unit=>unit.id===unitId);
 const available=data?.tasks.filter(task=>!task.archived&&(!task.unitId||task.unitId===data.profile?.unit_id))??[];
 const [selected,setSelected]=useState<string|null>(null);
 const groups=Object.groupBy(data?.credits??[],entry=>entry.reportId??entry.id);
 return <div id="content">
  <header className="portal-preview-header feature-cover personnel-cover"><h1>Завдання й бали підвищення</h1><p>Підтверджені RP-дії та прогрес до наступного звання.</p></header>
  {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}{saved&&<Notice>Запис збережено.</Notice>}
  {!data&&!resource.error&&<Loading/>}
  {data&&<>
   <section className="panel portal-shortcuts">
    <h2>Мій прогрес</h2>
    {data.profile?<p>{promotionRankName(data.profile.rank,data.profile.rank_name)} · {data.points} підтверджених балів{data.step?' із '+data.step[2]+' до звання «'+data.step[1]+'»':''}.</p>:<p>Для обліку балів потрібен активний профіль зі званням і підрозділом.</p>}
    {data.step&&<progress aria-label="Прогрес до наступного звання" max={data.step[2]} value={Math.min(data.points,data.step[2])}/>}
    <p><Link href="/portal/personnel-actions">Запит на підвищення та кадровий аудит</Link></p>
    <p>Бали зараховуються за фактично виконані RP-дії з відповідними відіграваннями. Повторно зараховувати ту саму дію заборонено.</p>
    <p>Для підвищення також потрібні нормативи, атестації, перевірки та рішення командування.</p>
    <details><summary>Шкала підвищень</summary><ul>{promotionLadder.map(([from,to,points])=><li key={from}>{from} → {to} · {points} балів</li>)}</ul></details>
   </section>
   {data.profile&&<details id="promotion-submit" className="account-action profile-action cabinet-target" open>
    <IllustratedSummary title="Подати звіт із завданнями" image="/portal-art/cabinet/training.webp"/>
    <PromotionReportForm tasks={available} onSaved={resource.refresh}/>
   </details>}
   {data.units.length>0&&<section className="panel"><h2>Завдання підрозділів і заохочення</h2>
    <details><summary>Додати завдання підрозділу</summary><form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'task',unitId:f.get('unitId'),name:f.get('name'),points:Number(f.get('points'))}))}>
     <Field label="Підрозділ"><select name="unitId">{data.units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
     <Field label="Завдання"><input name="name" required minLength={3} maxLength={120}/></Field>
     <Field label="Балів за виконання"><input name="points" type="number" min={1} max={1000} required/></Field>
     <button disabled={busy}>Створити завдання</button>
    </form></details>
    {data.tasks.filter(task=>task.unitId&&editable(task.unitId)&&!task.archived).map(task=><details key={task.id} className="audit-row">
     <summary>{task.name} · {task.points} б. · {data.units.find(unit=>unit.id===task.unitId)?.name}</summary>
     <form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'task',id:task.id,unitId:task.unitId,name:f.get('name'),points:Number(f.get('points'))}))}>
      <Field label="Назва"><input name="name" required minLength={3} maxLength={120} defaultValue={task.name}/></Field>
      <Field label="Бали"><input name="points" type="number" min={1} max={1000} required defaultValue={task.points}/></Field>
      <button disabled={busy}>Зберегти</button>
     </form>
     <form onSubmit={e=>{if(confirm('Архівувати завдання?'))void save(e,()=>({kind:'archive',id:task.id}));else e.preventDefault();}}><button className="text-button" disabled={busy}>Архівувати</button></form>
    </details>)}
    <details><summary>Нарахувати додаткові бали</summary><form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'bonus',userId:f.get('userId'),points:Number(f.get('points')),reason:f.get('reason'),links:links(f)}))}>
     <Field label="Боєць"><select name="userId" required defaultValue=""><option value="">Оберіть бійця</option>{data.people.map(person=><option key={person.id} value={person.id}>{person.name} · {data.units.find(unit=>unit.id===person.unit_id)?.name}</option>)}</select></Field>
     <Field label="Бали"><input name="points" type="number" min={1} max={1000} required/></Field>
     <Field label="Підстава"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
     <Field label="Докази"><textarea name="links" required placeholder="Одне HTTPS-посилання на рядок"/></Field>
     <button disabled={busy}>Зарахувати бали</button>
    </form></details>
   </section>}
   <section className="panel"><h2>Журнал виконань</h2>
    {!data.credits.length&&<p>Виконань поки немає.</p>}
    {Object.entries(groups).map(([id,entries])=>{
     const items=entries??[];
     const approved=items.reduce((sum,item)=>sum+(item.status==='approved'?item.rate*item.quantity:0),0);
     return <article className="report-card report-list-row" key={id}>
      <div className="report-row-identity"><strong>{items[0]?.name}</strong><small>{items[0]?.createdAt?new Date(items[0].createdAt).toLocaleDateString('uk-UA'):''}</small></div>
      <dl className="report-row-totals"><div><dt>Завдань</dt><dd>{items.length}</dd></div><div><dt>Балів у звіті</dt><dd>{items.reduce((sum,item)=>sum+item.rate*item.quantity,0)}</dd></div><div><dt>Зараховано</dt><dd>{approved}</dd></div></dl>
      <button type="button" className="secondary" aria-haspopup="dialog" onClick={()=>setSelected(id)}>Відкрити звіт</button>
      {selected===id&&<Modal title={'Звіт на підвищення · '+items[0]?.name} className="report-dialog" onClose={()=>setSelected(null)}><div className="report-dialog-scroll" tabIndex={0} role="region" aria-label="Завдання звіту"><div className="report-body">{items.map(entry=><details className="audit-row" key={entry.id}>
     <summary><strong>{entry.title} · {entry.rate*entry.quantity} б.</strong> · {entry.name} · {status[entry.status]}</summary>
     <p>{entry.quantity} × {entry.rate} б. · {new Date(entry.createdAt).toLocaleDateString('uk-UA')}</p>
     <ul>{entry.links.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Доказ {i+1}</a></li>)}</ul>
     {entry.reason&&<p>{entry.reason}</p>}
     {entry.status==='pending'&&entry.userId!==data.actorId&&editable(entry.unitId)&&<form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'review',id:entry.id,approve:f.get('decision')==='approve',quantity:Number(f.get('quantity')),reason:f.get('reason')}))}>
      <Field label="Рішення"><select name="decision"><option value="approve">Зарахувати</option><option value="reject">Відхилити</option></select></Field>
      <Field label="Кількість до зарахування"><input name="quantity" type="number" min={1} max={100} step={1} defaultValue={entry.quantity} required/></Field>
      <Field label="Підстава рішення"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
      <button disabled={busy}>Зберегти рішення</button>
     </form>}
    </details>)}</div></div></Modal>}</article>;
    })}
   </section>
  </>}
 </div>;
}
