'use client';
import {useState} from 'react';
import type {readAwardShare} from '@/lib/award-share';
import {api,Field,Notice} from './ui';

export function AwardShare(){
 const [data,setData]=useState<Awaited<ReturnType<typeof readAwardShare>>|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section className="panel" id="content">
  <h1>Отримати звіти за премії</h1>
  <p>Для перевірки введіть код доступу, отриманий від НГУ.</p>
  <form className="stack narrow" onSubmit={async event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const code=new FormData(form).get('code');
   setBusy(true);setError('');setData(null);
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
   <div className="table-wrap"><table><thead><tr><th>Звіт</th><th>Ім’я та прізвище</th><th>Static ID</th><th>Зараховано балів</th><th>Нараховано</th></tr></thead>
    <tbody>{data.reports.map(row=><tr key={row.number}><td>{row.number}</td><td>{row.name}</td><td>{row.staticId}</td><td>{row.points}</td><td>{row.amount} $</td></tr>)}</tbody>
   </table></div>
  </section>}
 </section>;
}
