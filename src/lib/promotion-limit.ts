import type {PoolClient} from 'pg';
import {query} from '@/db';
import {HttpError} from './security';

type PromotionRestriction={unverified:boolean;reprimand:boolean;available_at:string|null};

export async function promotionRestriction(id:string,c?:PoolClient){
 const sql=`SELECT EXISTS(SELECT 1 FROM settings WHERE key='promotion-history:'||$1 AND value->>'at' IS NULL) AS unverified, EXISTS(SELECT 1 FROM settings WHERE key LIKE 'discipline:%' AND value->>'person'=$1
  AND (value#>>'{decision,until}')::timestamptz>now() AND value->'lifted' IS NULL
  AND (value#>>'{appealResult,cancel}') IS DISTINCT FROM 'true') AS reprimand,
 (SELECT to_char((occurred+interval '24 hours') AT TIME ZONE 'Europe/Kyiv','DD.MM.YYYY HH24:MI:SS')
  FROM (SELECT created_at AS occurred FROM audit_logs WHERE entity_id=$1 AND (
   (action='personnel.record' AND after->>'action'='promote') OR
   (action IN ('personnel.save','unit.assignment') AND (after->>'rank')::int>(before->>'rank')::int) OR
   (action='personnel.assign' AND (after->>'rank')::int>(before#>>'{profile,rank}')::int)
  ) UNION ALL SELECT (value->>'at')::timestamptz FROM settings WHERE key='promotion-history:'||$1) events
  WHERE occurred>now()-interval '24 hours' ORDER BY occurred DESC LIMIT 1) AS available_at`;
 const [restriction]=c?(await c.query<PromotionRestriction>(sql,[id])).rows:await query<PromotionRestriction>(sql,[id]);
 if(restriction.unverified)return 'Потрібна кадрова звірка дати попереднього підвищення.';
 if(restriction.reprimand)return 'Підвищення недоступне, поки діє догана.';
 if(restriction.available_at)return 'Наступне підвищення доступне з '+restriction.available_at+' за Києвом.';
 return null;
}

export async function checkPromotion(c:PoolClient,id:string,rank:number,next:number){
 if(next!==rank+1)throw new HttpError('Підвищення можливе лише на один ранг.',409);
 const restriction=await promotionRestriction(id,c);
 if(restriction)throw new HttpError(restriction,409);
}
