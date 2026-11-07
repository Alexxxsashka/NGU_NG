import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
let pool: Pool | undefined;
types.setTypeParser(1082,value=>value);
export function getPool(){
  if(!process.env.DATABASE_URL) throw new Error('Базу даних ще не підключено.');
  return pool ??= new Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
}
export const db=()=>drizzle(getPool(),{schema});
export async function query<T extends QueryResultRow=QueryResultRow>(text:string, values:unknown[]=[]){return (await getPool().query<T>(text,values)).rows;}
export async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await getPool().connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
