import 'dotenv/config';
import {Pool} from 'pg';
import tasks from '../src/data/tasks.json';
async function main(){
  if(process.env.VERCEL_ENV==='preview'&&process.env.ALLOW_PREVIEW_WRITES!=='true')throw new Error('Preview writes disabled.');
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});const c=await pool.connect();
  try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('initial-catalog'))");
    if((await c.query("SELECT key FROM settings WHERE key='initialCatalog'")).rows.length){await c.query('COMMIT');return;}
    const unitNames=['НЦП','ВСП','ССО "Nord Division"','ЗЛП','ОАЗ','Старший склад'];
    for(const [i,name] of unitNames.entries())await c.query('INSERT INTO units(name,sort_order) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[name,i]);
    for(let rank=1;rank<=15;rank++)await c.query('INSERT INTO ranks(id,name,multiplier) VALUES($1,$2,1) ON CONFLICT(id) DO NOTHING',[rank,String(rank)]);
    const units=(await c.query('SELECT id,name FROM units')).rows;
    for(const [index,t] of tasks.entries()){
      const unitId=t.unit==='Загальні завдання'?null:units.find(u=>u.name===t.unit)?.id;
      await c.query(`INSERT INTO tasks(seed_key,unit_id,name,normalized_name,points,sort_order,time_category,starts_at,ends_at,variant_group_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(seed_key) DO NOTHING`,[t.seedKey,unitId,t.name,t.name.trim().replace(/\s+/g,' ').toLocaleLowerCase('uk-UA'),t.points,index,t.timeCategory,t.startsAt,t.endsAt,t.variantGroupId]);
    }
    await c.query("INSERT INTO settings(key,value) VALUES('weeklyCap','\"50000\"'::jsonb),('pointValue','\"200\"'::jsonb) ON CONFLICT(key) DO NOTHING");
    await c.query("INSERT INTO settings(key,value) VALUES('initialCatalog','1'::jsonb)");
    await c.query('COMMIT');console.log('Initial catalog saved without overwriting existing rates.');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
}
main().catch(()=>{console.error('Seed failed; no credentials are printed.');process.exitCode=1;});
