'use client';
import {Children,isValidElement,useEffect,useId,useRef,useState,type ChangeEventHandler,type ReactNode} from 'react';

type OptionProps={children?:ReactNode;value?:string|number;disabled?:boolean;label?:string};
type Props={children:ReactNode;name?:string;value?:string|number;defaultValue?:string|number;required?:boolean;disabled?:boolean;onChange?:ChangeEventHandler<HTMLInputElement>};

function optionsOf(children:ReactNode,disabled=false):{value:string;label:ReactNode;disabled:boolean}[]{
 return Children.toArray(children).flatMap(node=>{
  if(!isValidElement<OptionProps>(node))return [];
  if(node.type==='option')return [{value:String(node.props.value??node.props.children??''),label:node.props.children,disabled:disabled||!!node.props.disabled}];
  return optionsOf(node.props.children,disabled||!!node.props.disabled);
 });
}

export function ChoiceGrid({children,name,value,defaultValue,required,disabled,onChange}:Props){
 const id=useId();
 const group=useRef<HTMLSpanElement>(null);
 const options=optionsOf(children);
 const initial=String(defaultValue??options.find(option=>!option.disabled)?.value??'');
 const [stored,setStored]=useState<string|null>(null);
 const selected=String(value??stored??initial);
 const available=options.some(option=>option.value===selected&&!option.disabled);
 const current=available?selected:value===undefined&&!(required&&selected==='')?(options.find(option=>!option.disabled)?.value??''):'';
 useEffect(()=>{
  const form=group.current?.closest('form');
  const reset=()=>setStored(null);
  form?.addEventListener('reset',reset);
  return ()=>form?.removeEventListener('reset',reset);
 },[]);
 const shown=options.filter(option=>!required||option.value!=='');
 return <span ref={group} role="radiogroup" aria-required={required||undefined} className="request-type-grid choice-grid">
  {shown.map((option,index)=><span className="request-type" key={option.value+':'+index}>
   <input type="radio" id={id+'-'+index} name={name??id} form={name?undefined:id}
    value={option.value} checked={current===option.value} disabled={disabled||option.disabled}
    required={required&&!!name&&!disabled}
    onChange={event=>{setStored(event.currentTarget.value);onChange?.(event);}}/>
   <label htmlFor={id+'-'+index}>{option.label}</label>
  </span>)}
  {shown.length===0&&<span className="muted">Немає доступних варіантів.</span>}
  {required&&!disabled&&((!name&&!current)||shown.every(option=>option.disabled))&&<input className="choice-grid-validation" aria-label="Потрібен доступний варіант" name={name} required value="" onChange={()=>{}}/>}
 </span>;
}
