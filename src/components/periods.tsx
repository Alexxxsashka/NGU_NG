'use client';
import {useState} from 'react';
import {currentWeek,monday,dateLabel,shiftDate} from '@/lib/domain';
import {api,useResource,Field,Notice,Refresh} from './ui';

type Period={week_start:string;open:boolean;paid:boolean;updated_at:string};

export function Periods(){
 const resource=useResource<Period[]>('admin/periods');
 const [week,setWeek]=useState(currentWeek),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const period=resource.data?.find(p=>p.week_start===week);
 const open=period?.open??false;
 const disabled=busy||resource.loading||!!resource.error;
 const status=(period?:Period)=>period?.paid?'Виплачено':period?.open?'Прийом відкрито':'Прийом закрито';

 async function toggle(){
  setBusy(true);setError('');setMessage('');
  try{await api('admin/periods',{week,open:!open});await resource.refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function recalculate(){
  setBusy(true);setError('');setMessage('');
  try{
   const {recalculated}=await api<{recalculated:number}>('admin/periods/recalculate',{week});
   setMessage('Перераховано позицій: '+recalculated+'.');
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }

 async function payout(){
  if(!period?.paid&&!confirm('Зафіксувати виплату за '+dateLabel(week)+' та сформувати наказ? Після цього суми за цей тиждень буде зафіксовано.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/admin/periods/pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({week,confirmed:true})});
   if(!response.ok){const failure=await response.json().catch(()=>null);throw new Error(failure?.error||'Не вдалося сформувати наказ. Спробуйте ще раз.');}
   const url=URL.createObjectURL(await response.blob());
   const link=document.createElement('a');
   link.href=url;link.download='ngu-awards-'+week+'.docx';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage('Наказ Word сформовано.');
  }catch(e){setError((e as Error).message);}
  finally{await resource.refresh();setBusy(false);}
 }

 return <>
  <section className="panel narrow">
   <h2>Прийом звітів і виплата</h2>
   <Field label="Початок звітного тижня"><input type="date" value={week} disabled={busy} onChange={e=>{
    if(e.target.value){setWeek(monday(e.target.value));setError('');setMessage('');}
   }}/></Field>
   <p>{dateLabel(week)} — {dateLabel(shiftDate(week,6))}</p>
   <p><span className={'pill '+(open||period?.paid?'approved':'pending')}>{status(period)}</span></p>
   <div className="actions">
    {!period?.paid&&<button disabled={disabled} onClick={toggle}>{open?'Закрити прийом':'Відкрити прийом'}</button>}
    {period&&!period.paid&&<button className="secondary" disabled={disabled} onClick={recalculate}>Перерахувати звіти</button>}
    {period&&!open&&<button className="secondary" disabled={disabled} onClick={payout}>{period.paid?'Завантажити наказ Word':'Виплата й наказ Word'}</button>}
   </div>
   <p className="muted">Для виплати закрийте прийом і завершіть перевірку всіх звітів за тиждень.</p>
   {message&&<Notice>{message}</Notice>}
   {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}
  </section>
  <Refresh loading={resource.loading} onClick={resource.refresh} at={resource.updatedAt}/>
  <div className="table-wrap"><table><thead><tr><th>Тиждень</th><th>Стан</th><th>Остання зміна</th></tr></thead><tbody>
   {resource.data?.map(p=><tr key={p.week_start}>
    <td><button type="button" className="text-button" disabled={busy} onClick={()=>{setWeek(p.week_start);setError('');setMessage('');}}>{dateLabel(p.week_start)}</button></td>
    <td><span className={'pill '+(p.open||p.paid?'approved':'pending')}>{status(p)}</span></td><td>{new Date(p.updated_at).toLocaleString('uk-UA')}</td>
   </tr>)}
  </tbody></table></div>
 </>;
}
