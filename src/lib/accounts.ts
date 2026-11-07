import 'server-only';
import { randomUUID,randomBytes } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { transaction } from '@/db';
import { HttpError,sameSecret,hash,throttle } from './security';
const password=z.string().min(12,'Пароль має містити щонайменше 12 символів.').max(128);
export async function bootstrap(request:Request,input:unknown){
  await throttle(request,'bootstrap',5);
  const p=z.object({secret:z.string().min(1).max(200),username:z.string().regex(/^[a-zA-Z0-9_]{3,40}$/),password}).parse(input);
  if(!process.env.BOOTSTRAP_SECRET||!sameSecret(p.secret,process.env.BOOTSTRAP_SECRET))throw new HttpError('Початкове налаштування недоступне.',403);
  const passwordHash=await hashPassword(p.password);const token=randomBytes(32).toString('base64url');
  await transaction(async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");if((await c.query("SELECT id FROM app_user WHERE role='admin'")).rows.length)throw new HttpError('Адміністратора вже створено.',409);
    const id=randomUUID();const email=process.env.ADMIN_EMAIL||id+'@accounts.invalid';
    await c.query("INSERT INTO app_user(id,name,email,email_verified,username,display_username,role) VALUES($1,'Адміністратор',$2,true,$3,$3,'admin')",[id,email,p.username.toLowerCase()]);
    await c.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",[randomUUID(),id,passwordHash]);
    await c.query("INSERT INTO recovery_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 year')",[id,hash(token)]);
    await c.query("INSERT INTO audit_logs(actor_id,action,entity_id) VALUES($1,'admin.bootstrap',$1)",[id]);
  });return {created:true,recoveryToken:token};
}
export async function recover(request:Request,input:unknown){await throttle(request,'recovery',5);const p=z.object({token:z.string().min(30).max(200),password}).parse(input);const passwordHash=await hashPassword(p.password);const replacement=randomBytes(32).toString('base64url');await transaction(async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");const owner=(await c.query('SELECT user_id FROM recovery_tokens WHERE token_hash=$1',[hash(p.token)])).rows[0];if(owner)await c.query('SELECT id FROM app_user WHERE id=$1 FOR UPDATE',[owner.user_id]);const token=(await c.query('SELECT * FROM recovery_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[hash(p.token)])).rows[0];if(!token)throw new HttpError('Код недійсний або вже використаний.');await c.query("UPDATE account SET password=$1,updated_at=now() WHERE user_id=$2 AND provider_id='credential'",[passwordHash,token.user_id]);await c.query('UPDATE app_user SET must_change_password=false WHERE id=$1',[token.user_id]);await c.query('DELETE FROM session WHERE user_id=$1',[token.user_id]);await c.query('DELETE FROM recovery_tokens WHERE user_id=$1',[token.user_id]);await c.query("INSERT INTO recovery_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 year')",[token.user_id,hash(replacement)]);await c.query("INSERT INTO audit_logs(actor_id,action,entity_id) VALUES($1,'password.recover',$1)",[token.user_id]);});return {saved:true,recoveryToken:replacement};}
