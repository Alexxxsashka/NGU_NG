'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {Pencil} from 'lucide-react';
import {IllustratedSummary} from './illustrated-summary';
import {api,Field,Notice} from './ui';

type Details={joinedOn:string|null;callsign:string;bio:string};
export function PersonalServiceForm({details,today}:{details:Details;today:string}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  const data=new FormData(event.currentTarget);
  setBusy(true);setError('');setMessage('');
  try{
   await api('me/service-details',{joinedOn:data.get('joinedOn')||null,callsign:data.get('callsign'),bio:data.get('bio')});
   setMessage('Особисті дані збережено.');router.refresh();
  }catch(error){setError((error as Error).message);}
  finally{setBusy(false);}
 }
 return <details className="account-action profile-action">
  <IllustratedSummary title="Редагувати особисті дані" image="/portal-art/cabinet/profile.webp" icon={<Pencil size={18} aria-hidden="true"/>}/>
  <form className="stack account-action-content" onSubmit={save}>
   <p className="muted">Звання, посаду й підрозділ змінює уповноважене командування.</p>
   <div className="form-grid">
    <Field label="Дата вступу до НГУ"><input type="date" name="joinedOn" defaultValue={details.joinedOn??''} max={today}/></Field>
    <Field label="Позивний"><input name="callsign" defaultValue={details.callsign} maxLength={40}/></Field>
   </div>
   <Field label="Коротко про себе"><textarea name="bio" defaultValue={details.bio} maxLength={500} rows={3}/></Field>
   {error&&<Notice error>{error}</Notice>}{message&&<Notice>{message}</Notice>}
   <button disabled={busy}>{busy?'Зберігаємо…':'Зберегти особисті дані'}</button>
  </form>
 </details>;
}
