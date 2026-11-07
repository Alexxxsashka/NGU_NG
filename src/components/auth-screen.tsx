'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {api,Field,Notice} from './ui';
export function AuthScreen({mode,passwordChanged}:{passwordChanged:boolean;mode:'login'|'register'|'recover'|'setup'}){
 const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[recovery,setRecovery]=useState('');
 const title={login:'Увійти до кабінету',register:'Створити обліковий запис',recover:'Відновити доступ',setup:'Початкове налаштування'}[mode];
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);setBusy(true);setError('');try{
  if(mode==='setup'||mode==='recover'){const result=await api<{recoveryToken:string}>(mode==='setup'?'bootstrap':'recover',{username:fd.get('username'),password:fd.get('password'),secret:fd.get('secret'),token:fd.get('token')});setRecovery(result.recoveryToken);return;}
  if(mode==='register'){await api('register',{username:fd.get('username'),name:fd.get('name'),staticId:fd.get('staticId'),password:fd.get('password'),website:fd.get('website')});}
  const body={username:fd.get('username'),password:fd.get('password')};
  const response=await fetch('/api/auth/sign-in/username',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok){if(mode==='register'){router.push('/login');return;}throw new Error('Не вдалося увійти. Перевірте логін і пароль або повторіть пізніше.');}
  const {user}=await api<{user:{role:string;mustChangePassword:boolean}|null}>('viewer');router.push(user?.role==='admin'&&!user.mustChangePassword?'/admin':'/me');router.refresh();
 }catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <section id="content" className="auth-panel panel"><ShieldCheck size={36}/><h1>{title}</h1><p className="muted">Для входу потрібні логін і пароль.</p>{passwordChanged&&<Notice>Пароль змінено. Увійдіть із новим паролем.</Notice>}{recovery?<><Notice>Доступ налаштовано. Збережіть одноразовий код відновлення в безпечному місці. Він більше не відображатиметься.</Notice><code className="recovery-code">{recovery}</code><Link className="button" href="/login">Перейти до входу</Link></>:<form onSubmit={submit} className="stack">{mode==='setup'&&<Field label="Секрет початкового налаштування"><input type="password" name="secret" required autoComplete="off"/></Field>}{mode==='recover'?<Field label="Одноразовий код відновлення"><input type="password" name="token" required autoComplete="off"/></Field>:<Field label="Логін"><input name="username" required pattern="[a-zA-Z0-9_]{3,40}" autoComplete="username" placeholder="Латинські літери, цифри, _"/></Field>}{mode==='register'&&<><Field label="Ім’я в кабінеті"><input name="name" required maxLength={100}/></Field><Field label="Static ID"><input name="staticId" required inputMode="numeric" pattern="[0-9]{1,30}"/><small>Адміністратор перевірить, кому належить цей Static ID.</small></Field><input className="honeypot" name="website" tabIndex={-1} aria-hidden="true" autoComplete="off"/></>}<Field label={mode==='recover'?'Новий пароль':'Пароль'}><input type="password" name="password" required minLength={12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'}/>{mode!=='login'&&<small>Щонайменше 12 символів.</small>}</Field>{error&&<Notice error>{error}</Notice>}<button disabled={busy}>{busy?'Зачекайте…':title}</button></form>}<div className="auth-links">{mode!=='login'&&<Link href="/login">Увійти</Link>}{mode==='login'&&<><Link href="/register">Реєстрація</Link><Link href="/recover">Відновлення доступу</Link></>}<Link href="/report">Подати без входу</Link></div></section>;
}
