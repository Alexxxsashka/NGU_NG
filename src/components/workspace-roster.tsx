'use client';
import {ChoiceGrid} from './choice-grid';
import {useState} from 'react';
import {Field} from './ui';

export type RosterPerson={static_id:string;first_name:string;last_name:string;rank_name:string|null;position:string|null;active:boolean;completed:number};
export function WorkspaceRoster({people,managed}:{people:RosterPerson[];managed:boolean}){
 const [search,setSearch]=useState(''),[rank,setRank]=useState(''),[position,setPosition]=useState(''),[active,setActive]=useState(''),[training,setTraining]=useState('');
 const visible=people.filter(person=>{
  const identity=(person.first_name+' '+person.last_name+' '+person.static_id).toLocaleLowerCase('uk');
  return identity.includes(search.trim().toLocaleLowerCase('uk'))&&(!rank||rank===person.rank_name)&&(!position||position===person.position)&&
   (!active||person.active===(active==='active'))&&(!training||(person.completed>0)===(training==='has-results'));
 });
 return <section className="panel" id="unit-roster"><h2>Особовий склад · {visible.length}</h2>
  {managed&&<div className="filters">
   <Field label="ПІБ або Static ID"><input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></Field>
   <Field label="Звання"><ChoiceGrid value={rank} onChange={e=>setRank(e.target.value)}><option value="">Усі</option>{[...new Set(people.map(person=>person.rank_name).filter(Boolean))].map(name=><option key={name}>{name}</option>)}</ChoiceGrid></Field>
   <Field label="Посада"><ChoiceGrid value={position} onChange={e=>setPosition(e.target.value)}><option value="">Усі</option>{[...new Set(people.map(person=>person.position).filter(Boolean))].map(name=><option key={name}>{name}</option>)}</ChoiceGrid></Field>
   <Field label="Стан"><ChoiceGrid value={active} onChange={e=>setActive(e.target.value)}><option value="">Усі</option><option value="active">Активні</option><option value="inactive">Архівні</option></ChoiceGrid></Field>
   <Field label="КМБ"><ChoiceGrid value={training} onChange={e=>setTraining(e.target.value)}><option value="">Усі</option><option value="has-results">Є зараховані етапи</option><option value="no-results">Без зарахованих етапів</option></ChoiceGrid></Field>
  </div>}
  <div className="table-wrap"><table><thead><tr><th>Боєць</th><th>Static ID</th><th>Звання</th><th>Посада</th>{managed&&<><th>Стан</th><th>Зараховано етапів КМБ</th></>}</tr></thead>
   <tbody>{visible.length?visible.map(person=><tr key={person.static_id}><td>{person.first_name} {person.last_name}</td><td>{person.static_id}</td><td>{person.rank_name??'Не призначено'}</td><td>{person.position||'Не призначено'}</td>{managed&&<><td>{person.active?'Активний':'Архівний'}</td><td>{person.completed}</td></>}</tr>):<tr><td colSpan={managed?6:4}>За цими умовами записів немає.</td></tr>}</tbody>
  </table></div>
 </section>;
}
