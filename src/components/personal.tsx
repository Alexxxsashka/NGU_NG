'use client';
import Image from 'next/image';
import {ChevronDown} from 'lucide-react';
import type {ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {IllustratedSummary} from './illustrated-summary';
import {ReportList,type ReportsData} from './report-list';
import {useResource,api,Notice,Field,Loading} from './ui';
function AccountAction({title, image, children}:{title:string;image:string;children:ReactNode}){
 return <details className="account-action narrow">
  <summary>
   <Image src={image} alt="" fill sizes="(max-width: 700px) 100vw, 620px"/>
   <span>{title}</span>
   <ChevronDown size={22} aria-hidden="true"/>
  </summary>
  <div className="account-action-content">{children}</div>
 </details>;
}

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
 return <form className="stack" onSubmit={submit}>
   <Field label={required?'Тимчасовий пароль':'Поточний пароль'}><input type="password" name="current" autoComplete="current-password" required maxLength={128}/></Field>
   <Field label="Новий пароль"><input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128}/><small>Щонайменше 12 символів.</small></Field>
   <Field label="Повторіть новий пароль"><input type="password" name="confirmation" autoComplete="new-password" required minLength={12} maxLength={128}/></Field>
   {error&&<Notice error>{error}</Notice>}
   <button disabled={busy}>{busy?'Зберігаємо…':'Змінити пароль і ввійти знову'}</button>
  </form>;
}
export function Personal({mustChangePassword,overview}:{mustChangePassword:boolean;overview:ReactNode}){
 return <div id="content">{mustChangePassword?
  <section className="panel narrow">
   <h1>Зміна пароля</h1>
   <Notice>Ви увійшли з тимчасовим паролем. Установіть новий пароль, щоб відкрити кабінет.</Notice>
   <PasswordForm required/>
  </section>:
  <>{overview}<PersonalReports/><AccountAction title="Змінити пароль" image="/account-password.png"><PasswordForm required={false}/></AccountAction></>
 }</div>;
}
function PersonalReports(){const resource=useResource<ReportsData>('me'),claims=useResource<{id:string;static_id:string;status:string;reason:string}[]>('me/claims');const [error,setError]=useState(''),[busy,setBusy]=useState(false);
async function claim(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{await api('me/claims',{staticId:new FormData(e.currentTarget).get('staticId')});await claims.refresh();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
return <div>{resource.error?<Notice error>{resource.error}</Notice>:resource.loading?<Loading/>:resource.data?.profile?<details className="account-action profile-action service-reports" id="service-reports"><IllustratedSummary title="Журнал звітів" image="/portal-art/catalog/report-journal.webp"/><div className="account-action-content"><ReportList personal/></div></details>:<>
 <AccountAction title="Підтвердити Static ID" image="/account-static.png">
  <p>Адміністратор зв’яже обліковий запис із вашим кадровим профілем. До підтвердження історія недоступна.</p>
  {claims.error?<Notice error>{claims.error}</Notice>:claims.loading&&!claims.data?<Loading/>:
   claims.data?.some(c=>c.status==='pending')?<Notice>Ваша заявка вже на перевірці.</Notice>:
   <form className="stack" onSubmit={claim}>
    <Field label="Ваш Static ID"><input name="staticId" required inputMode="numeric" pattern="[0-9]{1,30}"/></Field>
    <button disabled={busy}>{busy?'Надсилаємо…':'Надіслати заявку'}</button>
   </form>}
  {error&&<Notice error>{error}</Notice>}
 </AccountAction>
 {claims.data?.map(c=><p key={c.id} className="narrow">ID {c.static_id}: {c.status==='pending'?'На перевірці':c.status==='approved'?'Підтверджено':'Відхилено'} {c.reason}</p>)}
 </>}</div>;}
