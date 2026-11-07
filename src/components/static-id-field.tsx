'use client';
import {useEffect,useId,useState} from 'react';
import {Field,useResource} from './ui';

type Match={static_id:string;name:string;unit_name:string|null};
export function StaticIdField({unitId}:{unitId?:string}){
 const id=useId();
 const [value,setValue]=useState(''),[search,setSearch]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setSearch(value),180);return()=>clearTimeout(timer);},[value]);
 const lookup=useResource<Match[]>(/^[0-9]{1,30}$/.test(search)?'personnel-lookup?'+new URLSearchParams({q:search,...(unitId?{unit:unitId}:{})}):null);
 const selected=value===search?lookup.data?.find(person=>person.static_id.replace(/^0+(?=\d)/,'')===value.replace(/^0+(?=\d)/,'')):undefined;
 return <Field label="Static ID">
  <input name="staticId" list={id} inputMode="numeric" pattern="[0-9]{1,30}" required value={value} onChange={e=>setValue(e.target.value)} placeholder="Введіть Static ID бійця"/>
  <datalist id={id}>{value===search&&!lookup.loading&&lookup.data?.map(person=><option key={person.static_id} value={person.static_id}>{person.name}{person.unit_name?' · '+person.unit_name:''}</option>)}</datalist>
  {selected&&<small role="status">{selected.name}{selected.unit_name?' · '+selected.unit_name:''}</small>}
  {value===search&&lookup.error&&<small role="status">{lookup.error}</small>}
 </Field>;
}
