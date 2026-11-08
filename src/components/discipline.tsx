'use client';
import {IllustratedSummary} from './illustrated-summary';
import {useState,type FormEvent} from 'react';
import {annexRules} from '@/lib/discipline-annex';
import {fineRules} from '@/lib/discipline-fines';
import type {disciplineCases} from '@/lib/discipline';
import {evidenceLines} from '@/lib/report-limits';
import {api,Field,Loading,Notice,useResource} from './ui';

const outcomes={demote:'Кадрове пониження','dismiss-service':'Звільнення зі служби',dismiss:'Закрито без стягнення',remark:'Усне зауваження',reprimand:'Письмова догана',severe:'Сувора догана'};
export function Discipline({staff=false}:{staff?:boolean}){
 const {data,error,refresh}=useResource<Awaited<ReturnType<typeof disciplineCases>>>('discipline'+(staff?'?staff=1':''));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function save(event:FormEvent<HTMLFormElement>,make:(f:FormData)=>unknown){
  event.preventDefault();
  if(busy)return;
  const form=event.currentTarget;setBusy(true);setMessage('');
  try{await api('discipline',make(new FormData(form)));form.reset();await refresh();}
  catch(e){setMessage((e as Error).message);}
  finally{setBusy(false);}
 }
 const form=(id:string,kind:string,label:string,options?:React.ReactNode,proof=false)=><details className="account-action form-disclosure"><IllustratedSummary title={label} image="/portal-art/catalog/review.webp"/>
  <form className="stack narrow" onSubmit={event=>void save(event,f=>({id,kind,body:f.get('body'),rule:f.get('rule'),category:f.get('category'),amount:Number(f.get('amount')),hours:Number(f.get('hours')),responsible:f.get('responsible'),outcome:f.get('outcome'),accept:f.get('accept')==='yes',cancel:f.get('cancel')==='yes',links:evidenceLines(String(f.get('links')??''))}))}>
   {options}<Field label="Підстава або пояснення"><textarea name="body" required minLength={5} maxLength={2000}/></Field>
   {proof&&<Field label="Докази"><textarea name="links" placeholder="Одне HTTPS-посилання на рядок"/></Field>}
   <button disabled={busy}>{label}</button>
  </form></details>;
 return <section className="panel" id="content">
  <h1>{staff?'Дисциплінарний облік ВСП':'Мої дисциплінарні справи'}</h1>
  {(error||message)&&<Notice error>{error||message}</Notice>}{!data&&!error&&<Loading/>}
  {staff&&data?.leader&&<details className="account-action form-disclosure"><IllustratedSummary title="Письмове делегування ВСП" image="/portal-art/catalog/approval.webp"/>
   <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'delegate',person:f.get('person'),unit:f.get('unit'),until:f.get('until'),body:f.get('body')}))}>
    <Field label="Командир ВСП"><select name="person" required defaultValue=""><option value="">Оберіть профіль</option>{data.people.map(p=><option value={p.id} key={p.id}>{p.name} · {p.static_id}</option>)}</select></Field>
    <Field label="Підрозділ у межах делегування"><select name="unit" required>{data.units.map(unit=><option value={unit.id} key={unit.id}>{unit.name}</option>)}</select></Field>
    <Field label="Діє до включно"><input name="until" type="date" required/></Field>
    <Field label="Письмова підстава"><textarea name="body" required minLength={5} maxLength={2000}/></Field>
    <button disabled={busy}>Зберегти делегування</button>
   </form>
   <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'revoke-delegation',person:f.get('person')}))}>
    <Field label="Відкликати в профілю"><select name="person" required defaultValue=""><option value="">Оберіть профіль</option>{data.people.map(p=><option value={p.id} key={p.id}>{p.name} · {p.static_id}</option>)}</select></Field>
    <button className="secondary" disabled={busy}>Відкликати делегування</button>
   </form>
  </details>}
  {staff&&!!data?.people.length&&<details className="account-action form-disclosure"><IllustratedSummary title="Зафіксувати проступок" image="/portal-art/catalog/checkpoint.webp"/>
   <form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'file',person:f.get('person'),ruleCode:f.get('ruleCode')||undefined,rule:f.get('rule'),body:f.get('body'),links:evidenceLines(String(f.get('links')??''))}))}>
    <Field label="Боєць"><select name="person" required defaultValue=""><option value="">Оберіть профіль</option>{data.people.map(p=><option value={p.id} key={p.id}>{p.name} · {p.static_id}</option>)}</select></Field>
    <Field label="Додаток 1"><select name="ruleCode"><option value="">Інша норма</option>{annexRules.map(rule=><option key={rule.code} value={rule.code}>{rule.code} · {rule.title}</option>)}</select></Field>
    <Field label="Порушена норма"><input name="rule" required minLength={5} maxLength={2000}/></Field>
    <Field label="Обставини"><textarea name="body" required minLength={5} maxLength={2000}/></Field>
    <Field label="Докази"><textarea name="links" placeholder="Одне HTTPS-посилання на рядок"/></Field><button disabled={busy}>Зареєструвати справу</button>
   </form></details>}
  {data?.cases.length===0&&<p>Дисциплінарних справ немає.</p>}
  {data?.cases.map(entry=><details className="account-action form-disclosure" key={entry.id}><IllustratedSummary title={[entry.name,entry.rule,entry.decision?entry.decision.outcome==='fine'?'Дисциплінарний штраф':outcomes[entry.decision.outcome]:'Перевірка'].join(' · ')} image="/portal-art/unit-actions/archive.webp"/>
   <p>{entry.body}</p>
   {entry.annex&&<p>{entry.annex.version} · {entry.annex.code} · {entry.annex.category}. {entry.annex.sanctions} {entry.annex.conditions}</p>}
   {entry.externalAppeal&&<p>Зовнішня скарга: {entry.externalAppeal.body}</p>}
   {entry.externalDecision&&<p>Зовнішнє рішення: {entry.externalDecision.body}{entry.externalDecision.cancel&&' · Стягнення скасовано'}</p>}
   {entry.own&&entry.decision&&entry.decision.outcome!=='dismiss'&&!entry.externalAppeal&&form(entry.id,'external-appeal','Зареєструвати зовнішню скаргу',undefined,true)}
   {staff&&data.leader&&entry.externalAppeal&&!entry.externalDecision&&form(entry.id,'external-decision','Зафіксувати зовнішнє рішення',<Field label="Наслідок"><select name="cancel"><option value="no">Залишити чинним</option><option value="yes">Стягнення скасовано зовнішнім рішенням</option></select></Field>,true)}
   {staff&&data.leader&&!entry.own&&!entry.decision&&entry.annex&&/понижен|звільнен/i.test(entry.annex.sanctions)&&form(entry.id,'personnel-sanction','Застосувати кадрове стягнення',<Field label="Рішення"><select name="outcome">{/понижен/i.test(entry.annex.sanctions)&&<option value="demote">Понизити на один ранг</option>}{/звільнен/i.test(entry.annex.sanctions)&&<option value="dismiss-service">Звільнити зі служби</option>}</select></Field>)}
   {entry.explanation&&<p>Пояснення: {entry.explanation.body}</p>}
   {entry.decision&&<p>{entry.decision.body}{entry.active&&' · Чинна догана'}</p>}
   {entry.suspension&&<p>Відсторонення до {new Date(entry.suspension.until).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})} · {entry.suspension.responsible} · {entry.suspension.body}{entry.suspension.ended&&' · Поновлено: '+entry.suspension.ended.body}</p>}
   {staff&&data.leader&&!entry.own&&!entry.decision&&!entry.suspension&&form(entry.id,'suspend','Тимчасово відсторонити',<>
    <Field label="Тривалість у годинах"><input name="hours" type="number" min={1} max={72} required/></Field>
    <Field label="Відповідальний за перевірку"><input name="responsible" required maxLength={120}/></Field>
   </>)}
   {staff&&data.leader&&!entry.own&&entry.suspension&&!entry.suspension.ended&&form(entry.id,'end-suspension','Оформити поновлення')}
   {entry.fine&&<>
    <p>Штраф: {entry.fine.amount} $ · ст. {entry.fine.rule} Етичного кодексу · до {new Date(entry.fine.dueAt).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv'})}.</p>
    {entry.fine.payment?.links?.map(link=><p key={link}><a href={link} target="_blank" rel="noreferrer">Доказ сплати</a></p>)}
    {entry.fine.review&&<p>{entry.fine.review.accept?'Сплату підтверджено':'Доказ відхилено'} · {entry.fine.review.body}</p>}
    {entry.own&&!entry.appealResult?.cancel&&(!entry.fine.payment||entry.fine.review?.accept===false)&&<form className="stack narrow" onSubmit={event=>void save(event,f=>({kind:'submit-payment',id:entry.id,source:f.get('source')}))}>
     <Field label="Доказ сплати до бюджету НГУ"><input name="source" type="url" required/></Field><button disabled={busy}>Подати доказ</button>
    </form>}
    {staff&&entry.canDecide&&!entry.own&&!entry.appealResult?.cancel&&entry.fine.payment&&!entry.fine.review&&form(entry.id,'review-payment','Перевірити сплату',<Field label="Рішення"><select name="accept"><option value="yes">Підтвердити</option><option value="no">Відхилити</option></select></Field>)}
   </>}
   {staff&&entry.canDecide&&!entry.own&&!entry.decision&&form(entry.id,'fine','Оформити штраф',<>
    <Field label="Правова підстава"><select name="rule">{Object.entries(fineRules).map(([rule,info])=><option key={rule} value={rule}>{rule} · {info.title}</option>)}</select></Field>
    <Field label="Категорія"><select name="category"><option value="lower">Нижча</option><option value="higher">Вища</option></select></Field>
    <Field label="Сума в ігрових доларах"><input name="amount" type="number" min={1} step={1} required/></Field>
   </>)}
   {entry.work?.assignment&&<p>Норматив: {entry.work.assignment.body}</p>}
   {entry.work?.submission&&<p>Виконання: {entry.work.submission.body}</p>}
   {entry.work?.review&&<p>Рішення щодо нормативу: {entry.work.review.body}</p>}
   {entry.lifted&&<p>Догану знято: {entry.lifted.body}</p>}
   {entry.appeal&&<p>Скарга: {entry.appeal.body}</p>}
   {entry.appealResult&&<p>Рішення за скаргою: {entry.appealResult.body}</p>}
   {[...new Set([...entry.links,...entry.explanation?.links??[],...entry.work?.submission?.links??[],...entry.appeal?.links??[],...entry.externalAppeal?.links??[],...entry.externalDecision?.links??[]])].map((link,index)=><p key={link}><a href={link} target="_blank" rel="noreferrer">Доказ {index+1}</a></p>)}
   {entry.own&&!entry.decision&&form(entry.id,'explain','Подати пояснення',undefined,true)}
   {entry.own&&entry.decision&&!entry.acknowledged&&<form onSubmit={event=>void save(event,()=>({kind:'acknowledge',id:entry.id}))}><button disabled={busy}>Ознайомлено</button></form>}
   {entry.own&&entry.acknowledged&&!entry.appeal&&entry.decision?.outcome!=='dismiss'&&form(entry.id,'appeal','Подати скаргу',undefined,true)}
   {entry.own&&entry.active&&!entry.work&&form(entry.id,'request-work','Рапорт на дострокове зняття')}
   {entry.own&&entry.active&&entry.work?.assignment&&(!entry.work.submission||entry.work.review?.accept===false)&&form(entry.id,'submit-work','Подати виконання',undefined,true)}
   {staff&&data.leader&&entry.appeal&&!entry.appealResult&&form(entry.id,'resolve-appeal','Розглянути скаргу',<Field label="Рішення"><select name="cancel"><option value="no">Залишити чинним</option><option value="yes">Скасувати</option></select></Field>)}
   {staff&&entry.canDecide&&!entry.own&&!entry.decision&&form(entry.id,'decide','Зберегти рішення',<Field label="Рішення"><select name="outcome">{Object.entries(outcomes).filter(([key])=>key!=='demote'&&key!=='dismiss-service').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>)}
   {staff&&entry.canDecide&&!entry.own&&entry.active&&entry.work&&<>
    {!entry.work.assignment&&form(entry.id,'assign-work','Призначити норматив')}
    {entry.work.submission&&!entry.work.review&&form(entry.id,'review-work','Перевірити виконання',<Field label="Рішення"><select name="accept"><option value="yes">Прийняти</option><option value="no">Відхилити</option></select></Field>)}
    {entry.work.review?.accept&&form(entry.id,'lift','Оформити дострокове зняття')}
   </>}
  </details>)}
 </section>;
}
