import 'server-only';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {query,transaction} from '@/db';
import {audit} from './admin';
import {HttpError} from './security';
import {canonicalStaticId} from './validation';
import type {Viewer} from './domain';

type Access={id:string;name:string;editor:boolean};
const accessSql=`
 SELECT unit.id,unit.name,(account.role='admin' OR global_grant.id IS NOT NULL OR coalesce(d.value->>'commanderUnitId'=unit.id::text AND d.value->>'leadershipRole' IN ('commander','deputy'),false)) AS editor
 FROM units unit
 JOIN app_user account ON account.id=$1 AND NOT account.must_change_password
 LEFT JOIN LATERAL (
  SELECT leader.id FROM personnel leader
  JOIN settings grant_record ON grant_record.key='service:'||leader.id::text AND grant_record.value->>'leadershipRole'='leadership'
  WHERE leader.user_id=account.id AND leader.active
 ) global_grant ON true
 LEFT JOIN personnel p ON p.user_id=account.id AND p.active AND p.unit_id=unit.id
 LEFT JOIN settings d ON d.key='service:'||p.id::text
 WHERE unit.active AND (account.role='admin' OR global_grant.id IS NOT NULL OR p.id IS NOT NULL)
 AND ($2::uuid IS NULL OR unit.id=$2)
 ORDER BY unit.sort_order,unit.name
`;

export function accessibleUnits(userId:string,unitId:string|null=null,client?:PoolClient){
 return client?client.query<Access>(accessSql,[userId,unitId]).then(result=>result.rows):query<Access>(accessSql,[userId,unitId]);
}

const contentFields=z.object({
 overview:z.string().trim().max(4000), schedule:z.string().trim().max(3000),
 rules:z.string().trim().max(4000), contacts:z.string().trim().max(2000),
});
type Content=z.infer<typeof contentFields>;
type News={id:string;title:string;body:string;kind:'news'|'announcement';publishedAt:string;draft?:boolean;archived?:boolean};
type UnitContent=Content&{news:News[]};
const emptyContent:UnitContent={overview:'',schedule:'',rules:'',contacts:'',news:[]};

export async function loadUnitContent(unitId:string){
 const [row]=await query<{value:UnitContent}>('SELECT value FROM settings WHERE key=$1',['unit-page:'+unitId]);
 return {...emptyContent,...row?.value};
}

const operation=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('content'),content:contentFields}),
 z.object({kind:z.literal('publish'),type:z.enum(['news','announcement']),title:z.string().trim().min(1).max(100),body:z.string().trim().min(1).max(3000),draft:z.boolean().optional()}),
 z.object({kind:z.literal('publish-news-draft'),id:z.uuid()}),
 z.object({kind:z.literal('remove-news'),id:z.string().uuid()}),
 z.object({kind:z.literal('assignment'),staticId:canonicalStaticId,rank:z.number().int().positive().max(2147483647).nullable(),position:z.string().trim().max(100)}),
 z.object({kind:z.literal('member'),staticId:canonicalStaticId,grant:z.boolean()}),
]);

async function changeMembership(c:PoolClient,actor:Viewer,unitId:string,id:string,grant:boolean){
 await c.query("SELECT pg_advisory_xact_lock(hashtext('static-account-claims'))");
 const {rows}=await c.query(`
  SELECT p.id,p.unit_id,p.user_id,u.role,d.value->>'commanderUnitId' AS command_unit,d.value->>'leadershipRole' AS leadership_role
  FROM personnel p JOIN app_user u ON u.id=p.user_id
  LEFT JOIN settings d ON d.key='service:'||p.id::text
  WHERE p.static_id::numeric=$1::text::numeric AND p.active
  FOR UPDATE OF p
 `,[id]);
 const target=rows[0];
 if(rows.length!==1||!target||target.role==='admin'||target.leadership_role==='leadership'||target.command_unit||target.user_id===actor.id||
    (grant?target.unit_id!==null&&target.unit_id!==unitId:target.unit_id!==unitId)){
  throw new HttpError('Дія доступна для бійця без підрозділу або зі складу вашого підрозділу. Переведення й призначення командирів виконує адміністратор.',409);
 }
 const next=grant?unitId:null;
 if(target.unit_id!==next){
  await c.query('UPDATE personnel SET unit_id=$1 WHERE id=$2',[next,target.id]);
  await audit(c,actor,grant?'unit.member.grant':'unit.member.revoke',target.id,{unitId:target.unit_id},{unitId:next});
 }
}

export async function updateUnitPage(unitId:string,input:unknown,actor:Viewer){
 const id=z.string().uuid().parse(unitId);
 const action=operation.parse(input);
 return transaction(async c=>{
  // Serialize with administrative assignments and other unit editors.
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[access]}=await c.query<Access>(accessSql,[actor.id,id]);
  if(!access?.editor)throw new HttpError('Редагувати може лише командування цього підрозділу.',403);
  if(action.kind==='member'){
   await changeMembership(c,actor,id,action.staticId,action.grant);
   return {saved:true};
  }
  if(action.kind==='assignment'){
   const {rows:[target]}=await c.query(`SELECT p.id,p.rank,d.value AS details FROM personnel p
    LEFT JOIN app_user u ON u.id=p.user_id LEFT JOIN settings d ON d.key='service:'||p.id::text
    WHERE p.unit_id=$1 AND p.active AND p.static_id::numeric=$2::text::numeric
    AND p.user_id IS DISTINCT FROM $3 AND coalesce(u.role,'member')<>'admin'
    AND coalesce(d.value->>'leadershipRole','member')='member' FOR UPDATE OF p`,[id,action.staticId,actor.id]);
   if(!target)throw new HttpError('Редагувати можна лише бійця цього підрозділу без командної ролі.',403);
   if(action.rank!==null&&!(await c.query('SELECT 1 FROM ranks WHERE id=$1',[action.rank])).rowCount)throw new HttpError('Звання не знайдено.');
   const details={...target.details,position:action.position};
   await c.query('UPDATE personnel SET rank=$1 WHERE id=$2',[action.rank,target.id]);
   await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',['service:'+target.id,JSON.stringify(details)]);
   await audit(c,actor,'unit.assignment',target.id,{rank:target.rank,position:target.details?.position},{rank:action.rank,position:action.position});
   return {saved:true};
  }
  const key='unit-page:'+id;
  const {rows:[row]}=await c.query<{value:UnitContent}>('SELECT value FROM settings WHERE key=$1',[key]);
  const before={...emptyContent,...row?.value};
  let after:UnitContent;
  if(action.kind==='content')after={...before,...action.content};
  else if(action.kind==='publish'){
   if(before.news.filter(news=>!news.archived).length>=50)throw new HttpError('Видаліть стару публікацію перед додаванням нової.',409);
   after={...before,news:[{id:randomUUID(),title:action.title,body:action.body,kind:action.type,draft:action.draft,publishedAt:new Date().toISOString()},...before.news]};
  }else{
   const item=before.news.find(news=>news.id===action.id);
   if(!item||item.archived||(action.kind==='publish-news-draft'&&!item.draft))throw new HttpError('Публікація недоступна.',409);
   after={...before,news:before.news.map(news=>news.id!==action.id?news:action.kind==='publish-news-draft'?
    {...news,draft:false,publishedAt:new Date().toISOString()}:{...news,archived:true})};
  }
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(after)]);
  await audit(c,actor,'unit.page.'+action.kind,id,before,after);
  return {saved:true};
 });
}
