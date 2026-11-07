import type {Metadata} from 'next';
import {headers} from 'next/headers';
import {viewer} from '@/lib/auth';
import {Shell} from '@/components/shell';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/roboto-condensed/cyrillic-800.css';
import '@fontsource/roboto-condensed/latin-800.css';
import './globals.css';
export const metadata:Metadata={title:{default:'Портал НГУ',template:'%s | НГУ'},description:'Єдина інформаційна система НГУ в NG GTA 5 RP.',robots:{index:false,follow:false}};
export const dynamic='force-dynamic';
export default async function RootLayout({children}:{children:React.ReactNode}){let user=null;try{user=await viewer(await headers());}catch{/* A disconnected database must not expose private content. */}return <html lang="uk"><body><a className="skip" href="#content">Перейти до вмісту</a><Shell user={user}>{children}</Shell></body></html>;}
