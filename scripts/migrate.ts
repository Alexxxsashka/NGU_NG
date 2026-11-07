import 'dotenv/config';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
async function main(){
  if(process.env.VERCEL_ENV==='preview'&&process.env.ALLOW_PREVIEW_WRITES!=='true')throw new Error('Preview database writes are disabled.');
  const connectionString=process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL;
  if(!connectionString)throw new Error('DATABASE_URL is required.');
  const pool=new Pool({connectionString,max:1});
  try{await migrate(drizzle(pool),{migrationsFolder:'./drizzle'});console.log('Database migrations applied.');}finally{await pool.end();}
}
main().catch(()=>{console.error('Migration failed; no credentials are printed.');process.exitCode=1;});
