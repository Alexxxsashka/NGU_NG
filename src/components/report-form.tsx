'use client';
import {useState,useRef,useEffect} from 'react';
import {Plus,Trash2,ClipboardList,ExternalLink} from 'lucide-react';
import {currentWeek,monday,shiftDate,dateLabel,timeLabels,type Catalog} from '@/lib/domain';
import {evidenceLines,MAX_REPORT_BYTES,MAX_TASK_EVIDENCE} from '@/lib/report-limits';
import {evidence} from '@/lib/validation';
import {api,useResource,Field,Notice,Loading} from './ui';
type Entry={id:string;taskId:string;quantity:number;evidence:string};
const DRAFT_KEY='ngu.weekly-report.draft.v1';
const emptyIdentity={staticId:'',firstName:'',lastName:'',rank:''};
type SubmitKeys={idempotencyKey:string;contextToken:string;digest:string};
type Draft={week:string;unitId:string;entries:Entry[];identity:typeof emptyIdentity;keys:SubmitKeys|null};
const emptyEntry=():Entry=>({id:crypto.randomUUID(),taskId:'',quantity:1,evidence:''});
export function ReportForm(){
 const [week,setWeek]=useState(currentWeek),[unitId,setUnit]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<{number:string;points?:number;quantity?:number;week:string}|null>(null);
 const [identity,setIdentity]=useState(emptyIdentity),[restored,setRestored]=useState(false),[storageError,setStorageError]=useState(false);
 const resource=useResource<Catalog>('catalog?week='+week),keys=useRef<SubmitKeys|null>(null);
 const draft=():Draft=>({week,unitId,entries,identity,keys:keys.current});
 function persist(value:Draft){
  try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(value));setStorageError(false);}
  catch{setStorageError(true);}
 }
 useEffect(()=>{
  try{
   const raw=sessionStorage.getItem(DRAFT_KEY);
   if(raw){
    const saved=JSON.parse(raw) as Draft;
    setWeek(saved.week);setUnit(saved.unitId);setEntries(saved.entries);setIdentity(saved.identity);keys.current=saved.keys;
   }
  }catch{setStorageError(true);}
  setRestored(true);
 },[]);
 useEffect(()=>{
  if(!restored||receipt)return;
  persist({week,unitId,entries,identity,keys:keys.current});
 },[restored,week,unitId,entries,identity,receipt]);
 const data=resource.data?.week===week?resource.data:null;const allowed=data?.tasks.filter(t=>!t.unitId||t.unitId===unitId)||[];
 const rows=entries.length?entries:[{id:'initial',taskId:'',quantity:1,evidence:''}];
 const update=(id:string,patch:Partial<Entry>)=>{setEntries(rows.map(e=>e.id===id?{...e,...patch}:e));setReceipt(null);};
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy||resource.loading||resource.error||!data?.open)return;setError('');setReceipt(null);const fd=new FormData(event.currentTarget);
  const selected=rows.map(e=>({entry:e,task:allowed.find(t=>t.id===e.taskId)}));if(selected.some(e=>!e.task)){setError('Оберіть доступне завдання для кожного запису.');return;}
  const rank=Number(fd.get('rank'));
  if(!data.ranks.some(r=>r.id===rank)||!data.units.some(u=>u.id===unitId)){setError('Оберіть чинні підрозділ і звання.');return;}
  const firstName=identity.firstName.trim(),lastName=identity.lastName.trim();
  if(!firstName||!lastName){setError('Заповніть ім’я та прізвище.');return;}
  const body={week,unitId,staticId:identity.staticId,firstName,lastName,rank,website:fd.get('website'),entries:selected.map(({entry:e,task:t})=>({taskId:t!.id,version:t!.version,quantity:e.quantity,evidenceUrls:evidenceLines(e.evidence)}))};
  for(const [index,entry] of body.entries.entries()){
   const label='Завдання '+(index+1)+'. ';
   if(!entry.evidenceUrls.length){setError(label+'Додайте хоча б одне посилання на доказ.');return;}
   if(entry.evidenceUrls.length>MAX_TASK_EVIDENCE){setError(label+'Додайте до '+MAX_TASK_EVIDENCE+' посилань або скористайтеся спільною папкою.');return;}
   for(const [linkIndex,url] of entry.evidenceUrls.entries()){
    const result=evidence.safeParse(url);
    if(!result.success){setError(label+'Посилання '+(linkIndex+1)+'. '+result.error.issues[0].message);return;}
   }
  }
  const payload=JSON.stringify(body);
  if(new TextEncoder().encode(payload).length>MAX_REPORT_BYTES-256){
   setError('Звіт завеликий. Об’єднайте докази в спільну папку та додайте посилання на неї.');return;
  }
  setBusy(true);
  try{
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))),byte=>byte.toString(16).padStart(2,'0')).join('');
   if(keys.current?.digest!==digest)keys.current={idempotencyKey:crypto.randomUUID(),contextToken:crypto.randomUUID(),digest};
   persist(draft());
   const {idempotencyKey,contextToken}=keys.current;
   const result=await api<{number:string;points?:number;quantity?:number;week:string}>('reports',{...body,idempotencyKey,contextToken});
   setReceipt(result);setEntries([]);setIdentity(emptyIdentity);setUnit('');keys.current=null;
   try{sessionStorage.removeItem(DRAFT_KEY);}catch{setStorageError(true);}
  }catch(e){setError((e as Error).message||'Не вдалося підтвердити запис. Повторіть подання.');}finally{setBusy(false);}
 }
 const points=rows.reduce((n,e)=>n+(allowed.find(t=>t.id===e.taskId)?.points||0)*(e.quantity||0),0);
 if(!restored)return <div id="content"><Loading/></div>;
 return <div id="content"><div className="page-heading"><div><h1>Подати звіт</h1><p>Ваші завдання та докази за звітний тиждень.</p></div><span className={'pill '+(data?.open?'approved':'pending')}>{data?.open?'Прийом відкрито':'Прийом закрито'}</span></div>{resource.error&&<Notice error>{resource.error} <button type="button" className="text-button" onClick={resource.refresh}>Повторити</button></Notice>}{resource.loading&&!data&&<Loading/>}{storageError?<Notice error>Браузер не зберіг чернетку. Скопіюйте докази перед оновленням сторінки.</Notice>:<p className="muted">Чернетка автоматично зберігається в цій вкладці.</p>}<form className="report-layout" onSubmit={submit} inert={busy}><div className="report-main"><section className="panel"><h2>Дані військовослужбовця</h2><div className="form-grid"><Field label="Статичний ID *"><input name="staticId" value={identity.staticId} onChange={e=>{setReceipt(null);setIdentity({...identity,staticId:e.target.value});}} inputMode="numeric" pattern="[0-9]{1,30}" placeholder="Наприклад, 0007" required maxLength={30}/></Field><Field label="Звання *"><select name="rank" value={identity.rank} onChange={e=>{setReceipt(null);setIdentity({...identity,rank:e.target.value});}} required><option value="" disabled>Оберіть звання</option>{data?.ranks.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></Field><Field label="Ім’я *"><input name="firstName" value={identity.firstName} onChange={e=>{setReceipt(null);setIdentity({...identity,firstName:e.target.value});}} required maxLength={100} autoComplete="given-name"/></Field><Field label="Прізвище *"><input name="lastName" value={identity.lastName} onChange={e=>{setReceipt(null);setIdentity({...identity,lastName:e.target.value});}} required maxLength={100} autoComplete="family-name"/></Field><Field wide label="Підрозділ *"><select value={unitId} onChange={e=>{setReceipt(null);setUnit(e.target.value);}} required><option value="">Оберіть підрозділ</option>{data?.units.map(u=><option key={u.id} value={u.id}>{u.name==='ВСП'?'ВСП — Військова служба правопорядку':u.name}</option>)}</select></Field></div><label className="honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label></section><section className="panel"><div className="section-heading"><h2><ClipboardList size={20}/>Виконані завдання</h2><span>{rows.length} / 50</span></div>{rows.map((e,i)=>{const task=allowed.find(t=>t.id===e.taskId);return <div className="task-entry" key={e.id}><div className="section-heading"><strong>Завдання {i+1}</strong>{rows.length>1&&<button type="button" className="text-button danger" onClick={()=>setEntries(rows.filter(r=>r.id!==e.id))}><Trash2 size={15}/>Видалити</button>}</div><div className="task-fields"><Field label="Завдання *"><select required value={e.taskId} onChange={ev=>update(e.id,{taskId:ev.target.value})}><option value="">Оберіть завдання</option>{e.taskId&&!task&&<option value={e.taskId}>Повторіть вибір для цього підрозділу</option>}{[false,true].map(specific=><optgroup key={String(specific)} label={specific?'Завдання підрозділу':'Загальні завдання'}>{allowed.filter(t=>!!t.unitId===specific).map(t=><option key={t.id} value={t.id}>{t.name} · {t.points} б. · {timeLabels[t.timeCategory]}</option>)}</optgroup>)}</select></Field><Field label="Кількість *"><input type="number" min={1} max={10000} step={1} required value={e.quantity} onChange={ev=>update(e.id,{quantity:Number(ev.target.value)})}/></Field></div>{task&&<div className="task-meta"><span className={'pill '+task.timeCategory}>{timeLabels[task.timeCategory]}</span><span>{task.points} балів за виконання{task.startsAt?' · '+task.startsAt+'–'+task.endsAt:''}</span></div>}{e.taskId&&!task&&<Notice error>Завдання недоступне для вибраного підрозділу. Докази збережено — оберіть інше завдання.</Notice>}<Field label="Посилання на докази *"><textarea rows={3} required maxLength={MAX_REPORT_BYTES} placeholder="https://…&#10;Одне посилання на рядок" value={e.evidence} onChange={ev=>update(e.id,{evidence:ev.target.value})}/><small>{evidenceLines(e.evidence).length} / {MAX_TASK_EVIDENCE} посилань · однакові посилання враховуються один раз</small></Field></div>;})}<button className="secondary full" type="button" disabled={rows.length>=50||busy} onClick={()=>{setReceipt(null);setEntries([...rows,emptyEntry()]);}}><Plus size={17}/>Додати завдання</button></section>{error&&<Notice error>{error}</Notice>}{receipt&&<Notice>Звіт <strong>{receipt.number}</strong> записано. {receipt.points!==undefined?receipt.points+' балів. ':''}Очікує перевірки адміністратора.</Notice>}<button className="submit" disabled={busy||resource.loading||!data?.open||!!resource.error}>{busy?'Зберігаємо…':'Подати звіт'}</button></div><aside className="report-aside"><section className="panel"><h2>Звітний період</h2><Field label="Початок тижня"><input type="date" required value={week} onChange={e=>{if(e.target.value){setReceipt(null);setWeek(monday(e.target.value));}}}/></Field><p className="muted">{dateLabel(week)} — {dateLabel(shiftDate(week,6))}</p></section><section className="panel summary-panel"><h2>Підсумок звіту</h2><dl><div><dt>Позицій</dt><dd>{rows.filter(e=>e.taskId).length}</dd></div><div><dt>Виконань</dt><dd>{rows.reduce((n,e)=>n+(e.taskId?e.quantity:0),0)}</dd></div><div className="points-total"><dt>Балів</dt><dd>{points.toLocaleString('uk-UA')}</dd></div></dl><small>Бали підтвердить адміністратор після перегляду доказів.</small></section><p className="help-note"><ExternalLink size={18}/>Додайте посилання на скриншоти або спільну папку. Кілька виконань можна об’єднати в одному завданні.</p><button type="button" className="text-button" disabled={resource.loading} onClick={resource.refresh}>Оновити список завдань</button></aside></form></div>;
}
