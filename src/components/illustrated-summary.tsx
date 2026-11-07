import Image from 'next/image';
import {ChevronDown} from 'lucide-react';

export function IllustratedSummary({title,artwork}:{title:string;artwork:string}){
 return <summary className="illustrated-summary">
  <span className="illustrated-summary-art"><Image src={'/portal-art/catalog/'+artwork+'.webp'} alt="" fill sizes="(max-width: 760px) 75vw, 620px"/></span>
  <span>{title}</span>
  <ChevronDown size={20} aria-hidden="true"/>
 </summary>;
}
