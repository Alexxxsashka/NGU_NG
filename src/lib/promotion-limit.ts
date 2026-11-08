import type {PoolClient} from 'pg';
import {HttpError} from './security';

export async function checkPromotion(c:PoolClient,id:string,rank:number,next:number){
 if(next!==rank+1)throw new HttpError('Підвищення можливе лише на один ранг.',409);
 const {rows:[latest]}=await c.query<{available_at:string}>(`SELECT to_char(
  (created_at + interval '24 hours') AT TIME ZONE 'Europe/Kyiv','DD.MM.YYYY HH24:MI') AS available_at
  FROM audit_logs WHERE entity_id=$1 AND created_at > now()-interval '24 hours' AND (
   (action='personnel.record' AND after->>'action'='promote') OR
   (action IN ('personnel.save','unit.assignment') AND (after->>'rank')::int>(before->>'rank')::int) OR
   (action='personnel.assign' AND (after->>'rank')::int>(before#>>'{profile,rank}')::int)
  ) ORDER BY created_at DESC LIMIT 1`,[id]);
 if(latest)throw new HttpError('Наступне підвищення доступне з '+latest.available_at+' за Києвом.',409);
}
