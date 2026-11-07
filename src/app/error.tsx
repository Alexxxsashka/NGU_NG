'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section id="content" className="panel"><h1>Не вдалося завантажити сторінку</h1><p>З’єднання з сервісом тимчасово недоступне або початкове налаштування ще не завершене.</p><button onClick={reset}>Спробувати знову</button></section>;}
