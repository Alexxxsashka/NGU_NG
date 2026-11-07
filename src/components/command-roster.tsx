import Link from 'next/link';
import {commandRoster} from '@/lib/service-assignment';

export async function CommandRoster({userId}:{userId:string}){
 const roster=await commandRoster(userId);
 return <section id="content" className="panel">
  <h1>Мій підрозділ</h1>
  {roster.length===0?<p>Доступ до списку складу надає адміністратор під час призначення командиром.</p>:<>
   <p>{roster[0].unit_name} · {roster.length} у складі</p>
   <div className="table-wrap"><table>
    <thead><tr><th scope="col">Боєць</th><th scope="col">Static ID</th><th scope="col">Звання</th><th scope="col">Посада</th></tr></thead>
    <tbody>{roster.map(person=><tr key={person.static_id}><td>{person.first_name} {person.last_name}</td><td>{person.static_id}</td><td>{person.rank_name??'Не призначено'}</td><td>{person.position||'Не призначено'}</td></tr>)}</tbody>
   </table></div>
  </>}
  <Link href="/weekly-bonus/me">До особистого кабінету</Link>
 </section>;
}
