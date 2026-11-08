'use client';
import Link from 'next/link';
import type {AwardBlocker,AwardChange,AwardPreviewRow} from '@/lib/award-register';
import {useState} from 'react';
import {currentWeek,monday,dateLabel,shiftDate} from '@/lib/domain';
import {api,useResource,Field,Notice,Refresh} from './ui';

type Period={week_start:string;open:boolean;paid:boolean;updated_at:string};

export function Periods(){
 const resource=useResource<Period[]>('admin/periods');
 const [week,setWeek]=useState(currentWeek),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const preview=useResource<AwardPreviewRow[]>('admin/award-preview?week='+week);
 const blockers=useResource<AwardBlocker[]>('admin/award-blockers?week='+week);
 const [plan,setPlan]=useState<{token:string;recalculated:number;changes:AwardChange[];totalDifference:string}|null>(null);
 const period=resource.data?.find(p=>p.week_start===week);
 const open=period?.open??false;
 const disabled=busy||resource.loading||!!resource.error;
 const status=(period?:Period)=>period?.paid?'Наказ затверджено':period?.open?'Прийом відкрито':'Прийом закрито';

 async function toggle(){
  setPlan(null);setBusy(true);setError('');setMessage('');
  try{await api('admin/periods',{week,open:!open});await resource.refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function recalculate(apply=false){
  if(apply&&!plan)return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await api<NonNullable<typeof plan>>('admin/periods/recalculate',{week,token:apply?plan?.token:undefined});
   if(apply){
    setPlan(null);await Promise.all([preview.refresh(),blockers.refresh()]);
    setMessage('Перераховано позицій: '+result.recalculated+'.');
   }else setPlan(result);
  }catch(e){setPlan(null);setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function payout(selected:Period){
  const downloadWeek=selected.week_start;
  if(!selected.paid&&!confirm('Затвердити наказ за '+dateLabel(downloadWeek)+'? Після цього суми за цей тиждень буде зафіксовано.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/admin/periods/pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week:downloadWeek,confirmed:true})});
   if(!response.ok){const failure=await response.json().catch(()=>null);throw new Error(failure?.error||'Не вдалося сформувати наказ. Спробуйте ще раз.');}
   const url=URL.createObjectURL(await response.blob());
   const link=document.createElement('a');
   link.href=url;link.download='ngu-awards-'+downloadWeek+'.docx';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Наказ Word сформовано.');
  }catch(e){setError((e as Error).message);}
  finally{await Promise.all([resource.refresh(),preview.refresh(),blockers.refresh()]);setBusy(false);}
 }

 return <>
  <section className="panel narrow">
   <h2>Прийом звітів і виплата</h2>
   <p><Link href="/admin/weekly-bonus/award-orders">Реєстр наказів Word</Link></p>
   <Field label="Початок звітного тижня"><input type="date" value={week} disabled={busy} onChange={e=>{
    if(e.target.value){setWeek(monday(e.target.value));setPlan(null);setError('');setMessage('');}
   }}/></Field>
   <p>{dateLabel(week)} — {dateLabel(shiftDate(week,6))}</p>
   <p><span className={'pill '+(open||period?.paid?'approved':'pending')}>{status(period)}</span></p>
   <div className="actions">
    {!period?.paid&&<button disabled={disabled} onClick={toggle}>{open?'Закрити прийом':'Відкрити прийом'}</button>}
    {period&&!period.paid&&<button className="secondary" disabled={disabled} onClick={()=>void recalculate()}>Переглянути перерахунок</button>}
    {period&&!open&&<button className="secondary" disabled={disabled} onClick={()=>void payout(period)}>{period.paid?'Завантажити наказ Word':'Затвердити й завантажити список виплат Word'}</button>}
   </div>
   {plan&&<div className="stack"><p>Позицій зі змінами: {plan.recalculated}. Різниця до виплати: {plan.totalDifference} $.</p>
    {plan.recalculated>0&&<button disabled={disabled} onClick={()=>void recalculate(true)}>Застосувати перерахунок</button>}
   </div>}
   <p className="muted">Закрийте прийом і завершіть перевірку. Один Word-файл міститиме всіх отримувачів і загальну суму за тиждень.</p>
   {message&&<Notice>{message}</Notice>}
   {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}
  </section>
  {!period?.paid&&<section className="panel">
   <h2>Готовність до формування наказу</h2>
   {blockers.error&&<Notice error>{blockers.error}</Notice>}
   {blockers.loading&&<p>Перевіряємо звіти…</p>}
   {blockers.data?.length===0&&<p>Звітів, які потребують перевірки, уточнення або погодженої суми, немає.</p>}
   {!!blockers.data?.length&&<>
    <p>Потребують дії: {blockers.data[0].total}. Показано {blockers.data.length}.</p>
    <div className="table-wrap"><table><thead><tr><th>Боєць</th><th>На перевірці</th><th>На уточненні</th><th>Без суми</th><th>Звіт</th></tr></thead>
     <tbody>{blockers.data.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.pending}</td><td>{row.clarification}</td><td>{row.missing}</td>
      <td><Link href={'/admin/weekly-bonus/reports?'+new URLSearchParams({from:week,to:shiftDate(week,6),report:row.id})}>{row.number}</Link></td></tr>)}</tbody>
    </table></div>
   </>}
  </section>}
  {!period?.paid&&<section className="panel"><h2>Попередній перегляд виплати</h2>
   {preview.error&&<Notice error>{preview.error}</Notice>}
   {preview.loading&&<p>Завантажуємо нарахування…</p>}
   {preview.data?.length===0&&<p>Схвалених невиплачених позицій за цей тиждень немає.</p>}
   {preview.data?.length?<div className="table-wrap"><table><thead><tr><th>Боєць</th><th>Розраховано</th><th>Ліміт</th><th>Коригувань</th><th>До виплати</th><th>Після перерахунку</th></tr></thead><tbody>
    {preview.data.map(row=>{const change=plan?.changes.find(item=>item.staticId===row.static_id);
     return <tr key={row.static_id}><td>{row.name}<small>ID {row.static_id}</small></td><td>{row.estimate??'—'}</td><td>{row.cap??'Без ліміту'}</td><td>{row.manual}</td><td>{row.approved??'—'}</td><td>{change?(change.before??'—')+' → '+(change.after??'—'):'—'}</td></tr>;
    })}
   </tbody></table></div>:null}
  </section>}
  <Refresh loading={resource.loading} onClick={resource.refresh} at={resource.updatedAt}/>
  <div className="table-wrap"><table><thead><tr><th>Тиждень</th><th>Стан</th><th>Остання зміна</th><th>Список виплат Word</th></tr></thead><tbody>
   {resource.data?.map(p=><tr key={p.week_start}>
    <td><button type="button" className="text-button" disabled={busy} onClick={()=>{setWeek(p.week_start);setPlan(null);setError('');setMessage('');}}>{dateLabel(p.week_start)}</button></td>
    <td><span className={'pill '+(p.open||p.paid?'approved':'pending')}>{status(p)}</span></td><td>{new Date(p.updated_at).toLocaleString('uk-UA')}</td>
    <td>{p.paid?<a className="button secondary" href={'/api/admin/award-orders/docx?week='+p.week_start}>Завантажити Word</a>:
     <><button type="button" className="secondary" disabled={disabled||p.open} onClick={()=>{setWeek(p.week_start);setPlan(null);void payout(p);}}>Сформувати Word</button>
     {p.open&&<small>Спочатку закрийте прийом звітів.</small>}</>}</td>
   </tr>)}
  </tbody></table></div>
 </>;
}
