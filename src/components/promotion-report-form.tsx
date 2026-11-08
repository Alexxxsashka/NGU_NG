'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Plus,Trash2} from 'lucide-react';
import {evidenceLines} from '@/lib/report-limits';
import {api,Field,Notice} from './ui';

type Task={id:string;name:string;points:number;unitId:string|null;requirements?:string};
type Row={id:number;taskId:string;quantity:string;links:string};
export function PromotionReportForm({tasks,onSaved,actorId,selectedTaskId}:{actorId:string;selectedTaskId?:string;tasks:Task[];onSaved:()=>Promise<void>}){
 const [rows,setRows]=useState<Row[]>([{id:0,taskId:'',quantity:'1',links:''}]);
 const [nextId,setNextId]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const [loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState(false);
 const draftKey='ngu.promotion-draft:'+actorId;
 useEffect(()=>{
  let draft:Row[]=[{id:0,taskId:'',quantity:'1',links:''}];
  try{
   const raw=sessionStorage.getItem(draftKey);
   const previous:unknown=raw?JSON.parse(raw):null;
   if(Array.isArray(previous)&&previous.length>0&&previous.length<=50&&previous.every(row=>row&&typeof row.id==='number'&&typeof row.taskId==='string'&&typeof row.quantity==='string'&&typeof row.links==='string')){
    draft=previous;
   }
  }catch{setStorageError(true);}
  let next=Math.max(...draft.map(row=>row.id))+1;
  if(selectedTaskId&&!draft.some(row=>row.taskId===selectedTaskId)){
   const empty=draft.find(row=>!row.taskId&&!row.links&&row.quantity==='1');
   if(empty)draft=draft.map(row=>row.id===empty.id?{...row,taskId:selectedTaskId}:row);
   else if(draft.length<50)draft=[...draft,{id:next++,taskId:selectedTaskId,quantity:'1',links:''}];
   else setError('У чернетці вже 50 завдань. Звільніть рядок, щоб додати нове.');
  }
  setRows(draft);setNextId(next);setLoaded(true);
 },[draftKey,selectedTaskId]);
 useEffect(()=>{
  if(!loaded)return;
  try{
   if(rows.some(row=>row.taskId||row.links||row.quantity!=='1'))sessionStorage.setItem(draftKey,JSON.stringify(rows));
   else sessionStorage.removeItem(draftKey);
  }catch{setStorageError(true);}
 },[draftKey,loaded,rows]);
 const update=(id:number,patch:Partial<Row>)=>setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));
 const points=rows.reduce((sum,row)=>sum+(tasks.find(task=>task.id===row.taskId)?.points??0)*Number(row.quantity),0);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setError('');setSaved(false);
  const entries=rows.map(row=>({taskId:row.taskId,quantity:Number(row.quantity),links:evidenceLines(row.links)}));
  const invalid=entries.findIndex(entry=>!tasks.some(task=>task.id===entry.taskId)||entry.links.length<1||entry.links.length>20);
  if(invalid>=0){setError('Завдання '+(invalid+1)+': оберіть доступне завдання та додайте від 1 до 20 посилань.');return;}
  setBusy(true);
  try{
   await api('promotion-points',{kind:'submit-report',entries});
   setRows([{id:0,taskId:'',quantity:'1',links:''}]);setNextId(1);setSaved(true);await onSaved();
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 return <form className="report-layout account-action-content" onSubmit={submit}>
  <div className="panel">
   <div className="section-heading"><h2>Виконані завдання</h2><span>{rows.length} / 50</span></div>
   {rows.map((row,index)=>{
    const task=tasks.find(item=>item.id===row.taskId);
    return <div className="task-entry" key={row.id}>
    <div className="section-heading"><strong>Завдання {index+1}</strong>{rows.length>1&&<button type="button" className="text-button danger" disabled={busy} onClick={()=>setRows(current=>current.filter(item=>item.id!==row.id))}><Trash2 size={16}/>Видалити</button>}</div>
    <div className="task-fields">
     <Field label="Завдання"><select required value={row.taskId} disabled={busy} onChange={e=>update(row.id,{taskId:e.target.value})}>
      <option value="">Оберіть завдання</option>
      {row.taskId&&!tasks.some(task=>task.id===row.taskId)&&<option value={row.taskId} disabled>Завдання більше недоступне</option>}
      {[['Спільні',false],['Мій підрозділ',true]].map(([label,unit])=><optgroup key={String(label)} label={String(label)}>{tasks.filter(task=>Boolean(task.unitId)===unit).map(task=><option key={task.id} value={task.id}>{task.name} · {task.points} б.</option>)}</optgroup>)}
     </select></Field>
     <Field label="Кількість"><input type="number" min={1} max={100} step={1} required disabled={busy} value={row.quantity} onChange={e=>update(row.id,{quantity:e.target.value})}/></Field>
    </div>
    {task&&<p className="pill prime">{task.points} б. за виконання · {task.points*Number(row.quantity)} б. за рядок</p>}
    {task?.requirements&&<p className="muted">{task?.requirements}</p>}
    <Field label="Посилання на докази"><textarea required rows={3} disabled={busy} value={row.links} placeholder="Одне HTTPS-посилання на рядок" onChange={e=>update(row.id,{links:e.target.value})}/><small>{evidenceLines(row.links).length} / 20 посилань</small></Field>
   </div>;})}
   <button type="button" className="secondary full" disabled={busy||rows.length>=50} onClick={()=>{setRows(current=>[...current,{id:nextId,taskId:'',quantity:'1',links:''}]);setNextId(id=>id+1);}}><Plus size={17}/>Додати завдання</button>
  </div>
  <aside className="report-aside"><section className="panel summary-panel"><h2>Підсумок звіту</h2><p className="muted">{storageError?'Чернетку не вдалося зберегти в браузері.':'Чернетка зберігається в цій вкладці.'}</p><dl>
   <div><dt>Завдань</dt><dd>{rows.filter(row=>row.taskId).length}</dd></div>
   <div><dt>Виконань</dt><dd>{rows.reduce((sum,row)=>sum+(row.taskId?Number(row.quantity):0),0)}</dd></div>
   <div className="points-total"><dt>Балів</dt><dd>{points.toLocaleString('uk-UA')}</dd></div>
  </dl><p className="muted">Бали будуть зараховані після перевірки.</p>
  <button disabled={busy||!loaded}>{busy?'Надсилаємо…':'Подати звіт'}</button></section>
  {error&&<Notice error>{error}</Notice>}{saved&&<Notice>Звіт надіслано на перевірку.</Notice>}</aside>
 </form>;
}
