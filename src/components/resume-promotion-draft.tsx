'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';

export function ResumePromotionDraft({userId,fallback}:{userId:string;fallback?:{href:string;title:string}}){
 const [hasDraft,setHasDraft]=useState(false);
 useEffect(()=>{
  try{
   const rows:unknown=JSON.parse(sessionStorage.getItem('ngu.promotion-draft:'+userId)??'null');
   setHasDraft(Array.isArray(rows)&&rows.some(row=>row&&(row.taskId||row.links||row.quantity!=='1')));
  }catch{setHasDraft(false);}
 },[userId]);
 if(hasDraft)return <Link className="button" href="/portal/promotion-points/submit">Продовжити чернетку звіту</Link>;
 return fallback?<Link className="button" href={fallback.href}>{fallback.title}</Link>:<p className="muted">Наразі справ, що потребують уваги, немає.</p>;
}
