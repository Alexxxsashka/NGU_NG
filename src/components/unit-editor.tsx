'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import {Archive,ClipboardList,KeyRound,Megaphone,Shield} from 'lucide-react';
import {StaticIdField} from './static-id-field';
import {CardFace} from './card-link';
import {api,Field,Modal,Notice} from './ui';

const infoFields=[['overview','Про підрозділ'],['schedule','Розклад і заходи'],['rules','Правила та матеріали'],['contacts','Контакти командування']] as const;
type Info=Record<(typeof infoFields)[number][0],string>;
const actions=[
 {id:'info',title:'Додати або змінити інформацію',description:'Опис, розклад, правила й контакти.',icon:ClipboardList},
 {id:'news',title:'Додати новину або оголошення',description:'Опублікувати повідомлення для підрозділу.',icon:Megaphone},
 {id:'access',title:'Надати або відкликати доступ бійця',description:'Керувати доступом за Static ID.',icon:KeyRound},
 {id:'rank',title:'Змінити звання й посаду бійця',description:'Оновити кадрові дані за Static ID.',icon:Shield},
 {id:'archive',title:'Керувати публікаціями',description:'Вибрати й видалити публікацію.',icon:Archive},
] as const;
export function UnitEditor({unitId,info,news,ranks}:{ranks:{id:number;name:string}[];unitId:string;info:Info;news:{id:string;title:string}[]}){
 const [selected,setSelected]=useState<(typeof actions)[number]|null>(null);
 const router=useRouter();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function save(body:unknown,form?:HTMLFormElement){
  setBusy(true);setError('');setMessage('');
  try{await api('units/'+unitId,body);form?.reset();setSelected(null);setMessage('Зміни збережено.');router.refresh();}
  catch(e){setError((e as Error).message);}
  finally{setBusy(false);}
 }
 return <section className="panel" id="unit-management">
  <h2>Керування внутрішньою сторінкою</h2>
  <p className="muted">Службова інформація, публікації й особовий склад.</p>
  {message&&<Notice>{message}</Notice>}{error&&!selected&&<Notice error>{error}</Notice>}
  <div className="home-card-grid">{actions.map(action=><button key={action.id} type="button" aria-haspopup="dialog"
   className="home-route-card home-action-card" disabled={busy} onClick={()=>{setError('');setMessage('');setSelected(action);}}>
   <CardFace title={action.title} description={action.description} image={'/portal-art/unit-actions/'+action.id+'.webp'} icon={<action.icon size={19} aria-hidden="true"/>}/>
  </button>)}</div>
  {selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}>
   {error&&<Notice error>{error}</Notice>}
   {selected.id==='info'&&<form className="stack" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void save({kind:'content',content:Object.fromEntries(data)});}}>
    {infoFields.map(([name,label])=><Field key={name} label={label}><textarea name={name} rows={3} maxLength={name==='contacts'?2000:name==='schedule'?3000:4000} defaultValue={info[name]}/></Field>)}
    <button disabled={busy}>Зберегти інформацію</button>
   </form>}
   {selected.id==='news'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;void save({kind:'publish',...Object.fromEntries(new FormData(form))},form);}}>
    <Field label="Тип"><select name="type"><option value="news">Новина</option><option value="announcement">Оголошення</option></select></Field>
    <Field label="Заголовок"><input name="title" required maxLength={100}/></Field>
    <Field label="Текст"><textarea name="body" required rows={4} maxLength={3000}/></Field>
    <button disabled={busy}>Опублікувати</button>
   </form>}
   {selected.id==='access'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);void save({kind:'member',staticId:data.get('staticId'),grant:data.get('grant')==='yes'},form);}}>
    <p>Вкажіть Static ID бійця з активним кадровим профілем. Переведення з іншого підрозділу виконує адміністратор.</p>
    <StaticIdField unitId={unitId}/>
    <Field label="Дія"><select name="grant"><option value="yes">Надати доступ</option><option value="no">Відкликати доступ</option></select></Field>
    <button disabled={busy}>Зберегти доступ</button>
   </form>}
   {selected.id==='rank'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);void save({kind:'assignment',staticId:data.get('staticId'),rank:data.get('rank')?Number(data.get('rank')):null,position:data.get('position')},form);}}>
    <StaticIdField unitId={unitId}/>
    <Field label="Звання"><select name="rank"><option value="">Без звання</option>{ranks.map(rank=><option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>
    <Field label="Посада"><input name="position" maxLength={100}/></Field>
    <button disabled={busy}>Зберегти призначення</button>
   </form>}
   {selected.id==='archive'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const id=new FormData(form).get('id');if(id&&confirm('Видалити вибрану публікацію?'))void save({kind:'remove-news',id},form);}}>
    <Field label="Публікація"><select name="id" required defaultValue=""><option value="">Оберіть публікацію</option>{news.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
    <button disabled={busy||news.length===0}>Видалити вибрану публікацію</button>
   </form>}
  </Modal>}
 </section>;
}
