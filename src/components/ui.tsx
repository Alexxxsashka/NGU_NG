'use client';
import {Children,isValidElement,useCallback,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ChoiceGrid} from './choice-grid';
import {RefreshCw,AlertCircle,LoaderCircle} from 'lucide-react';
export async function api<T>(path:string,body?:unknown):Promise<T>{const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const data=await response.json().catch(()=>null);if(!response.ok||data===null)throw new Error(data?.error||data?.message||'Сервер не підтвердив операцію. Спробуйте ще раз.');return data as T;}
export function useResource<T>(path:string|null){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[updatedAt,setUpdatedAt]=useState('');const sequence=useRef(0),lastFetch=useRef(0);
  const refresh=useCallback(async()=>{const seq=++sequence.current;if(!path){setLoading(false);return;}setLoading(true);setError('');lastFetch.current=Date.now();try{const result=await api<T>(path);if(seq===sequence.current){setData(result);setUpdatedAt(new Date().toLocaleTimeString('uk-UA'));}}catch(e){if(seq===sequence.current)setError((e as Error).message);}finally{if(seq===sequence.current)setLoading(false);}},[path]);
  useEffect(()=>{setData(null);void refresh();return()=>{sequence.current++;};},[refresh]);
  useEffect(()=>{const focus=()=>{if(document.visibilityState==='visible'&&Date.now()-lastFetch.current>60000)void refresh();};document.addEventListener('visibilitychange',focus);return()=>document.removeEventListener('visibilitychange',focus);},[refresh]);
  return {data,error,loading,refresh,updatedAt};
}
export function Notice({children,error=false}:{children:ReactNode;error?:boolean}){return <div className={'notice '+(error?'error':'')} role={error?'alert':'status'}><AlertCircle size={18}/><div>{children}</div></div>;}
export function Refresh({loading,onClick,at}:{loading:boolean;onClick:()=>void;at?:string}){return <div className="refresh"><span>{loading?'Завантаження…':at?'Оновлено о '+at:''}</span><button type="button" className="secondary" onClick={onClick} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/>Оновити</button></div>;}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin" size={22}/> Завантажуємо дані…</div>;}
export function Empty({children}:{children:ReactNode}){return <div className="empty">{children}</div>;}
export function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){
 if(Children.toArray(children).some(child=>isValidElement(child)&&child.type===ChoiceGrid))
  return <fieldset className={'choice-field '+(wide?'wide':'')}><legend>{label}</legend>{children}</fieldset>;
 return <label className={wide?'wide':''}><span>{label}</span>{children}</label>;
}
export function Modal({title,onClose,children,className}:{title:string;onClose:()=>void;children:ReactNode;className?:string}){
  const titleId=useId();
  const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog className={className} aria-labelledby={titleId} ref={ref} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="secondary" onClick={onClose} aria-label="Закрити">Закрити</button></div>{children}</dialog>;
}
