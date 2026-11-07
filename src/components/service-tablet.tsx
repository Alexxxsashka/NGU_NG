import {PersonalServiceForm} from './personal-service-form';
import Image from 'next/image';
import Link from 'next/link';
import {Award, CalendarDays, ClipboardList, Layers3, Shield, Target, Users} from 'lucide-react';
import {query} from '@/db';
import type {Viewer} from '@/lib/domain';

type ServiceCard={
 static_id:string;
 first_name:string;
 last_name:string;
 unit_name:string|null;
 rank_name:string|null;
 rank:number|null;
 active:boolean;
 unit_id:string|null;
 leadership_role:string|null;
 joined_on:string|null;
 callsign:string|null;
 bio:string|null;
 position:string|null;
 reports:string;
 approved_quantity:string;
 approved_points:string;
 pending_items:string;
};

export async function ServiceTablet({user,editable=true}:{user:Viewer;editable?:boolean}){
 const Heading=editable?'h1':'h2';
 const [card]=await query<ServiceCard>(`
  SELECT p.static_id,CASE WHEN u.active THEN u.id END AS unit_id,p.first_name,p.last_name,p.active,p.rank,u.name AS unit_name,k.name AS rank_name,
         details.value->>'leadershipRole' AS leadership_role,details.value->>'joinedOn' AS joined_on,details.value->>'callsign' AS callsign,details.value->>'bio' AS bio,details.value->>'position' AS position,
         totals.reports,totals.approved_quantity,totals.approved_points,totals.pending_items
  FROM personnel p
  LEFT JOIN units u ON u.id=p.unit_id
  LEFT JOIN ranks k ON k.id=p.rank
  LEFT JOIN settings details ON details.key='service:'||p.id::text
  CROSS JOIN LATERAL (
   SELECT count(DISTINCT r.id)::text AS reports,
    coalesce(sum(i.quantity) FILTER (WHERE i.status='approved'),0)::text AS approved_quantity,
    coalesce(sum(i.points) FILTER (WHERE i.status='approved'),0)::text AS approved_points,
    count(*) FILTER (WHERE i.status IN ('pending','clarification'))::text AS pending_items
   FROM reports r JOIN report_items i ON i.report_id=r.id
   WHERE (r.personnel_id=p.id OR r.author_id=p.user_id) AND p.active
  ) totals
  WHERE p.user_id=$1
 `,[user.id]);
 const number=(value:string)=>BigInt(value).toLocaleString('uk-UA');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
 const days=card?.joined_on&&card.active?Math.max(0,Math.round((Date.parse(today)-Date.parse(card.joined_on))/86400000)):null;
 const facts=[
  {label:'Звання',value:card?.rank_name??(card?.rank!=null?String(card.rank):'Не призначено'),icon:Shield},
  {label:'Підрозділ',value:card?.unit_name??'Не призначено',icon:Users},
  {label:'Посада',value:card?.position||'Не призначено',icon:Layers3},
  {label:'Днів у фракції',value:days===null?'—':days.toLocaleString('uk-UA'),icon:CalendarDays},
 ];
 const totals=card?.active?[
  {label:'Подані звіти',value:card.reports,icon:ClipboardList},
  {label:'Зараховані виконання',value:card.approved_quantity,icon:Target},
  {label:'Підтверджені бали',value:card.approved_points,icon:Award},
  {label:'Завдання на перевірці',value:card.pending_items,icon:Layers3},
 ]:null;
 return <><section className="service-tablet" aria-labelledby="service-tablet-title">
  <header className="service-identity">
   <Image src="/ngu-emblem.svg" alt="" width={76} height={76}/>
   <div>
    <div className="service-kicker">Службовий планшет НГУ</div>
    <Heading id="service-tablet-title">{card?card.first_name+' '+card.last_name:user.name}</Heading>
    <div className="service-status">
     {card?.callsign&&<span>Позивний <strong>{card.callsign}</strong></span>}
     {card&&<span>Static ID <strong>{card.static_id}</strong></span>}
     <span className={'pill '+(card?.active?'approved':'prime')}>{card?(card.active?'Активний профіль':'Архівний профіль'):'Профіль очікує прив’язки'}</span>
    </div>
   </div>
  </header>
  <dl className="service-grid service-facts">{facts.map(({label,value,icon:Icon})=><div key={label}>
   <Icon size={19} aria-hidden="true"/><dt>{label}</dt><dd>{value}</dd>
  </div>)}</dl>
  {totals&&<section className="service-totals" aria-labelledby="service-totals-title">
   <div className="service-section-head"><h2 id="service-totals-title">Підсумки служби</h2><span>За весь час</span></div>
   <dl className="service-grid">{totals.map(({label,value,icon:Icon})=><div key={label}>
    <Icon size={19} aria-hidden="true"/><dt>{label}</dt><dd>{number(value)}</dd>
   </div>)}</dl>
  </section>}
  {card?.active&&(card.unit_id||card.leadership_role==='leadership')&&<div className="service-actions">
   <Link className="button secondary" href={card.leadership_role==='leadership'?'/my-unit':'/units/'+card.unit_id}><Users size={17} aria-hidden="true"/> {card.leadership_role==='leadership'?'Усі підрозділи':'Мій підрозділ'}</Link>
  </div>}
 </section>
 {editable&&card?.active&&<PersonalServiceForm today={today} details={{joinedOn:card.joined_on,callsign:card.callsign??'',bio:card.bio??''}}/>}
 </>;
}
