import Image from 'next/image';
import Link from 'next/link';
import {CalendarDays, ClipboardList, ShieldCheck} from 'lucide-react';

export default function Home(){
 return <div id="content">
  <section className="hero">
   <div className="formation-photo">
    <Image src="/ngu-formation.png" alt="Бійці НГУ на вечірньому шикуванні у Форт-Занкудо" width={1672} height={941} preload/>
   </div>
   <div className="hero-copy">
    <span className="hero-tag">Форт-Занкудо / NG GTA 5 RP</span>
    <h1>Звітний кабінет<br/>Національної гвардії</h1>
    <p>Фіксуйте виконані завдання, додавайте докази та переглядайте підтверджені бали за тиждень.</p>
    <div className="actions">
     <Link className="button gold" href="/report">Подати звіт</Link>
     <Link className="hero-link" href="/me">Особистий кабінет</Link>
    </div>
   </div>
  </section>
  <section className="intro-grid" aria-label="Як працює звітність">
   <article><ClipboardList/><h2>Тижневий звіт</h2><p>Оберіть виконані завдання, вкажіть кількість і додайте посилання на докази.</p></article>
   <article><ShieldCheck/><h2>Перевірка доказів</h2><p>Переглядайте статус подань та підтверджені бали в особистому кабінеті.</p></article>
   <article><CalendarDays/><h2>Завдання підрозділу</h2><p>Звітуйте про загальні й спеціалізовані завдання своєї зміни.</p></article>
  </section>
 </div>;
}
