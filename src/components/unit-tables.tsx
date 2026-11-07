'use client';
import Link from 'next/link';
import Image from 'next/image';
import Decimal from 'decimal.js';
import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {AdminCatalog} from './task-editor';
import {Filters,initialFilters,filterQuery} from './report-list';
import {useResource,Notice,Loading,Empty,Refresh} from './ui';
type Matrix={columns:{id:string;name:string;active:boolean;time_category:string}[];people:{static_id:string;first_name:string;last_name:string;rank:number;reports:number;cells:{task_id:string;quantity:number;points:number;approved_points:number;approved_amount:string}[]}[]};
const unitArtwork=[
 [/^нцп|навчальний центр/,'training'],
 [/^всп|^звп|військової поліції|військова служба правопорядку/,'police'],
 [/^ссо|nord division/,'nord'],
 [/^злп|логістичного призначення/,'logistics'],
 [/^оаз|авіаційний загін/,'aviation'],
 [/^старший склад/,'command'],
] as const;

export function UnitTables({unitId}:{unitId?:string}){
 const catalog=useResource<AdminCatalog>('admin/catalog'),[f,setF]=useState(()=>({...initialFilters(),unit:unitId||''})),[onlyUsed,setOnlyUsed]=useState(true),[hidden,setHidden]=useState<string[]>([]);
 const resource=useResource<Matrix>(unitId?'admin/matrix?'+filterQuery({...f,unit:unitId}):null);
 const unit=catalog.data?.units.find(u=>u.id===unitId);const used=new Set(resource.data?.people.flatMap(p=>p.cells.map(c=>c.task_id))||[]);const columns=resource.data?.columns.filter(c=>(!onlyUsed||used.has(c.id))&&!hidden.includes(c.id))||[];
 if(!unitId)return catalog.error?<Notice error>{catalog.error}</Notice>:catalog.loading?<Loading/>:
  <div className="unit-grid">{catalog.data?.units.map(unit=>{
   const name=unit.name.trim().toLocaleLowerCase('uk-UA');
   const art=unitArtwork.find(([pattern])=>pattern.test(name))?.[1];
   return <Link className={'unit-card unit-poster '+(!unit.active?'archived':'')} key={unit.id} href={'/admin/weekly-bonus/units/'+unit.id}>
    {art?<div className="unit-poster-art"><Image src={'/units/'+art+'.webp'} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 33vw"/></div>:
     <div className="unit-poster-art unit-poster-fallback"><Image src="/ngu-emblem.svg" alt="" width={66} height={66}/></div>}
    <div className="unit-poster-caption">
     <div><h2>{unit.name}</h2><p>{unit.active?'Завдання, особовий склад і тижневі підсумки':'Архівний підрозділ'}</p></div>
     <ArrowUpRight size={21} aria-hidden="true"/>
    </div>
   </Link>;
  })}</div>;
 return <><p><Link href="/admin/weekly-bonus/units">Усі підрозділи</Link> / {unit?.name} {unit?.active&&<Link className="button secondary" href={'/units/'+unit.id}>Внутрішня сторінка</Link>}</p><Filters value={f} onChange={setF}/><div className="section-heading"><label className="checkbox"><input type="checkbox" checked={onlyUsed} onChange={e=>setOnlyUsed(e.target.checked)}/>Лише завдання з виконаннями</label><Refresh loading={resource.loading} at={resource.updatedAt} onClick={resource.refresh}/></div>{resource.error?<Notice error>{resource.error}</Notice>:resource.loading&&!resource.data?<Loading/>:<><details className="column-picker"><summary>Видимі колонки завдань ({columns.length})</summary><div>{resource.data?.columns.map(c=><label className="checkbox" key={c.id}><input type="checkbox" checked={!hidden.includes(c.id)} onChange={e=>setHidden(e.target.checked?hidden.filter(id=>id!==c.id):[...hidden,c.id])}/>{c.name}{!c.active?' (архівне)':''}</label>)}</div></details><div className="table-wrap matrix"><table><thead><tr><th>Військовослужбовець</th><th>Звання</th><th>Звітів</th><th>Виконань</th><th>Усього балів</th><th>Підтверджено балів</th><th>До виплати, $</th>{columns.map(c=><th key={c.id}>{c.name}{!c.active&&<small>Архівне</small>}</th>)}</tr></thead><tbody>{resource.data?.people.map(p=><tr key={p.static_id}><td><Link href={'/admin/weekly-bonus/reports?person='+encodeURIComponent(p.static_id)+'&from='+f.from+'&to='+f.to}>{p.last_name} {p.first_name}</Link><small>ID {p.static_id}</small></td><td className="number">{p.rank}</td><td className="number">{p.reports}</td><td className="number">{p.cells.reduce((n,c)=>n+c.quantity,0)}</td><td className="number">{p.cells.reduce((n,c)=>n+c.points,0)}</td><td className="number">{p.cells.reduce((n,c)=>n+c.approved_points,0)}</td><td className="number">{p.cells.reduce((n,c)=>n.plus(c.approved_amount),new Decimal(0)).toFixed(2)}</td>{columns.map(c=><td className="number" key={c.id}>{p.cells.find(cell=>cell.task_id===c.id)?.quantity||'—'}</td>)}</tr>)}</tbody></table>{!resource.data?.people.length&&<Empty>За цей період виконань немає.</Empty>}</div><p className="muted">Звання — з останнього звіту в періоді. Заголовки завдань показують поточні назви; назви на момент подання збережені в деталях звітів.</p></>}</>;
}
