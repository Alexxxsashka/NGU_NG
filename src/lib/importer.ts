import 'server-only';
import Papa from 'papaparse';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {query,transaction} from '@/db';
import {hash,HttpError} from './security';
import {audit,lockAdmin} from './admin';
import {week,staticId,evidence,itemStatus} from './validation';
import {normalizeName,type Viewer} from './domain';
const nullableNumber=(v:unknown)=>v===undefined||v===null||v===''?null:String(v).replace(/\s/g,'').replace(',','.').replace(/[×$]/g,'');
const decimal=z.string().regex(/^\d{1,10}(\.\d{1,4})?$/).nullable();
const rowSchema=z.object({externalReportId:z.string().min(1).max(200),externalItemId:z.string().min(1).max(200),submittedAt:z.string().datetime({offset:true}),week,staticId,firstName:z.string().min(1).max(100),lastName:z.string().min(1).max(100),rank:z.coerce.number().int().min(1).max(100),unit:z.string().min(1).max(100),task:z.string().min(1).max(250),quantity:z.coerce.number().int().positive().max(1000000),pointsRate:z.coerce.number().int().min(0),points:z.coerce.number().int().min(0),rewardRate:decimal,rankMultiplier:decimal,estimatedAmount:decimal,approvedAmount:decimal,cap:decimal,status:itemStatus,description:z.string().max(3000),evidenceUrls:z.array(evidence).min(1).max(100)});
type ImportRow=z.infer<typeof rowSchema>;
const aliases:Record<string,string>={'ЗВП':'ВСП','ВСП — Військова служба правопорядку':'ВСП','ЗСП "Омега"':'ССО "Nord Division"','ЗСП «Омега»':'ССО "Nord Division"','ЗСП Омега':'ССО "Nord Division"','ССО «Nord Division»':'ССО "Nord Division"'};
const statuses:Record<string,string>={'Підтверджено':'approved','Потребує перевірки':'pending','На перевірці':'pending','Потребує уточнення':'clarification','Потрібне уточнення':'clarification','Відхилено':'rejected'};
function parseRow(r:Record<string,unknown>):ImportRow{
  const get=(a:string,b:string)=>r[a]??r[b];const unit=String(get('unit','Підрозділ')||'').trim();
  const links=get('evidenceUrls','Докази');const status=String(get('status','Статус')||'pending');
  return rowSchema.parse({externalReportId:get('externalReportId','№ звіту'),externalItemId:get('externalItemId','№ запису'),submittedAt:get('submittedAt','Подано (UTC)'),week:get('week','Тиждень'),staticId:String(get('staticId','Статичний ID')??''),firstName:get('firstName','Ім’я'),lastName:get('lastName','Прізвище'),rank:get('rank','Ранг'),unit:aliases[unit]||unit,task:get('task','Завдання'),quantity:get('quantity','Кількість'),pointsRate:get('pointsRate','Балів за виконання'),points:get('points','Бали'),rewardRate:nullableNumber(get('rewardRate','Ціна за виконання ($)')),rankMultiplier:nullableNumber(get('rankMultiplier','Множник рангу')),estimatedAmount:nullableNumber(get('estimatedAmount','Невивірена оцінка ($)'))??nullableNumber(get('approvedAmount','Оцінка премії ($)')),approvedAmount:nullableNumber(get('approvedAmount','Оцінка премії ($)')),cap:nullableNumber(get('cap','Тижневий ліміт ($)')),status:statuses[status]||status,description:String(get('description','Опис')||''),evidenceUrls:Array.isArray(links)?links:String(links||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});
}
export async function importReports(input:unknown,u:Viewer){
  const p=z.object({text:z.string().max(2_000_000),format:z.enum(['csv','json']),commit:z.boolean(),digest:z.string().optional()}).parse(input);
  let raw:Record<string,unknown>[];
  try{if(p.format==='json'){const parsed=JSON.parse(p.text);raw=Array.isArray(parsed)?parsed:parsed.rows;}else{const parsed=Papa.parse<Record<string,unknown>>(p.text,{header:true,skipEmptyLines:'greedy',dynamicTyping:false,transformHeader:h=>h.trim()});if(parsed.errors.length)throw new Error();raw=parsed.data;}}catch{throw new HttpError('Не вдалося прочитати файл. Очікується журнал поданих звітів CSV або масив JSON.');}
  if(!Array.isArray(raw)||!raw.length||raw.length>2000)throw new HttpError('Імпортуйте від 1 до 2000 позицій за раз.');
  const conflicts:string[]=[];const rows:ImportRow[]=[];
  raw.forEach((r,i)=>{try{rows.push(parseRow(r));}catch{conflicts.push(`Рядок ${i+2}: некоректні або неповні дані. Потрібен журнал, а не підсумкова таблиця.`);}});
  const digest=hash(JSON.stringify(rows));const unitRows=await query('SELECT id,name FROM units');const taskRows=await query('SELECT id,name,unit_id,normalized_name FROM tasks');
  const reportGroups=new Map<string,string>();const ids=new Set<string>();
  for(const r of rows){const key=JSON.stringify([r.staticId,r.week,r.unit,r.firstName,r.lastName,r.rank,r.submittedAt]);if(reportGroups.has(r.externalReportId)&&reportGroups.get(r.externalReportId)!==key)conflicts.push(`Звіт ${r.externalReportId}: суперечливі дані автора або тижня.`);reportGroups.set(r.externalReportId,key);if(ids.has(r.externalItemId))conflicts.push(`Повторний запис ${r.externalItemId} у файлі.`);ids.add(r.externalItemId);if(!unitRows.some(unit=>unit.name===r.unit))conflicts.push(`Невідомий підрозділ «${r.unit}». Спочатку додайте його в налаштуваннях.`);}
  const unknown=[...new Set(rows.filter(r=>{const unit=unitRows.find(u=>u.name===r.unit);return !taskRows.some(t=>(t.unit_id===unit?.id||t.unit_id===null)&&t.normalized_name===normalizeName(r.task));}).map(r=>r.unit+': '+r.task))];
  const existing=rows.length?await query('SELECT external_id FROM report_items WHERE external_id=ANY($1::text[])',[rows.map(r=>r.externalItemId)]):[];
  const preview={digest,rows:rows.length,reports:reportGroups.size,units:new Set(rows.map(r=>r.unit)).size,tasks:new Set(rows.map(r=>r.unit+'|'+r.task)).size,alreadyImported:existing.length,unknownTasks:unknown,conflicts:conflicts.slice(0,50)};
  if(!p.commit)return preview;
  if(p.digest!==digest||conflicts.length)throw new HttpError('Спочатку перегляньте актуальний файл і усуньте конфлікти.',409);
  return transaction(async c=>{
    await lockAdmin(c,u);await c.query("SELECT pg_advisory_xact_lock(hashtext('history-import'))");
    if((await c.query('SELECT id FROM import_batches WHERE digest=$1',[digest])).rows.length)return {...preview,imported:0};
    let count=0;
    for(const r of rows){
      if((await c.query('SELECT id FROM report_items WHERE external_id=$1',[r.externalItemId])).rows.length)continue;
      const unit=unitRows.find(unit=>unit.name===r.unit)!;
      let task=(await c.query('SELECT id FROM tasks WHERE normalized_name=$1 AND (unit_id=$2 OR unit_id IS NULL)',[normalizeName(r.task),unit.id])).rows;
      if(task.length>1)throw new HttpError(`Неоднозначне завдання «${r.task}».`);
      if(!task.length)task=(await c.query("INSERT INTO tasks(name,normalized_name,unit_id,points,active,time_category) VALUES($1,$2,$3,$4,false,'any') RETURNING id",[r.task,normalizeName(r.task),unit.id,r.pointsRate])).rows;
      let report=(await c.query('SELECT * FROM reports WHERE external_id=$1',[r.externalReportId])).rows[0];
      if(report&&(report.static_id!==r.staticId||report.unit_id!==unit.id||report.week_start!==r.week||report.first_name!==r.firstName||report.last_name!==r.lastName||report.rank!==r.rank))throw new HttpError(`Конфлікт наявного звіту ${r.externalReportId}.`);
      if(!report){report=(await c.query(`INSERT INTO reports(number,external_id,static_id,first_name,last_name,rank,unit_id,unit_name,week_start,submitted_at,idempotency_key,payload_hash,context_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'import') RETURNING *`,['ІМП-'+randomUUID().slice(0,8),r.externalReportId,r.staticId,r.firstName,r.lastName,r.rank,unit.id,r.unit,r.week,r.submittedAt,randomUUID(),hash(r.externalReportId)])).rows[0];}
      await c.query('INSERT INTO weekly_awards(static_id,week_start,cap) VALUES($1,$2,$3) ON CONFLICT(static_id,week_start) DO NOTHING',[r.staticId,r.week,r.cap]);
      const id=randomUUID();await c.query(`INSERT INTO report_items(id,report_id,task_id,external_id,task_name,quantity,points_rate,points,reward_rate,rank_multiplier,estimated_amount,approved_amount,time_category,status,legacy_description)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'any',$13,$14)`,[id,report.id,task[0].id,r.externalItemId,r.task,r.quantity,r.pointsRate,r.points,r.rewardRate,r.rankMultiplier,r.estimatedAmount,r.approvedAmount,r.status,r.description]);
      for(const [order,url] of r.evidenceUrls.entries())await c.query('INSERT INTO evidence_links(item_id,url,sort_order) VALUES($1,$2,$3)',[id,url,order]);count++;
    }
    await c.query('INSERT INTO import_batches(digest,actor_id,row_count) VALUES($1,$2,$3)',[digest,u.id,count]);await audit(c,u,'history.import',digest,null,{rows:count,reports:preview.reports});return {...preview,imported:count};
  });
}
