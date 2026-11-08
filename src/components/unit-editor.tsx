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
 {id:'command',title:'Призначити командира або заступника',description:'Надати або відкликати керування підрозділом.',icon:Shield},
 {id:'archive',title:'Керувати публікаціями',description:'Вибрати й видалити публікацію.',icon:Archive},
] as const;
export function UnitEditor({unitId,info,news,ranks,mode,canAppoint}:{canAppoint:boolean;mode:'content'|'roster';ranks:{id:number;name:string}[];unitId:string;info:Info;news:{id:string;title:string;draft?:boolean;archived?:boolean}[]}){
 const [preview,setPreview]=useState<{title:string;body:string;type:string;until:string}|null>(null);
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
  <h2>{mode==='content'?'Редагування внутрішньої сторінки':'Керування складом'}</h2>
  <p className="muted">{mode==='content'?'Службова інформація та публікації.':'Доступ до підрозділу, звання та посади.'}</p>
  {message&&<Notice>{message}</Notice>}{error&&!selected&&<Notice error>{error}</Notice>}
  <div className="home-card-grid">{actions.filter(action=>action.id==='command'?mode==='roster'&&canAppoint:(action.id==='access'||action.id==='rank')===(mode==='roster')).map(action=><button key={action.id} type="button" aria-haspopup="dialog"
   className="home-route-card home-action-card" disabled={busy} onClick={()=>{setError('');setMessage('');setPreview(null);setSelected(action);}}>
   <CardFace title={action.title} description={action.description} image={'/portal-art/unit-actions/'+(action.id==='command'?'rank':action.id)+'.webp'} icon={<action.icon size={19} aria-hidden="true"/>}/>
  </button>)}</div>
  {selected&&<Modal title={selected.title} onClose={()=>setSelected(null)}>
   {error&&<Notice error>{error}</Notice>}
   {selected.id==='info'&&<form className="stack" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void save({kind:'content',content:Object.fromEntries(data)});}}>
    {infoFields.map(([name,label])=><Field key={name} label={label}><textarea name={name} rows={3} maxLength={name==='contacts'?2000:name==='schedule'?3000:4000} defaultValue={info[name]}/></Field>)}
    <button disabled={busy}>Зберегти інформацію</button>
   </form>}
   {selected.id==='news'&&<form className="stack" onChange={()=>setPreview(null)} onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);
    if((e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='preview'){
     setPreview({title:String(data.get('title')),body:String(data.get('body')),type:String(data.get('type')),until:String(data.get('pinnedUntil')??'')});return;
    }
    void save({kind:'publish',type:data.get('type'),title:data.get('title'),body:data.get('body'),pinnedUntil:data.get('type')==='announcement'?data.get('pinnedUntil')||undefined:undefined,draft:data.has('draft')},form);}}>
    <Field label="Тип"><select name="type"><option value="news">Новина</option><option value="announcement">Оголошення</option></select></Field>
    <Field label="Заголовок"><input name="title" required maxLength={100}/></Field>
    <Field label="Текст"><textarea name="body" required rows={4} maxLength={3000}/></Field>
    <label className="checkbox"><input type="checkbox" name="draft"/>Зберегти як чернетку</label><Field label="Закріпити оголошення до дати включно"><input name="pinnedUntil" type="date"/></Field>
    {preview&&<article className="unit-news-item"><span className="pill prime">{preview.type==='announcement'?'Оголошення':'Новина'}</span>{preview.type==='announcement'&&preview.until&&<span className="pill prime">Закріплено до {preview.until}</span>}<h3>{preview.title}</h3><p className="unit-copy">{preview.body}</p></article>}
    <div className="actions"><button value="preview" className="secondary" disabled={busy}>Попередній перегляд</button><button disabled={busy}>Зберегти</button></div>
   </form>}
   {selected.id==='access'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);void save({kind:'member',staticId:data.get('staticId'),grant:data.get('grant')==='yes'},form);}}>
    <p>Вкажіть Static ID бійця з активним кадровим профілем. Переведення з іншого підрозділу виконує адміністратор.</p>
    <StaticIdField unitId={unitId}/>
    <Field label="Дія"><select name="grant"><option value="yes">Надати доступ</option><option value="no">Відкликати доступ</option></select></Field>
    <button disabled={busy}>Зберегти доступ</button>
   </form>}
   {selected.id==='rank'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);void save({kind:'assignment',staticId:data.get('staticId'),rank:data.get('rank')?Number(data.get('rank')):null,position:data.get('position')},form);}}>
    <StaticIdField unitId={unitId}/>
    <Field label="Звання"><select name="rank"><option value="">Без звання</option>{ranks.filter(rank=>rank.id<11).map(rank=><option key={rank.id} value={rank.id}>{rank.name}</option>)}</select></Field>
    <Field label="Посада"><input name="position" maxLength={100}/></Field>
    <button disabled={busy}>Зберегти призначення</button>
   </form>}
   {selected.id==='command'&&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);if(confirm('Змінити доступ до керування цим підрозділом?'))void save({kind:'command',staticId:data.get('staticId'),role:data.get('role')},form);}}>
    <p>Призначення доступне для бійця 11–12 рангу з цього підрозділу.</p>
    <StaticIdField unitId={unitId}/>
    <Field label="Командні повноваження"><select name="role" required defaultValue=""><option value="">Оберіть дію</option><option value="commander">Командир</option><option value="deputy">Заступник</option><option value="member">Відкликати повноваження</option></select></Field>
    <button disabled={busy}>Зберегти командне призначення</button>
   </form>}
   {selected.id==='archive' &&<form className="stack" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const id=new FormData(form).get('id');const action=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');if(id&&(action==='publish'||confirm('Архівувати вибрану публікацію?')))void save({kind:action==='publish'?'publish-news-draft':'remove-news',id},form);}}>
    <Field label="Публікація"><select name="id" required defaultValue=""><option value="">Оберіть публікацію</option>{news.filter(item=>!item.archived).map(item=><option key={item.id} value={item.id}>{item.title}{item.draft?' · чернетка':''}</option>)}</select></Field>
    <div className="actions"><button value="publish" disabled={busy||!news.some(item=>item.draft&&!item.archived)}>Опублікувати чернетку</button><button value="archive" disabled={busy||!news.some(item=>!item.archived)}>Архівувати</button></div>
   </form>}
  </Modal>}
 </section>;
}
