import type {ReactNode} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';

export function CardFace({title,image,description,icon,badge,indicator,showImageTitle=true}:{title:string;image:string;description?:string;icon?:ReactNode;badge?:string;indicator?:ReactNode;showImageTitle?:boolean}){
 return <>
  <span className="home-route-art">
   <Image src={image} alt="" fill sizes="(max-width: 520px) 100vw, (max-width: 1050px) 50vw, 33vw"/>
   {showImageTitle&&<span className="image-button-title" aria-hidden="true">{title}</span>}
   {badge&&<span className="pill prime">{badge}</span>}
  </span>
  <span className={icon?"home-route-copy":"home-route-copy home-route-copy-plain"}>
   {icon&&<span className="home-route-icon">{icon}</span>}
   <span><strong>{title}</strong>{description&&<small>{description}</small>}</span>
   {indicator??<ArrowUpRight size={18} aria-hidden="true"/>}
  </span>
 </>;
}

export function CardLink({href,...face}:{href:string;title:string;image:string;description?:string;icon?:ReactNode;badge?:string;showImageTitle?:boolean}){
 return <Link className="home-route-card" href={href}><CardFace {...face}/></Link>;
}
