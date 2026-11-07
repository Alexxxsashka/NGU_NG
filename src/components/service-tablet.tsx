import {CabinetActivity} from './cabinet-activity';
import {PasswordAction} from './personal';
import {dateLabel} from '@/lib/domain';
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
 joined_verified:boolean;
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
  SELECT p.static_id,CASE WHEN u.active THEN u.id END AS unit_id,p.first_name,p.last_name,p.active,p.rank,CASE WHEN u.active THEN u.name END AS unit_name,k.name AS rank_name,
         details.value->>'leadershipRole' AS leadership_role,details.value->>'joinedOn' AS joined_on,coalesce(details.value->>'joinedOnVerified'='true',false) AS joined_verified,details.value->>'callsign' AS callsign,details.value->>'bio' AS bio,details.value->>'position' AS position,
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
 const [account]=card?[]:await query<{username:string|null}>('SELECT username FROM app_user WHERE id=$1',[user.id]);
 const staticId=card?.static_id??account?.username?.match(/^static_([0-9]+)$/)?.[1];
 const number=(value:string)=>BigInt(value).toLocaleString('uk-UA');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
 const joinedOn=card?.joined_on&&Number.isFinite(Date.parse(card.joined_on))?card.joined_on:null;
 const days=joinedOn&&card?.active?Math.max(0,Math.round((Date.parse(today)-Date.parse(joinedOn))/86400000)):null;
 const facts=[
  {label:'Звання',value:card?.rank_name??(card?.rank!=null?String(card.rank):'Не призначено'),icon:Shield},
  {label:'Підрозділ',value:card?.unit_name??'Очікує призначення',icon:Users},
  {label:'Посада',value:card?.position||'Не призначено',icon:Layers3},
  {label:'Дата вступу',value:joinedOn?dateLabel(joinedOn):'Не вказано',icon:CalendarDays},
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
     {staticId&&<span>Static ID <strong>{staticId}</strong></span>}
     <span className={'pill '+(card?.active?'approved':'prime')}>{card?(card.active?(card.unit_id?'Активний профіль':'Очікує призначення'):'Архівний профіль'):'Профіль очікує прив’язки'}</span>
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
  {!editable&&card?.active&&(card.unit_id||card.leadership_role==='leadership')&&<div className="service-actions">
   <Link className="button secondary" href={card.leadership_role==='leadership'?'/my-unit':'/units/'+card.unit_id}><Users size={17} aria-hidden="true"/> {card.leadership_role==='leadership'?'Усі підрозділи':'Мій підрозділ'}</Link>
  </div>}
 </section>
 {editable&&<>
  <CabinetActivity user={user} today={today} joinedOn={joinedOn}/>
  <section className="portal-shortcuts" aria-labelledby="cabinet-security">
   <h2 id="cabinet-security">Особисті дані та безпека</h2>
   <div className="cabinet-security-grid">
    {card?.active&&<PersonalServiceForm today={today} details={{joinedOn,joinedVerified:card.joined_verified,callsign:card.callsign??'',bio:card.bio??''}}/>}
    <PasswordAction/>
   </div>
  </section>
 </>}
 </>;
}
