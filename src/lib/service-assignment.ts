import 'server-only';
import {z} from 'zod';
import {query,transaction} from '@/db';
import {audit,lockAdmin} from './admin';
import {HttpError} from './security';
import {lockStaticClaims} from './player-accounts';
import {staticAccountKey,personText} from './validation';
import type {Viewer} from './domain';

const assignment=z.object({
 userId:z.string().min(1).max(100), firstName:personText, lastName:personText,
 unitId:z.string().uuid().nullable(),rank:z.number().int().positive().nullable(),
 joinedOn:z.iso.date().nullable(),position:z.string().trim().max(100),
 leadershipRole:z.enum(['member','commander','deputy','leadership']),
});

export async function assignService(input:unknown,actor:Viewer){
 const p=assignment.parse(input);
 const unitCommand=p.leadershipRole==='commander'||p.leadershipRole==='deputy';
 if(unitCommand&&!p.unitId)throw new HttpError('Для командира або заступника оберіть підрозділ.');
 return transaction(async c=>{
  await lockAdmin(c,actor);
  await lockStaticClaims(c);
  const {rows:[account]}=await c.query(`
   SELECT id,coalesce(substring(username from '^static_([0-9]+)$'),
    (SELECT static_id FROM personnel WHERE user_id=app_user.id),
    (SELECT static_id FROM profile_claims WHERE user_id=app_user.id AND status='pending' ORDER BY created_at DESC LIMIT 1)) AS static_id
   FROM app_user WHERE id=$1 FOR UPDATE
  `,[p.userId]);
  if(!account?.static_id)throw new HttpError('Спочатку призначте акаунту Static ID.');
  const {rows:profiles}=await c.query('SELECT * FROM personnel WHERE static_id::numeric=$1::text::numeric OR user_id=$2 FOR UPDATE',[account.static_id,p.userId]);
  const previous=profiles[0];
  if(profiles.length>1||previous?.user_id&&previous.user_id!==p.userId||previous&&BigInt(previous.static_id)!==BigInt(account.static_id)){
   throw new HttpError('Static ID вже належить іншому кадровому профілю.',409);
  }
  if(p.unitId&&!(await c.query('SELECT 1 FROM units WHERE id=$1 AND active',[p.unitId])).rowCount)throw new HttpError('Оберіть активний підрозділ.');
  const staticId=previous?.static_id??staticAccountKey(account.static_id).slice(7);
  const values=[staticId,p.firstName,p.lastName,p.unitId,p.rank,p.userId];
  const {rows:[profile]}=await c.query(`
   INSERT INTO personnel(static_id,first_name,last_name,unit_id,rank,user_id,active)
   VALUES($1,$2,$3,$4,$5,$6,true)
   ON CONFLICT(static_id) DO UPDATE SET first_name=$2,last_name=$3,unit_id=$4,rank=$5,user_id=$6,active=true
   RETURNING id
  `,values);
  const key='service:'+profile.id;
  const {rows:[old]}=await c.query('SELECT value FROM settings WHERE key=$1',[key]);
  const details={...old?.value,joinedOn:p.joinedOn,position:p.position,leadershipRole:p.leadershipRole,commanderUnitId:unitCommand?p.unitId:null};
  await c.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify(details)]);
  await c.query("UPDATE profile_claims SET status='approved',reason='Кадровий профіль призначено адміністратором',reviewed_by=$1 WHERE user_id=$2 AND static_id::numeric=$3::text::numeric AND status='pending'",[actor.id,p.userId,staticId]);
  await audit(c,actor,'personnel.assign',profile.id,{profile:previous??null,details:old?.value??null},{...p,staticId,details});
  return {saved:true};
 });
}

type CommandRow={unit_name:string;static_id:string;first_name:string;last_name:string;rank_name:string|null;position:string|null};
export function commandRoster(userId:string){
 return query<CommandRow>(`
  SELECT u.name AS unit_name,p.static_id,p.first_name,p.last_name,k.name AS rank_name,d.value->>'position' AS position
  FROM personnel leader
  JOIN settings grant_record ON grant_record.key='service:'||leader.id::text
    AND grant_record.value->>'commanderUnitId'=leader.unit_id::text
  JOIN units u ON u.id=leader.unit_id AND u.active
  JOIN personnel p ON p.unit_id=u.id AND p.active
  LEFT JOIN ranks k ON k.id=p.rank
  LEFT JOIN settings d ON d.key='service:'||p.id::text
  WHERE leader.user_id=$1 AND leader.active
  ORDER BY p.rank DESC NULLS LAST,p.last_name,p.first_name
 `,[userId]);
}

const personalDetails=z.strictObject({
 joinedOn:z.iso.date().nullable(),
 callsign:z.string().trim().max(40),
 bio:z.string().trim().max(500),
});

export async function savePersonalServiceDetails(input:unknown,actor:Viewer){
 const details=personalDetails.parse(input);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date());
 if(details.joinedOn&&details.joinedOn>today)throw new HttpError('Дата вступу не може бути в майбутньому.');
 return transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
  const {rows:[profile]}=await c.query(`
   SELECT p.id FROM personnel p JOIN app_user u ON u.id=p.user_id
   WHERE p.user_id=$1 AND p.active AND NOT u.must_change_password FOR UPDATE OF p
  `,[actor.id]);
  if(!profile)throw new HttpError('Потрібен активний кадровий профіль.',403);
  const key='service:'+profile.id;
  const {rows:[old]}=await c.query("SELECT value FROM settings WHERE key=$1",[key]);
  const before={joinedOn:old?.value?.joinedOn??null,callsign:old?.value?.callsign??'',bio:old?.value?.bio??''};
  await c.query(`
   INSERT INTO settings(key,value) VALUES($1,$2::jsonb)
   ON CONFLICT(key) DO UPDATE SET value=settings.value||excluded.value
  `,[key,JSON.stringify(details)]);
  await audit(c,actor,'personnel.self-details',profile.id,before,details);
  return {saved:true};
 });
}
