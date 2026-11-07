'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {ReportList,type ReportsData} from './report-list';
import {useResource,api,Notice,Field,Loading} from './ui';
function PasswordForm({required}:{required:boolean}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  const data=new FormData(e.currentTarget);
  if(data.get('password')!==data.get('confirmation')){setError('Нові паролі не збігаються.');return;}
  setBusy(true);setError('');
  try{
   await api('me/password',{currentPassword:data.get('current'),password:data.get('password')});
   router.replace('/login?password=changed');router.refresh();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel narrow"><h2>Зміна пароля</h2>
  {required&&<Notice>Ви увійшли з тимчасовим паролем. Установіть новий пароль, щоб відкрити кабінет.</Notice>}
  <form className="stack" onSubmit={submit}>
   <Field label={required?'Тимчасовий пароль':'Поточний пароль'}><input type="password" name="current" autoComplete="current-password" required maxLength={128}/></Field>
   <Field label="Новий пароль"><input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128}/><small>Щонайменше 12 символів.</small></Field>
   <Field label="Повторіть новий пароль"><input type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={128}/></Field>
   {error&&<Notice error>{error}</Notice>}
   <button disabled={busy}>{busy?'Зберігаємо…':'Змінити пароль і ввійти знову'}</button>
  </form>
 </section>;
}
export function Personal({mustChangePassword}:{mustChangePassword:boolean}){
 return <div id="content">{mustChangePassword?<PasswordForm required/>:<><PersonalReports/><PasswordForm required={false}/></>}</div>;
}
function PersonalReports(){const resource=useResource<ReportsData>('me'),claims=useResource<{id:string;static_id:string;status:string;reason:string}[]>('me/claims');const [error,setError]=useState(''),[busy,setBusy]=useState(false);
async function claim(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{await api('me/claims',{staticId:new FormData(e.currentTarget).get('staticId')});await claims.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
return <div><div className="page-heading"><div><h1>Особистий кабінет</h1><p>Ваші звіти, виконання й підтверджені бали.</p></div></div>{resource.error?<Notice error>{resource.error}</Notice>:resource.loading?<Loading/>:resource.data?.profile?<><Notice>Профіль: {resource.data.profile.lastName} {resource.data.profile.firstName} · ID {resource.data.profile.staticId}</Notice><ReportList personal/></>:<section className="panel narrow"><h2>Підтвердіть свій Static ID</h2><p>Адміністратор зв’яже обліковий запис із вашим кадровим профілем. До підтвердження історія недоступна.</p>{!claims.data?.some(c=>c.status==='pending')&&<form className="stack" onSubmit={claim}><Field label="Ваш Static ID"><input name="staticId" required pattern="[0-9]{1,30}"/></Field><button disabled={busy||claims.data?.some(c=>c.status==='pending')}>{busy?'Надсилаємо…':'Надіслати заявку'}</button></form>}{error&&<Notice error>{error}</Notice>}{claims.data?.map(c=><p key={c.id}>ID {c.static_id}: {c.status==='pending'?'На перевірці':c.status==='approved'?'Підтверджено':'Відхилено'} {c.reason}</p>)}</section>}</div>;}
