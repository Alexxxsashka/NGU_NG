import { z } from 'zod';
import { MAX_TASK_EVIDENCE } from './report-limits';
export const week=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Виберіть тиждень.').refine(v=>{const d=new Date(v+'T12:00:00Z');return !Number.isNaN(+d)&&d.getUTCDay()===1&&d.toISOString().slice(0,10)===v;},'Тиждень має починатися в понеділок.');
export const personText=z.string().trim().min(1,'Заповніть ім’я та прізвище.').max(100);
export const staticId=z.string().trim().regex(/^[0-9]{1,30}$/,'Static ID повинен містити від 1 до 30 цифр.');
export const evidence=z.string().trim().max(2048,'Посилання має містити не більше 2048 символів.').url('Некоректне посилання.').refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Додайте HTTPS-посилання без логіна й пароля.');
export const amount=z.union([z.string().regex(/^\d{1,10}(\.\d{1,2})?$/),z.null()]);
export const timeCategory=z.enum(['any','day','night','prime']);
export const itemStatus=z.enum(['pending','approved','rejected','clarification']);
export const submitSchema=z.object({week,staticId,firstName:personText,lastName:personText,rank:z.number().int().min(1).max(100),unitId:z.string().uuid(),idempotencyKey:z.string().uuid(),contextToken:z.string().min(32).max(100),website:z.string().max(0,'Подання відхилено.').default(''),entries:z.array(z.object({taskId:z.string().uuid(),version:z.number().int().positive(),quantity:z.number().int().min(1).max(10000),evidenceUrls:z.array(evidence).min(1,'Додайте докази.').max(MAX_TASK_EVIDENCE,'До '+MAX_TASK_EVIDENCE+' посилань на одне завдання.')})).min(1).max(50)});
export const taskSchema=z.object({id:z.string().uuid().optional(),name:z.string().trim().min(3).max(250),unitId:z.string().uuid().nullable(),points:z.number().int().min(0).max(100000),active:z.boolean(),sortOrder:z.number().int().min(0).max(100000),version:z.number().int().positive().optional(),timeCategory,startsAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),endsAt:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),variantOf:z.string().uuid().optional()}).refine(v=>(v.startsAt===null)===(v.endsAt===null)&&(!v.startsAt||v.startsAt!==v.endsAt),'Задайте обидві різні межі часу або залиште їх порожніми.');

export const canonicalStaticId = staticId.transform(value => value.replace(/^0+(?=\d)/, ""));
export const staticAccountKey = (id: string) => "static_" + id.replace(/^0+(?=\d)/, "");
