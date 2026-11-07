export const timeLabels:Record<string,string>={any:'Без часової прив’язки',day:'Денне',night:'Нічне',prime:'Прайм-тайм'};
export const statusLabels:Record<string,string>={pending:'На перевірці',approved:'Підтверджено',rejected:'Відхилено',clarification:'Потрібне уточнення',partial:'Частково підтверджено'};
export function shiftDate(day:string,n:number){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
export function monday(day:string){return shiftDate(day,-((new Date(day+'T12:00:00Z').getUTCDay()+6)%7));}
export function currentWeek(){return monday(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv'}).format(new Date()));}
export function dateLabel(day:string){return new Date(day+'T12:00:00Z').toLocaleDateString('uk-UA',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Kyiv'});}
export function normalizeName(name:string){return name.trim().replace(/\s+/g,' ').toLocaleLowerCase('uk-UA');}
export function reportStatus(statuses:string[]){const values=new Set(statuses);return values.size===1?statuses[0]:'partial';}
export type PublicTask={id:string;name:string;unitId:string|null;points:number;version:number;timeCategory:string;startsAt:string|null;endsAt:string|null};
export type Catalog={tasks:PublicTask[];units:{id:string;name:string}[];ranks:{id:number;name:string}[];week:string;open:boolean};
export type Viewer={id:string;name:string;email:string;username:string|null;role:string;mustChangePassword:boolean};
