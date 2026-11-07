import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { query } from '@/db';
import { viewer } from './auth';
export class HttpError extends Error { constructor(message:string,public status=400){super(message);} }
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function sameSecret(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);}
export function writable(){if(process.env.VERCEL_ENV==='preview' && process.env.ALLOW_PREVIEW_WRITES!=='true')throw new HttpError('Запис у preview вимкнено. Підключіть окрему базу.',403);}
export function sameOrigin(request:Request){
  const allowed=process.env.APP_URL;
  if(!allowed)throw new HttpError('Адресу сайту ще не налаштовано.',503);
  if(request.headers.get('origin')!==new URL(allowed).origin)throw new HttpError('Недозволене джерело запиту.',403);
}
export async function readBody(request:Request,max=100_000):Promise<unknown>{
  if(!request.headers.get('content-type')?.includes('application/json'))throw new HttpError('Потрібний JSON-запит.',415);
  if(Number(request.headers.get('content-length')||0)>max)throw new HttpError('Запит завеликий.',413);
  const reader=request.body?.getReader();if(!reader)throw new HttpError('Порожній запит.');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new HttpError('Запит завеликий.',413);}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError('Некоректні дані запиту.');}
}
export async function member(request:Request){const u=await viewer(request.headers);if(!u)throw new HttpError('Увійдіть у свій обліковий запис.',401);if(u.mustChangePassword)throw new HttpError('Змініть тимчасовий пароль в особистому кабінеті.',403);return u;}
export async function admin(request:Request){const u=await member(request);if(u.role!=='admin')throw new HttpError('Доступ лише для адміністратора.',403);return u;}
export async function throttle(request:Request,bucket:string,max=12,seconds=3600){
  const secret=process.env.AUTH_SECRET;if(!secret)throw new HttpError('Сервіс ще не налаштовано.',503);
  const ip=request.headers.get(process.env.VERCEL?'x-vercel-forwarded-for':'x-forwarded-for')?.split(',')[0].trim()||'unknown';
  const key=createHmac('sha256',secret).update(bucket+':'+ip).digest('hex');
  const [row]=await query(`INSERT INTO request_limits(key,count,expires_at) VALUES($1,1,now()+($2*interval '1 second'))
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_limits.expires_at<now() THEN 1 ELSE request_limits.count+1 END,
    expires_at=CASE WHEN request_limits.expires_at<now() THEN now()+($2*interval '1 second') ELSE request_limits.expires_at END RETURNING count`,[key,seconds]);
  await query('DELETE FROM request_limits WHERE expires_at<now()-interval \'1 day\'');
  if(row.count>max)throw new HttpError('Забагато спроб. Спробуйте пізніше.',429);
}
export function failure(error:unknown){
  if(error instanceof HttpError)return Response.json({error:error.message},{status:error.status});
  if(error instanceof ZodError)return Response.json({error:error.issues.map(i=>i.message).slice(0,3).join(' ')},{status:400});
  const code=(error as {code?:string})?.code;
  if(code==='23505')return Response.json({error:'Такий запис уже існує. Оновіть список.'},{status:409});
  if(code==='23503')return Response.json({error:'Запис пов’язаний з іншими даними. Скористайтеся архівуванням.'},{status:409});
  console.error('Operation failed',{code:code||'internal'});
  return Response.json({error:'Не вдалося виконати операцію. Дані не підтверджені. Спробуйте пізніше.'},{status:503});
}
