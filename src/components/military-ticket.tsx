'use client';
import {ChoiceGrid} from './choice-grid';
import {IllustratedSummary} from './illustrated-summary';
import {useState,type FormEvent} from 'react';
import type {militaryTickets} from '@/lib/military-ticket';
import {api,Field,Loading,Notice,useResource} from './ui';

type Data=Awaited<ReturnType<typeof militaryTickets>>;
export function MilitaryTicket({unitId}:{unitId?:string}){
 const {data,error,refresh}=useResource<Data>('military-ticket'+(unitId?'?unit='+unitId:''));
 const [selected,setSelected]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const person=unitId?data?.profiles.find(item=>item.id===selected):data?.profiles[0];
 const ticket=person?.ticket;
 async function save(event:FormEvent<HTMLFormElement>,make:(fields:FormData)=>unknown){
  event.preventDefault();
  if(busy)return;
  setBusy(true);setMessage('');
  try{await api('military-ticket',make(new FormData(event.currentTarget)));await refresh();}
  catch(e){setMessage((e as Error).message);}
  finally{setBusy(false);}
 }
 return <section id="content" className="panel">
  <h1>Військовий квиток НГУ</h1>
  {(error||message)&&<Notice error>{error||message}</Notice>}
  {!data&&!error&&<Loading/>}
  {unitId&&data&&<Field label="Боєць"><ChoiceGrid value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Оберіть профіль</option>{data.profiles.map(item=><option key={item.id} value={item.id}>{item.name} · {item.static_id}</option>)}</ChoiceGrid></Field>}
  {data&&!unitId&&!person&&<p>Кадровий профіль ще недоступний.</p>}
  {person&&<>
   <p>{ticket?.issued?'Квиток видано':person.ready?'Готовий до видачі':ticket?'У процесі':'Програму ще не призначено'}</p>
   <p>Підтверджена дата вступу: {person.joined??'очікує підтвердження'}</p>
   {ticket&&<><p>{ticket.program==='ukmb'?'УКМБ':'КМБ'} · {Math.max(0,person.days??0)} / {person.required} календарних днів</p>
    {ticket.program==='ukmb'?<ul><li>Належність до держструктури: {ticket.external?'підтверджено':'очікує'}</li><li>Лекції {ticket.lectures.length}/5 · Атестації {ticket.assessments.length}/5 · Тренування {ticket.exercises.length}/2</li><li>Ознайомлення: {ticket.orientation?'виконано':'очікує'} · Присяга: {ticket.oath?'складено':'очікує'}</li></ul>:<ul><li>Курс і нормативи: {ticket.course?'зараховано':'очікує'}</li><li>Отримання 5-го звання: {person.rank_five_recorded?'підтверджено кадровим записом':ticket.rankFive?'підтверджено вручну':'очікує'}</li></ul>}
    {ticket.issued&&<p>Видано {new Date(ticket.issued.at).toLocaleDateString('uk-UA',{timeZone:'Europe/Kyiv'})}{ticket.issued.reference&&' · '+ticket.issued.reference}</p>}
   </>}
   {unitId&&<div key={person.id} className="stack">
    <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'verify-date',id:person.id,date:f.get('date')}))}>
     <Field label="Кадрова дата вступу"><input type="date" name="date" required defaultValue={person.joined??''}/></Field><button disabled={busy}>Підтвердити дату</button>
    </form>
    {!ticket?.issued&&<details className="account-action form-disclosure"><IllustratedSummary title="Програма та виконання умов" image="/portal-art/cabinet/training.webp"/>
     <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'confirm',id:person.id,ticket:{
      program:f.get('program'),course:f.has('course'),rankFive:f.has('rankFive'),external:f.has('external'),orientation:f.has('orientation'),oath:f.has('oath'),
      ...Object.fromEntries(['lectures','assessments','exercises'].map(key=>[key,String(f.get(key)??'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean)])),
     }}))}>
      <Field label="Програма"><ChoiceGrid name="program" defaultValue={ticket?.program??'kmb'}><option value="kmb">КМБ</option><option value="ukmb">УКМБ</option></ChoiceGrid></Field>
      <fieldset><legend>КМБ</legend><label className="checkbox"><input type="checkbox" name="course" defaultChecked={ticket?.course}/>Курс і нормативи завершені</label><label className="checkbox"><input type="checkbox" name="rankFive" defaultChecked={ticket?.rankFive}/>Отримання 5-го звання звірено з кадровим записом</label></fieldset>
      <fieldset><legend>УКМБ</legend>
       <label className="checkbox"><input type="checkbox" name="external" defaultChecked={ticket?.external}/>Належність до іншої держструктури підтверджено</label>
       <label className="checkbox"><input type="checkbox" name="orientation" defaultChecked={ticket?.orientation}/>Ознайомлення з територією</label>
       <label className="checkbox"><input type="checkbox" name="oath" defaultChecked={ticket?.oath}/>Присяга складена</label>
       <Field label="Лекції · один запис на рядок"><textarea name="lectures" defaultValue={ticket?.lectures.join('\n')}/></Field>
       <Field label="Атестації · один запис на рядок"><textarea name="assessments" defaultValue={ticket?.assessments.join('\n')}/></Field>
       <Field label="Тренування · один запис на рядок"><textarea name="exercises" defaultValue={ticket?.exercises.join('\n')}/></Field>
      </fieldset>
      <button disabled={busy}>Зберегти підтвердження</button>
     </form>
    </details>}
    {data?.canIssue&&ticket?.issued&&<details className="account-action form-disclosure">
     <IllustratedSummary title="Виправити реквізити квитка" image="/portal-art/cabinet/training.webp"/>
     <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'correct',id:person.id,reference:f.get('reference'),reason:f.get('reason')}))}>
      <Field label="Реквізити"><input name="reference" defaultValue={ticket.issued.reference} maxLength={120}/></Field>
      <Field label="Підстава"><textarea name="reason" required minLength={5} maxLength={2000}/></Field>
      <button disabled={busy}>Зберегти виправлення</button>
     </form>
    </details>}
    {data?.canIssue&&person.ready&&!ticket?.issued&&<form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'issue',id:person.id,reference:f.get('reference')}))}>
     <Field label="Реквізити квитка"><input name="reference" maxLength={120}/></Field><button disabled={busy}>Зафіксувати видачу</button>
    </form>}
   </div>}
  </>}
 </section>;
}
