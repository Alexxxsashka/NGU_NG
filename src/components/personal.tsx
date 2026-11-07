'use client';
import {LockKeyhole} from 'lucide-react';
import {IllustratedSummary} from './illustrated-summary';
import type {ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {api,Notice,Field} from './ui';
export function PasswordAction(){
 return <details className="account-action profile-action">
  <IllustratedSummary title="Змінити пароль" image="/portal-art/cabinet/security.webp" icon={<LockKeyhole size={18} aria-hidden="true"/>}/>
  <div className="account-action-content"><PasswordForm required={false}/></div>
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
  overview
 }</div>;
}
