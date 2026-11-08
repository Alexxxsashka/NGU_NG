'use client';
import {useState} from 'react';
import type {readAwardShare} from '@/lib/award-share';
import {api,Field,Modal,Notice} from './ui';

export function AwardShare(){
 const [data,setData]=useState<Awaited<ReturnType<typeof readAwardShare>>|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const report=data?.reports.find(row=>row.number===selected);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section className="panel" id="content">
  <h1>Отримати звіти за премії</h1>
  <p>Для перевірки введіть код доступу, отриманий від НГУ.</p>
  <form className="stack narrow" onSubmit={async event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const code=new FormData(form).get('code');
   setBusy(true);setError('');setData(null);setSelected(null);
   try{setData(await api('award-share',{code}));form.reset();}
   catch(error){setError((error as Error).message);}
   finally{setBusy(false);}
  }}>
   <Field label="Код доступу"><input name="code" type="password" required maxLength={64} autoComplete="off"/></Field>
   <button disabled={busy}>{busy?'Перевіряємо код…':'Відкрити звіти'}</button>
  </form>
  {error&&<Notice error>{error}</Notice>}
  {data&&<section className="portal-shortcuts">
   <h2>Наказ {data.number}</h2><p>Тиждень від {data.week} · Загальна сума {data.total} $</p>
   <div className="table-wrap"><table><thead><tr><th>Звіт</th><th>Ім’я та прізвище</th><th>Static ID</th><th>Зараховано балів</th><th>Нараховано</th><th>Перевірка</th></tr></thead>
    <tbody>{data.reports.map(row=><tr key={row.number}><td>{row.number}</td><td>{row.name}</td><td>{row.staticId}</td><td>{row.points}</td><td>{row.amount} $</td><td>{row.tasks?<button type="button" className="secondary" onClick={()=>setSelected(row.number)}>Завдання й докази</button>:<small>Потрібен новий код для деталей</small>}</td></tr>)}</tbody>
   </table></div>
  </section>}
  {report&&<Modal className="report-dialog" title={report.number+' · '+report.name} onClose={()=>setSelected(null)}>
   <div className="report-dialog-scroll" tabIndex={0} role="region" aria-label="Завдання й докази звіту">
    <p>Static ID {report.staticId} · {report.points} балів · до виплати {report.amount} $</p>
    {report.tasks?.map(task=><article key={task.id} className="report-item">
     <h3>{task.name}</h3>
     <p>{task.quantity} виконань × {task.rate} б. = <strong>{task.points} б.</strong></p>
     {task.reward!==null&&task.multiplier!==null&&<p>Ставка за виконання {task.reward} $ · множник звання ×{task.multiplier}</p>}
     <p>Розраховано: {task.estimate??'—'} $ · Погоджено до виплати: <strong>{task.approved??'—'} $</strong></p>
     {task.links.length?<div className="evidence-list">{task.links.map((url,index)=><a key={url+index} href={url} target="_blank" rel="noopener noreferrer">Доказ {index+1}</a>)}</div>:<p className="muted">У звіті немає доступних HTTPS-посилань на докази.</p>}
    </article>)}
   </div>
  </Modal>}
 </section>;
}
