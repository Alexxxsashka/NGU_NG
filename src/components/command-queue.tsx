import Link from 'next/link';
import {query} from '@/db';

export type QueueFilters={kind?:string;state?:string;person?:string;page?:string;entry?:string};
const kinds={requests:'Службова заявка',review:'Звіт на підвищення','promotion-decisions':'Запит на нове звання'};
const states={pending:'На розгляді',clarification:'Потребує уточнення'};
const pageSize=25;

export async function CommandQueue({unitId,filters,actorId}:{unitId:string;filters:QueueFilters;actorId:string}){
 const kind=Object.hasOwn(kinds,filters.kind??'')?filters.kind!:'';
 const state=filters.state==='clarification'?'clarification':'pending';
 const person=typeof filters.person==='string'?filters.person.trim().slice(0,100):'';
 const page=Math.min(10000,Math.max(1,Number.parseInt(filters.page??'',10)||1));
 const root='/command/'+unitId;
 const rows=await query<{id:string;kind:keyof typeof kinds;person:string;title:string;submitted:string}>(`
  WITH entries AS (
   SELECT value->>'id' AS id,'requests' AS kind,value->>'name' AS person,value->>'title' AS title,value->>'createdAt' AS submitted
   FROM settings WHERE key LIKE 'service-entry:%' AND value->>'module'='requests'
    AND value->>'status'=$2 AND value->>'author'<>$4
    AND (value->>'unit'=$1 OR value->>'targetUnit'=$1)
   UNION ALL
   SELECT coalesce(value->>'reportId',value->>'id'),'review',max(value->>'name'),'Перевірка виконань',min(value->>'createdAt')
   FROM settings WHERE key LIKE 'promotion-credit:%' AND value->>'unitId'=$1 AND value->>'status'=$2 AND value->>'userId'<>$4 GROUP BY 1
   UNION ALL
   SELECT value->>'id','promotion-decisions',value->>'name','Рішення щодо звання',value->>'createdAt'
   FROM settings WHERE key LIKE 'promotion-report:%' AND value->>'unitId'=$1 AND value->>'status'=$2 AND value->>'userId'<>$4
  )
  SELECT * FROM entries WHERE ($3='' OR kind=$3) AND ($5='' OR strpos(lower(person),lower($5))>0)
  ORDER BY submitted ASC NULLS LAST,id LIMIT $6 OFFSET $7
 `,[unitId,state,kind,actorId,person,pageSize+1,(page-1)*pageSize]);
 const href=(next:number)=>root+'/queue?'+new URLSearchParams({kind,state,person,page:String(next)});
 return <section id="content" className="panel">
  <h1>Єдина черга підрозділу</h1>
  <form className="filters" action={root+'/queue'}>
   <label>Тип<select name="kind" defaultValue={kind}><option value="">Усі</option>{Object.entries(kinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Стан<select name="state" defaultValue={state}>{Object.entries(states).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>ПІБ<input type="search" name="person" defaultValue={person} maxLength={100}/></label>
   <button>Застосувати</button>
  </form>
  {rows.length?<div className="table-wrap"><table><thead><tr><th>Боєць</th><th>Тип</th><th>Подано</th><th>Дія</th></tr></thead>
   <tbody>{rows.slice(0,pageSize).map(row=><tr key={row.kind+row.id}><td>{row.person}</td><td>{row.title}<small>{kinds[row.kind]}</small></td><td>{row.submitted?.slice(0,10)}</td>
    <td><Link href={root+'/'+row.kind+'?'+new URLSearchParams({entry:row.id})}>Відкрити</Link></td></tr>)}</tbody></table></div>:<p>За цими фільтрами записів немає.</p>}
  <nav className="pagination" aria-label="Сторінки черги">{page>1&&<Link href={href(page-1)}>Назад</Link>}<span>Сторінка {page}</span>{rows.length>pageSize&&<Link href={href(page+1)}>Далі</Link>}</nav>
 </section>;
}
