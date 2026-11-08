import {ChoiceGrid} from './choice-grid';
import Link from 'next/link';
import {z} from 'zod';
import {query} from '@/db';

export type QueueFilters={kind?:string;state?:string;person?:string;page?:string;entry?:string;from?:string;to?:string;fromQueue?:string;overdue?:string;trail?:string};
const kinds={requests:'Службова заявка',review:'Звіт на підвищення','promotion-decisions':'Запит на нове звання'};
const states={pending:'На розгляді',clarification:'Потребує уточнення'};
const pageSize=25;

function queueFilters(filters:QueueFilters){
 const day=(value:unknown)=>z.iso.date().safeParse(value).data??'';
 return {
  kind:typeof filters.kind==='string'&&Object.hasOwn(kinds,filters.kind)?filters.kind:'',
  state:filters.state==='clarification'?'clarification':'pending',
  person:typeof filters.person==='string'?filters.person.trim().slice(0,100):'',
  page:String(Math.min(10000,Math.max(1,Number.parseInt(filters.page??'',10)||1))),
  from:day(filters.from),to:day(filters.to),overdue:filters.overdue==='1'?'1':'',
 };
}

export function commandQueueHref(unitId:string,filters:QueueFilters){
 return '/command/'+unitId+'/queue?'+new URLSearchParams(queueFilters(filters));
}

export function commandQueueNextHref(unitId:string,filters:QueueFilters){
 if(filters.fromQueue!=='1')return undefined;
 const [next,...remaining]=typeof filters.trail==='string'?filters.trail.slice(0,2048).split(','):[];
 const [kind,entry]=next?.split(':')??[];
 if(!kind||!Object.hasOwn(kinds,kind)||!z.uuid().safeParse(entry).success)return commandQueueHref(unitId,filters);
 return '/command/'+unitId+'/'+kind+'?'+new URLSearchParams({...queueFilters(filters),entry,fromQueue:'1',trail:remaining.join(',')});
}

export async function CommandQueue({unitId,filters,actorId}:{unitId:string;filters:QueueFilters;actorId:string}){
 const normalized=queueFilters(filters);
 const {kind,state,person,from,to,overdue}=normalized;
 const page=Number(normalized.page);
 const reversed=!!from&&!!to&&from>to;
 const root='/command/'+unitId;
 const rows=reversed?[]:await query<{id:string;kind:keyof typeof kinds;person:string;title:string;submitted:string}>(`
  WITH entries AS (
   SELECT value->>'id' AS id,'requests' AS kind,value->>'name' AS person,value->>'title' AS title,value->>'createdAt' AS submitted
   FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'='requests'
    AND value->>'status'=$2 AND value->>'author'<>$4
    AND (value->>'unit'=$1 OR value->>'targetUnit'=$1)
    AND (NOT $10::boolean OR coalesce(value->>'targetUnit',value->>'unit')=$1)
   UNION ALL
   SELECT coalesce(value->>'reportId',value->>'id'),'review',max(value->>'name'),'Перевірка виконань',min(value->>'createdAt')
   FROM settings WHERE key LIKE 'promotion-credit:%' AND value->>'unitId'=$1 AND value->>'status'=$2 AND value->>'userId'<>$4 GROUP BY 1
   UNION ALL
   SELECT value->>'id','promotion-decisions',value->>'name','Рішення щодо звання',value->>'createdAt'
   FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'unitId'=$1 AND value->>'status'=$2 AND value->>'userId'<>$4
  )
  SELECT * FROM entries WHERE ($3='' OR kind=$3) AND ($5='' OR strpos(lower(person),lower($5))>0)
  AND ($8::date IS NULL OR (submitted::timestamptz AT TIME ZONE 'Europe/Kyiv')::date >= $8)
  AND ($9::date IS NULL OR (submitted::timestamptz AT TIME ZONE 'Europe/Kyiv')::date <= $9)
  AND (NOT $10::boolean OR (kind='requests' AND submitted::timestamptz < now()-interval '72 hours'))
  ORDER BY submitted ASC NULLS LAST,id LIMIT $6 OFFSET $7
 `,[unitId,state,kind,actorId,person,pageSize+1,(page-1)*pageSize,from||null,to||null,overdue==='1']);
 const href=(next:number)=>commandQueueHref(unitId,{...normalized,page:String(next)});
 return <section id="content" className="panel">
  <h1>Єдина черга підрозділу</h1>
  <form className="filters" action={root+'/queue'}>
   <fieldset className="choice-field"><legend>Тип</legend><ChoiceGrid name="kind" defaultValue={kind}><option value="">Усі</option>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</ChoiceGrid></fieldset>
   <fieldset className="choice-field"><legend>Стан</legend><ChoiceGrid name="state" defaultValue={state}>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</ChoiceGrid></fieldset>
   <label>ПІБ<input type="search" name="person" defaultValue={person} maxLength={100}/></label>
   <label>Подано від<input type="date" name="from" defaultValue={from}/></label>
   <label>Подано до<input type="date" name="to" defaultValue={to}/></label>
   <label className="checkbox"><input type="checkbox" name="overdue" value="1" defaultChecked={overdue==='1'}/>Лише прострочені заявки</label>
   <button>Застосувати</button><Link className="button secondary" href={root+'/queue'}>Скинути</Link>
  </form>
  {reversed?<p role="alert">Дата початку має бути не пізнішою за дату завершення.</p>:rows.length?<div className="table-wrap"><table><thead><tr><th>Боєць</th><th>Тип</th><th>Подано</th><th>Дія</th></tr></thead>
   <tbody>{rows.slice(0,pageSize).map((row,index)=><tr key={row.kind+row.id}><td>{row.person}</td><td>{row.title}<small>{kinds[row.kind]}</small></td><td>{row.submitted?.slice(0,10)}</td>
    <td><Link href={root+'/'+row.kind+'?'+new URLSearchParams({...normalized,entry:row.id,fromQueue:'1',trail:rows.slice(index+1,pageSize+1).map(next=>next.kind+':'+next.id).join(',')})}>Відкрити</Link></td></tr>)}</tbody></table></div>:<p>За цими фільтрами записів немає.</p>}
  <nav className="pagination" aria-label="Сторінки черги">{page>1&&<Link href={href(page-1)}>Назад</Link>}<span>Сторінка {page}</span>{rows.length>pageSize&&<Link href={href(page+1)}>Далі</Link>}</nav>
 </section>;
}
