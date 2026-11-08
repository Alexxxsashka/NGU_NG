import type {ReactNode} from 'react';
import Image from 'next/image';
import {ChevronDown} from 'lucide-react';

export function IllustratedSummary({title,image,icon}:{title:string;image:string;icon?:ReactNode}){
 return <summary className="illustrated-summary">
  <Image src={image} alt="" fill sizes="(max-width: 700px) 100vw, 75vw"/>
  <span>{icon}{title}</span>
  <ChevronDown size={22} aria-hidden="true"/>
 </summary>;
}
