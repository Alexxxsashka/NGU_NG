import 'dotenv/config';
import {Pool} from 'pg';
import tasks from '../src/data/tasks.json';

async function main(){
  if(process.env.VERCEL_ENV==='preview')throw new Error('Production balance cannot run in preview.');
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
  const pool=new Pool({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL,max:1});
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query("SELECT pg_advisory_xact_lock(hashtext('admin-access'))");
    await c.query("SELECT pg_advisory_xact_lock(hashtext('task-catalog'))");
    const key='balance-250-points-v1';
    if((await c.query('SELECT key FROM settings WHERE key=$1',[key])).rows.length){await c.query('COMMIT');console.log('Balance already applied; subsequent administrator edits preserved.');return;}
    const actor=(await c.query("SELECT id FROM app_user WHERE email=$1 AND role='admin'",[process.env.ADMIN_EMAIL||'guardsowh@gmail.com'])).rows[0];
    if(!actor)throw new Error('Owner administrator required.');
    const log=async(action:string,id:string,before:unknown,after:unknown)=>c.query('INSERT INTO audit_logs(actor_id,action,entity_id,before,after,reason) VALUES($1,$2,$3,$4,$5,$6)',[actor.id,action,id,JSON.stringify(before),JSON.stringify(after),'За дорученням власника: максимум 50 000 $ на тиждень, ставка від балів; зменшення винагороди за повторювані завдання.']);
    let changed=0;
    for(const t of tasks){
      const old=(await c.query('SELECT * FROM tasks WHERE seed_key=$1 AND active=true FOR UPDATE',[t.seedKey])).rows[0];
      if(!old||old.points===t.points)continue;
      const updated=(await c.query('UPDATE tasks SET points=$1,version=version+1 WHERE id=$2 RETURNING *',[t.points,old.id])).rows[0];
      await log('task.update',old.id,old,updated);changed++;
    }
    for(const [name,value] of [['pointValue','200'],['weeklyCap','50000']]){
      const old=(await c.query('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[name])).rows[0]?.value??null;
      await c.query('INSERT INTO settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',[name,JSON.stringify(value)]);
      await log(name==='pointValue'?'settings.pointValue':'settings.cap',name,old,value);
    }
    const ranks=(await c.query('SELECT * FROM ranks WHERE multiplier IS NULL FOR UPDATE')).rows;
    for(const rank of ranks){await c.query('UPDATE ranks SET multiplier=1 WHERE id=$1',[rank.id]);await log('rank.save',String(rank.id),rank,{...rank,multiplier:'1'});}
    const awards=(await c.query("SELECT * FROM weekly_awards WHERE week_start>=date_trunc('week',now() AT TIME ZONE 'Europe/Kyiv')::date AND (cap IS NULL OR cap>50000) FOR UPDATE")).rows;
    let previousOverLimit=0;
    for(const award of awards){
      const total=(await c.query("SELECT coalesce(sum(i.approved_amount),0)::numeric AS amount FROM report_items i JOIN reports r ON r.id=i.report_id WHERE r.static_id=$1 AND r.week_start=$2 AND i.status='approved'",[award.static_id,award.week_start])).rows[0].amount;
      const cap=Number(total)>50000?total:'50000';if(Number(total)>50000)previousOverLimit++;
      await c.query('UPDATE weekly_awards SET cap=$1 WHERE id=$2',[cap,award.id]);await log('award.cap',award.id,award,{...award,cap});
    }
    await c.query('INSERT INTO settings(key,value) VALUES($1,$2::jsonb)',[key,JSON.stringify({appliedAt:new Date().toISOString(),pointValue:'200',weeklyCap:'50000',targetPoints:250})]);
    await c.query('COMMIT');console.log(JSON.stringify({updatedTasks:changed,defaultRankMultipliers:ranks.length,currentWeekCaps:awards.length,previousOverLimit}));
  }catch{await c.query('ROLLBACK');console.error('Balance update rolled back.');process.exitCode=1;}finally{c.release();await pool.end();}
}
main();
