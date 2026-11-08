'use client';
import {useState} from 'react';
import {dateLabel} from '@/lib/domain';
import type {awardOrders,awardRecipients} from '@/lib/award-register';
import {StaticIdField} from './static-id-field';
import {api,Field,Loading,Notice,useResource} from './ui';

function RecipientPayments({week}:{week:string}){
 const resource=useResource<Awaited<ReturnType<typeof awardRecipients>>>('admin/award-orders/recipients?week='+week);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function mark(staticId:string,name:string){
  if(busy||!confirm('Підтвердити фактичну виплату для '+name+'?'))return;
  setBusy(true);setError('');
  try{await api('admin/award-orders/recipients',{week,staticId});await resource.refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 return <section className="panel">
  <h2>Фактичні виплати · {dateLabel(week)}</h2>
  {(error||resource.error)&&<Notice error>{error||resource.error}</Notice>}
  {resource.loading&&!resource.data&&<Loading/>}
  {resource.data&&<>
   <p>Підтверджено {resource.data.filter(row=>row.paidAt).length} із {resource.data.length}. Для старих наказів відмітки можна внести після звірки.</p>
   <div className="table-wrap"><table><thead><tr><th>Боєць</th><th>Сума за наказом</th><th>Фактична виплата</th></tr></thead>
    <tbody>{resource.data.map(row=><tr key={row.staticId}><td>{row.name}<small>ID {row.staticId}</small></td><td>{row.amount} $</td>
     <td>{row.paidAt?<><strong>Підтверджено</strong><small>{new Date(row.paidAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})} · {row.paidBy}</small></>:<button className="secondary" disabled={busy} onClick={()=>void mark(row.staticId,row.name)}>Відмітити виплату</button>}</td></tr>)}</tbody>
   </table></div>
  </>}
 </section>;
}

export function AwardRegister(){
 const resource=useResource<Awaited<ReturnType<typeof awardOrders>>>('admin/award-orders');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const [paymentWeek,setPaymentWeek]=useState('');
 return <div id="content">
  <header className="portal-preview-header feature-cover award-orders-cover"><h1>Реєстр наказів про преміювання</h1><p>Виплати, файли Word та записи коригувань.</p></header>
  {(resource.error||error)&&<Notice error>{resource.error||error}</Notice>}
  {saved&&<Notice>Коригування записано окремо від наказу.</Notice>}
  {resource.loading&&!resource.data&&<Loading/>}
  <section className="panel portal-shortcuts"><h2>Накази</h2>
   {resource.data?.orders.length===0&&<p>Наказів поки немає.</p>}
   {resource.data?.orders.length?<div className="table-wrap"><table><thead><tr><th>Номер</th><th>Тиждень</th><th>Отримувачів</th><th>Сума</th><th>Файл</th><th>Виплати</th></tr></thead><tbody>
    {resource.data.orders.map(order=><tr key={order.week}><td>{order.number}</td><td>{dateLabel(order.week)}</td><td>{order.recipientCount}</td><td>{order.total} $</td>
     <td><a href={'/api/admin/award-orders/docx?week='+order.week}>Завантажити Word</a></td><td><button className="secondary" aria-expanded={paymentWeek===order.week} onClick={()=>setPaymentWeek(paymentWeek===order.week?'':order.week)}>Виплати</button></td></tr>)}
   </tbody></table></div>:null}
  </section>
  {paymentWeek&&<RecipientPayments key={paymentWeek} week={paymentWeek}/>}
  {resource.data?.orders.length?<section className="panel">
   <h2>Коригування після виплати</h2>
   <form className="stack narrow" onSubmit={async e=>{
    e.preventDefault();
    const form=e.currentTarget;
    setBusy(true);setError('');setSaved(false);
    try{await api('admin/award-orders/correction',Object.fromEntries(new FormData(form)));form.reset();await resource.refresh();setSaved(true);}
    catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
   }}>
    <Field label="Наказ"><select name="week" required>{resource.data.orders.map(order=><option value={order.week} key={order.week}>{order.number}</option>)}</select></Field>
    <StaticIdField/>
    <Field label="Різниця, $"><input name="delta" type="number" step="0.01" required/></Field>
    <Field label="Підстава"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
    <button disabled={busy}>Записати коригування</button>
   </form>
   <ul className="cabinet-items">{resource.data.corrections.map(entry=><li key={entry.id}>
    <strong>{dateLabel(entry.week)} · ID {entry.staticId} · {Number(entry.delta)>0?'+':''}{entry.delta} $</strong><p>{entry.reason}</p>
   </li>)}</ul>
  </section>:null}
 </div>;
}
