'use client';
import {DecisionTemplate,wantsNext} from './decision-template';
import Link from 'next/link';
import {useState,type FormEvent} from 'react';
import {promotionLadder,promotionRankName} from '@/lib/promotion-rules';
import {evidenceLines} from '@/lib/report-limits';
import type {promotionPoints} from '@/lib/promotion-points';
import {PromotionReportForm} from './promotion-report-form';
import {IllustratedSummary} from './illustrated-summary';
import {api,Field,Loading,Modal,Notice,useResource} from './ui';

const status={clarification:'Потребує уточнення',pending:'На перевірці',approved:'Зараховано',rejected:'Відхилено'};
export function PromotionPoints({unitId,focus,nextHref,taskId,screen='',mode='personal'}:{unitId?:string;focus?:string;nextHref?:string;taskId?:string;screen?:string;mode?:'personal'|'review'|'catalog'}){
 const resource=useResource<Awaited<ReturnType<typeof promotionPoints>>>('promotion-points'+'?'+new URLSearchParams({...unitId?{unit:unitId}:{},...focus?{entry:focus}:{}}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>,make:(fd:FormData)=>unknown){
  event.preventDefault();
  const navigate=nextHref&&wantsNext(event.nativeEvent);const form=event.currentTarget;setBusy(true);setError('');setSaved(false);
  try{await api('promotion-points',make(new FormData(form)));if(navigate){window.location.assign(nextHref);return;}form.reset();await resource.refresh();setSaved(true);}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 const data=resource.data;
 const links=(fd:FormData)=>evidenceLines(String(fd.get('links')??''));
 const editable=(unitId:string|null)=>data?.units.some(unit=>unit.id===unitId);
 const available=data?.tasks.filter(task=>!task.archived&&(!task.unitId||task.unitId===data.profile?.unit_id))??[];
 const [selected,setSelected]=useState<string|null>(focus??null);
 const groups=Object.groupBy(data?.credits??[],entry=>entry.reportId??entry.id);
 return <div id="content">
  <header className="portal-preview-header feature-cover personnel-cover"><h1>{mode==='review'?'Перевірка звітів':mode==='catalog'?'Каталог завдань підвищення':'Завдання й бали підвищення'}</h1><p>Підтверджені RP-дії та прогрес до наступного звання.</p></header>
  {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}{saved&&<Notice>Запис збережено.</Notice>}
  {!data&&!resource.error&&<Loading/>}
  {data&&<>
   {mode==='personal'&&<nav className="workspace-switch" aria-label="Звіти й підвищення"><div className="actions">
    {[['','Огляд'],['/tasks','Що виконати'],['/submit','Подати виконання'],['/history','Що я виконав']].map(([suffix,label])=><Link className="button secondary" key={suffix} href={'/portal/promotion-points'+suffix} aria-current={suffix.slice(1)===screen?'page':undefined}>{label}</Link>)}
    <Link className="button secondary" href="/portal/personnel-actions">Запит на підвищення</Link>
    </div>
   </nav>}
   {(mode==='catalog'||mode==='personal'&&!screen)&&<section className="panel portal-shortcuts">
    <h2>{mode==='catalog'?'Спільні правила':'Мій прогрес'}</h2>
    {mode==='personal'&&(data.profile?<p>{promotionRankName(data.profile.rank,data.profile.rank_name)} · {data.points} підтверджених балів{data.step?' із '+data.step[2]+' до звання «'+data.step[1]+'»':''}.</p>:<p>Для обліку балів потрібен активний профіль зі званням і підрозділом.</p>)}
    {mode==='personal'&&data.restriction&&<Notice>{data.restriction}</Notice>}
    {mode==='personal'&&data.step&&<progress aria-label="Прогрес до наступного звання" max={data.step[2]} value={Math.min(data.points,data.step[2])}/>}
    {mode==='personal'&&data.step&&<p>До порога залишилося {Math.max(0,data.step[2]-data.points)} балів.</p>}
    {mode==='personal'&&data.profile&&<p><Link href={data.credits.some(entry=>entry.status==='clarification')?'/portal/promotion-points/history':data.step&&data.points>=data.step[2]?'/portal/personnel-actions':'/portal/promotion-points/tasks'}>
     {data.credits.some(entry=>entry.status==='clarification')?'Переглянути запит на уточнення':data.step&&data.points>=data.step[2]?'Перевірити умови підвищення':'Переглянути завдання'}
    </Link></p>}
    <p>Бали зараховуються за фактично виконані RP-дії з відповідними відіграваннями. Повторно зараховувати ту саму дію заборонено.</p>
    <p>Для підвищення також потрібні нормативи, атестації, перевірки та рішення командування.</p>
    <details><summary>Шкала підвищень</summary><ul>{promotionLadder.map(([from,to,points])=><li key={from}>{from} → {to} · {points} балів</li>)}</ul></details>
   </section>}
   {mode==='personal'&&screen==='tasks'&&<section className="panel"><h2>Доступні завдання</h2>
    <p>Підтверджені бали, нормативи, атестації та рішення командування враховуються під час підвищення.</p>
    {!available.length&&<p>Наразі доступних завдань немає.</p>}
    {[false,true].map(local=>{
     const tasks=available.filter(task=>Boolean(task.unitId)===local);
     return tasks.length>0&&<section key={String(local)}><h3>{local?'Завдання мого підрозділу':'Спільні завдання НГУ'}</h3>
      <div className="table-wrap"><table><thead><tr><th scope="col">Завдання</th><th scope="col">Балів за виконання</th>{data.profile&&<th scope="col">Дія</th>}</tr></thead>
       <tbody>{tasks.map(task=><tr key={task.id}><td><strong>{task.name}</strong>{task.requirements&&<small>{task.requirements}</small>}</td><td className="number"><strong>{task.points}</strong></td>{data.profile&&<td><Link className="button secondary" aria-label={'Додати до звіту: '+task.name} href={'/portal/promotion-points/submit?'+new URLSearchParams({task:task.id})}>Додати до звіту</Link></td>}</tr>)}</tbody>
      </table></div>
     </section>;
    })}
   </section>}
   {mode==='personal'&&screen==='submit'&&!data.profile&&<Notice>Для подання звіту потрібен активний профіль зі званням і підрозділом.</Notice>}
   {mode==='personal'&&screen==='submit'&&data.profile&&<details id="promotion-submit" className="account-action profile-action cabinet-target" open>
    <IllustratedSummary title="Подати звіт із завданнями" image="/portal-art/cabinet/training.webp"/>
    <PromotionReportForm key={data.actorId+':'+(taskId??'')} selectedTaskId={available.find(task=>task.id===taskId)?.id} actorId={data.actorId} tasks={available} onSaved={resource.refresh}/>
   </details>}
   {mode==='catalog'&&data.units.length>0&&<section className="panel"><h2>Завдання підрозділів і заохочення</h2>
    <details className="account-action form-disclosure"><IllustratedSummary title="Додати завдання" image="/portal-art/unit-actions/info.webp"/><form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'task',unitId:f.get('unitId')||null,name:f.get('name'),points:Number(f.get('points')),requirements:f.get('requirements')}))}>
     <Field label="Підрозділ"><select name="unitId">{data.canEditCommon&&<option value="">Спільне для всіх підрозділів</option>}{data.units.map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></Field>
     <Field label="Завдання"><input name="name" required minLength={3} maxLength={120}/></Field>
     <Field label="Балів за виконання"><input name="points" type="number" min={1} max={1000} required/></Field>
     <Field label="Вимоги до доказів і нормативи"><textarea name="requirements" maxLength={1000}/></Field><button disabled={busy}>Створити завдання</button>
    </form></details>
    {data.tasks.filter(task=>(task.unitId?editable(task.unitId):data.canEditCommon)&&!task.archived).map(task=><details key={task.id} className="account-action form-disclosure">
     <IllustratedSummary title={[task.name,task.points+' б.',data.units.find(unit=>unit.id===task.unitId)?.name??'Спільне для НГУ'].join(' · ')} image="/portal-art/unit-actions/rank.webp"/>
     <form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'task',id:task.id,unitId:task.unitId,name:f.get('name'),points:Number(f.get('points')),requirements:f.get('requirements')}))}>
      <Field label="Назва"><input name="name" required minLength={3} maxLength={120} defaultValue={task.name}/></Field>
      <Field label="Бали"><input name="points" type="number" min={1} max={1000} required defaultValue={task.points}/></Field>
      <Field label="Вимоги до доказів і нормативи"><textarea name="requirements" maxLength={1000} defaultValue={task.requirements}/></Field><button disabled={busy}>Зберегти</button>
     </form>
     {(task.unitId||/^[a-f0-9-]{36}$/i.test(task.id))&&<form onSubmit={e=>{if(confirm('Архівувати завдання?'))void save(e,()=>({kind:'archive',id:task.id}));else e.preventDefault();}}><button className="text-button" disabled={busy}>Архівувати</button></form>}
    </details>)}
    <details className="account-action form-disclosure"><IllustratedSummary title="Нарахувати додаткові бали" image="/portal-art/catalog/approval.webp"/><form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'bonus',userId:f.get('userId'),points:Number(f.get('points')),reason:f.get('reason'),links:links(f)}))}>
     <Field label="Боєць"><select name="userId" required defaultValue=""><option value="">Оберіть бійця</option>{data.people.map(person=><option key={person.id} value={person.id}>{person.name} · {data.units.find(unit=>unit.id===person.unit_id)?.name}</option>)}</select></Field>
     <Field label="Бали"><input name="points" type="number" min={1} max={1000} required/></Field>
     <Field label="Підстава"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
     <Field label="Докази"><textarea name="links" required placeholder="Одне HTTPS-посилання на рядок"/></Field>
     <button disabled={busy}>Зарахувати бали</button>
    </form></details>
   </section>}
   {(mode==='review'||mode==='personal'&&screen==='history')&&<section className="panel"><h2>{mode==='review'?'Черга перевірки':'Мої виконання'}</h2>
    {!data.credits.length&&<p>Виконань поки немає.</p>}
    {Object.entries(groups).map(([id,entries])=>{
     const items=entries??[];
     const approved=items.reduce((sum,item)=>sum+(item.status==='approved'?item.rate*item.quantity:0),0);
     return <article className="report-card report-list-row" key={id}>
      <div className="report-row-identity"><strong>{items[0]?.name}</strong><small>{items[0]?.createdAt?new Date(items[0].createdAt).toLocaleDateString('uk-UA'):''}</small></div>
      <dl className="report-row-totals"><div><dt>Завдань</dt><dd>{items.length}</dd></div><div><dt>Балів у звіті</dt><dd>{items.reduce((sum,item)=>sum+item.rate*item.quantity,0)}</dd></div><div><dt>Зараховано</dt><dd>{approved}</dd></div></dl>
      <small>{[...new Set(items.map(item=>status[item.status]))].join(" · ")}</small><button type="button" className="secondary" aria-haspopup="dialog" onClick={()=>setSelected(id)}>Відкрити звіт</button>
      {selected===id&&<Modal title={'Звіт на підвищення · '+items[0]?.name} className="report-dialog" onClose={()=>setSelected(null)}><div className="report-dialog-scroll" tabIndex={0} role="region" aria-label="Завдання звіту"><div className="report-body">{items.map(entry=><details className="account-action form-disclosure" key={entry.id}>
     <IllustratedSummary title={[entry.title,entry.rate*entry.quantity+' б.',entry.name,status[entry.status]].join(' · ')} image="/portal-art/catalog/review.webp"/>
     <p>{entry.quantity} × {entry.rate} б. · {new Date(entry.createdAt).toLocaleDateString('uk-UA')}</p>
     <ul>{entry.links.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Доказ {i+1}</a></li>)}</ul>
     {entry.reason&&<p>{entry.reason}</p>}
     {mode==='personal'&&entry.status==='clarification'&&<form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'clarify',id:entry.id,links:links(f)}))}>
      <Field label="Додаткові докази"><textarea name="links" required/></Field><button disabled={busy}>Повторно надіслати</button>
     </form>}
     {entry.status==='pending'&&entry.userId!==data.actorId&&editable(entry.unitId)&&<form className="stack narrow" onSubmit={e=>void save(e,f=>({kind:'review',id:entry.id,approve:f.get('decision')==='approve',clarification:f.get('decision')==='clarification',quantity:Number(f.get('quantity')),reason:f.get('reason')}))}>
      <Field label="Рішення"><select name="decision"><option value="approve">Зарахувати</option><option value="reject">Відхилити</option><option value="clarification">Запросити уточнення</option></select></Field>
      <Field label="Кількість до зарахування"><input name="quantity" type="number" min={1} max={100} step={1} defaultValue={entry.quantity} required/></Field>
      <DecisionTemplate field="reason"/><Field label="Підстава рішення"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
      <div className="actions"><button disabled={busy}>Зберегти рішення</button>{nextHref&&<button type="submit" data-next="true" className="secondary" disabled={busy}>Зберегти й перейти до наступного</button>}</div>
     </form>}
    </details>)}</div></div></Modal>}</article>;
    })}
   </section>}
  </>}
 </div>;
}
