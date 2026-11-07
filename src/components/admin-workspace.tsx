'use client';
import dynamic from 'next/dynamic';
import {ReportList} from './report-list';
import {Loading} from './ui';
const TaskEditor=dynamic(()=>import('./task-editor').then(m=>m.TaskEditor),{loading:Loading});
const UnitTables=dynamic(()=>import('./unit-tables').then(m=>m.UnitTables),{loading:Loading});
const Periods=dynamic(()=>import('./periods').then(m=>m.Periods),{loading:Loading});
const Settings=dynamic(()=>import('./settings').then(m=>m.Settings),{loading:Loading});
const Personnel=dynamic(()=>import('./personnel').then(m=>m.Personnel),{loading:Loading});
const HistoryImport=dynamic(()=>import('./history-import').then(m=>m.HistoryImport),{loading:Loading});
const Audit=dynamic(()=>import('./audit').then(m=>m.Audit),{loading:Loading});
const titles:Record<string,[string,string]>={overview:['Налаштування щотижневого преміювання','Усі підрозділи та звіти за обраний період.'],reports:['Журнал звітів','Докази, рішення та історія кожного подання.'],tasks:['Завдання і коефіцієнти','Керуйте завданнями, балами й часовими варіантами.'],units:['Підрозділи','Автоматичні таблиці виконань без ручних формул.'],personnel:['Особовий склад','Підтверджені профілі, прив’язування та права доступу.'],periods:['Звітні тижні','Відкривайте та закривайте прийом звітів.'],settings:['Ставки й ліміти премій','Підрозділи, звання та внутрішній облік премій.'],import:['Перенесення історії','Імпорт попередніх звітів зі збереженням ставок.'],audit:['Журнал змін','Хто, коли та що змінив у системі.']};
export function AdminWorkspace({section,unitId}:{section:string;unitId?:string}){const title=titles[section];return <div id="content"><div className="page-heading"><div><h1>{title[0]}</h1><p>{title[1]}</p></div></div>{(section==='overview'||section==='reports')&&<ReportList/>}{section==='tasks'&&<TaskEditor/>}{section==='units'&&<UnitTables unitId={unitId}/>} {section==='periods'&&<Periods/>}{section==='settings'&&<Settings/>}{section==='personnel'&&<Personnel/>}{section==='import'&&<HistoryImport/>}{section==='audit'&&<Audit/>}</div>;}
