import { z } from 'zod';
import { MAX_REPORT_BYTES } from '@/lib/report-limits';
import { query,transaction } from '@/db';
import { viewer } from '@/lib/auth';
import { admin,member,failure,sameOrigin,writable,readBody,HttpError } from '@/lib/security';
import { getCatalog } from '@/lib/catalog';
import { taskReward } from '@/lib/rewards';
import { currentWeek } from '@/lib/domain';
import { week,staticId } from '@/lib/validation';
import {notifications,markNotifications} from '@/lib/notifications';
import {changePersonnelWorkflow,personnelWorkflow} from '@/lib/personnel-workflow';
import {clarifyReport} from '@/lib/report-clarification';
import { filters,listReports,submitReport } from '@/lib/reports';
import { saveTask,changePeriod,reviewItems,deleteReportItem,adjustAward,saveSettings,savePerson,reviewClaim,linkReport,changeRole,issueRecovery } from '@/lib/admin';
import {changeServiceWorkspace,serviceWorkspace} from '@/lib/service-workspace';
import {serviceModules} from '@/lib/portal-navigation';
import {finalizeAwards,recalculateAwardWeek} from '@/lib/finalize-awards';
import {awardOrders,awardPreview,correctAwardOrder} from '@/lib/award-register';
import {awardOrderDocx,type AwardOrder} from '@/lib/award-order-docx';
import { updateUnitPage } from '@/lib/unit-page';
import { assignService,savePersonalServiceDetails } from '@/lib/service-assignment';
import { unitMatrix } from '@/lib/matrix';
import { bootstrap,recover } from '@/lib/accounts';
import { register,editAccount,deleteAccount,issueTemporaryPassword,changePassword,lockStaticClaims,reserveStatic } from '@/lib/player-accounts';
import { importReports } from '@/lib/importer';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
const json=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:Request,ctx:Context){try{
  const path=(await ctx.params).path.join('/'),url=new URL(request.url);
  if(path.startsWith('service/'))return json(await serviceWorkspace(await member(request),z.enum(serviceModules).parse(path.slice(8)),z.uuid().nullable().parse(url.searchParams.get('entry'))));
  if(path==='catalog')return json(await getCatalog(week.parse(url.searchParams.get('week')||currentWeek())));
  if(path==='viewer')return json({user:await viewer(request.headers),configured:!!process.env.DATABASE_URL&&!!process.env.AUTH_SECRET&&!!process.env.APP_URL});
  if(path==='personnel-workflow')return json(await personnelWorkflow(await member(request)));
  if(path==='me/notifications')return json(await notifications((await member(request)).id));
  if(path==='me'){const u=await member(request);return json(await listReports(filters(url),u,true));}
  if(path==='me/claims'){const u=await member(request);return json(await query('SELECT id,static_id,status,reason,created_at FROM profile_claims WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[u.id]));}
  const u=await admin(request);
  if(path==='admin/award-preview')return json(await awardPreview(week.parse(url.searchParams.get('week'))));
  if(path==='admin/award-orders')return json(await awardOrders());
  if(path==='admin/award-orders/docx'){
   const [order]=await query<{value:AwardOrder}>('SELECT value FROM settings WHERE key=$1',['award-order:'+week.parse(url.searchParams.get('week'))]);
   if(!order)throw new HttpError('Наказ не знайдено.',404);
   return orderResponse(order.value);
  }
  if(path==='admin/reports')return json(await listReports(filters(url),u));
  if(path==='admin/matrix'){const f=filters(url);if(!f.unit)throw new HttpError('Оберіть підрозділ.');return json(await unitMatrix(f));}
  if(path==='admin/catalog'){const [tasks,units,ranks,settings]=await Promise.all([query('SELECT * FROM tasks ORDER BY sort_order,name'),query('SELECT * FROM units ORDER BY sort_order,name'),query('SELECT * FROM ranks ORDER BY id'),query('SELECT * FROM settings')]);const pointValue=settings.find(s=>s.key==='pointValue')?.value??null;return json({tasks:tasks.map(t=>({...t,reward:taskReward(t.points,pointValue)})),units,ranks,settings});}
  if(path==='admin/periods')return json(await query("SELECT p.*,(s.key IS NOT NULL) AS paid FROM reporting_periods p LEFT JOIN settings s ON s.key='award-order:'||p.week_start::text ORDER BY p.week_start DESC LIMIT 104"));
  if(path==='admin/personnel'){const [people,claims,users]=await Promise.all([query('SELECT p.*,u.name unit_name FROM personnel p LEFT JOIN units u ON u.id=p.unit_id ORDER BY p.rank DESC,p.last_name LIMIT 1000'),query('SELECT c.*,u.name FROM profile_claims c JOIN app_user u ON u.id=c.user_id ORDER BY c.created_at DESC LIMIT 100'),query(`SELECT u.id,u.name,u.role,p.first_name,p.last_name,p.unit_id,p.rank,p.active,n.name unit_name,k.name rank_name,d.value details,coalesce(substring(u.username from '^static_([0-9]+)$'),p.static_id,c.static_id) static_id,(p.id IS NOT NULL) linked FROM app_user u LEFT JOIN personnel p ON p.user_id=u.id LEFT JOIN units n ON n.id=p.unit_id LEFT JOIN ranks k ON k.id=p.rank LEFT JOIN settings d ON d.key='service:'||p.id::text LEFT JOIN LATERAL (SELECT static_id FROM profile_claims WHERE user_id=u.id AND status='pending' ORDER BY created_at DESC LIMIT 1) c ON true ORDER BY u.created_at DESC LIMIT 1000`)]);return json({people,claims,users});}
  if(path==='admin/audit'){const page=Math.max(1,Math.min(10000,Math.floor(Number(url.searchParams.get('page')))||1));return json(await query('SELECT a.*,u.name actor FROM audit_logs a LEFT JOIN app_user u ON u.id=a.actor_id ORDER BY created_at DESC LIMIT 50 OFFSET $1',[(page-1)*50]));}
  throw new HttpError('Сторінку не знайдено.',404);
}catch(e){return failure(e);}}
export async function POST(request:Request,ctx:Context){try{
  sameOrigin(request);writable();const path=(await ctx.params).path.join('/');
  const input=await readBody(request,path==='admin/import'?2_500_000:(path==='reports'||path==='me/reports/clarify')?MAX_REPORT_BYTES:100_000);
  if(path==='personnel-workflow')return json(await changePersonnelWorkflow(input,await member(request)));
  if(path==='service')return json(await changeServiceWorkspace(await member(request),input));
  if(path==='me/notifications')return json(await markNotifications((await member(request)).id,input));
  if(path==='me/reports/clarify')return json(await clarifyReport(input,await member(request)));
  if(path==='reports')return json(await submitReport(request,input));
  if(path==='register')return json(await register(request,input));
  if(path==='me/service-details')return json(await savePersonalServiceDetails(input,await member(request)));
  if(path==='me/password'){const u=await viewer(request.headers);if(!u)throw new HttpError('Увійдіть у свій обліковий запис.',401);return json(await changePassword(request,input,u));}
  if(path==='bootstrap')return json(await bootstrap(request,input));
  if(path==='recover')return json(await recover(request,input));
  if(path==='me/claims'){const u=await member(request);const p=z.object({staticId}).parse(input);return json(await transaction(async c=>{await lockStaticClaims(c);if((await c.query("SELECT id FROM profile_claims WHERE user_id=$1 AND status='pending'",[u.id])).rows.length)throw new HttpError('У вас уже є заявка на перевірці.');if((await c.query('SELECT id FROM personnel WHERE user_id=$1',[u.id])).rows.length)throw new HttpError('Ваш профіль уже прив’язаний.');await reserveStatic(c,p.staticId,u.id);return {saved:true};}));}
  if(path.startsWith('units/')&&path.split('/').length===2)return json(await updateUnitPage(path.split('/')[1],input,await member(request)));
  const u=await admin(request);
  if(path==='admin/award-orders/correction')return json(await correctAwardOrder(input,u));
  if(path==='admin/periods/recalculate')return json(await recalculateAwardWeek(input,u));
  if(path==='admin/periods/pay'){
    const order=await finalizeAwards(input,u);
    return orderResponse(order);
  }
  const actions:Record<string,(input:unknown)=>Promise<unknown>>={
    'admin/tasks':i=>saveTask(i,u),'admin/periods':i=>changePeriod(i,u),'admin/review':i=>reviewItems(i,u),'admin/reports/delete-item':i=>deleteReportItem(i,u),'admin/award':i=>adjustAward(i,u),
    'admin/settings':i=>saveSettings(i,u),'admin/personnel':i=>savePerson(i,u),'admin/personnel/assign':i=>assignService(i,u),'admin/claims':i=>reviewClaim(i,u),'admin/link-report':i=>linkReport(i,u),
    'admin/roles':i=>changeRole(i,u),'admin/accounts/edit':i=>editAccount(i,u),'admin/accounts/delete':i=>deleteAccount(i,u),'admin/accounts/password':i=>issueTemporaryPassword(i,u),'admin/recovery':i=>issueRecovery(i,u),'admin/import':i=>importReports(i,u)
  };
  if(!actions[path])throw new HttpError('Операцію не знайдено.',404);
  return json(await actions[path](input));
}catch(e){return failure(e);}}

async function orderResponse(order:AwardOrder){
 const document=await awardOrderDocx(order);
 return new Response(new Uint8Array(document),{headers:{'Cache-Control':'private, no-store','Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':'attachment; filename="ngu-awards-'+order.week+'.docx"'}});
}
