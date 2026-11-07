import 'server-only';
import {z} from 'zod';
import {query} from '@/db';
import {accessibleUnits} from './unit-page';
import {HttpError} from './security';
import type {Viewer} from './domain';

export async function lookupPersonnel(actor:Viewer,term:string|null,scope:string|null){
 const input=z.object({term:z.string().regex(/^[0-9]{1,30}$/),scope:z.uuid().nullable()}).parse({term,scope});
 if(input.scope){
  const [unit]=await accessibleUnits(actor.id,input.scope);
  if(!unit?.editor)throw new HttpError('Довідник цього підрозділу недоступний.',403);
 }else if(actor.role!=='admin')throw new HttpError('Довідник доступний адміністраторам.',403);
 const prefix=input.term.replace(/^0+(?=\d)/,'');
 return query(`WITH registered AS (SELECT coalesce(p.static_id,substring(account.username from '^static_([0-9]+)$')) AS static_id,
  coalesce(nullif(trim(p.first_name||' '||p.last_name),''),account.name) AS name,u.name AS unit_name
  FROM app_user account LEFT JOIN personnel p ON p.user_id=account.id LEFT JOIN units u ON u.id=p.unit_id
  WHERE ($2::uuid IS NULL OR (p.active AND (p.unit_id=$2 OR p.unit_id IS NULL))))
  SELECT static_id,name,unit_name FROM registered WHERE regexp_replace(static_id,'^0+(?=[0-9])','') LIKE $1||'%'
  ORDER BY (regexp_replace(static_id,'^0+(?=[0-9])','')=$1) DESC,static_id LIMIT 10`,[prefix,input.scope]);
}
