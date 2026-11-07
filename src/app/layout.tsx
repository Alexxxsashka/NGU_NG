import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {viewer} from '@/lib/auth';
import {Shell} from '@/components/shell';
import '@fontsource/manrope/cyrillic-400.css';
import '@fontsource/manrope/cyrillic-600.css';
import '@fontsource/manrope/cyrillic-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/oswald/cyrillic-600.css';
import '@fontsource/oswald/latin-600.css';
import './globals.css';
export const metadata:Metadata={title:{default:'НГУ — звітний кабінет',template:'%s | НГУ'},description:'Звіти, виконані завдання та статистика ігрової організації НГУ.',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function RootLayout({children}:{children:React.ReactNode}){let user=null;try{user=await viewer(await headers());}catch{/* A disconnected database must not expose private content. */}return <html lang="uk"><body><a className="skip" href="#content">Перейти до вмісту</a><Shell user={user}>{children}</Shell></body></html>;}
