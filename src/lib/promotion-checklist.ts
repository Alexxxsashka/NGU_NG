import type {PoolClient} from 'pg';
import {query} from '@/db';

export type Requirement={id:string;rank:number;title:string;kind:'standard'|'assessment'};
type Confirmation={id:string;source:string;at:string;by:string};

export async function promotionChecklist(profile:{id:string;rank:number;cycle:string},c?:PoolClient){
 const sql=`SELECT requirement.value AS rule,confirmation.value AS confirmation
 FROM settings requirement LEFT JOIN settings confirmation
 ON confirmation.key='promotion-confirmation:'||$1||':'||$2||':'||(requirement.value->>'id')
 WHERE requirement.key LIKE 'promotion-requirement:%' AND requirement.value->>'rank'=$3
 ORDER BY requirement.value->>'title',requirement.key`;
 const args=[profile.id,profile.cycle,String(profile.rank)];
 return c?(await c.query<{rule:Requirement;confirmation:Confirmation|null}>(sql,args)).rows
  :query<{rule:Requirement;confirmation:Confirmation|null}>(sql,args);
}
