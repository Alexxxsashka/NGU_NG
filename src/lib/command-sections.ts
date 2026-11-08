export const commandSections=[
 ['queue','Єдина черга','cabinet/requests'],
 ['overview','Огляд підрозділу','home/command'],
 ['content','Редактор сторінки','unit-actions/info'],
 ['roster','Керування складом','unit-actions/access'],
 ['requests','Черга заявок','cabinet/requests'],
 ['review','Перевірка звітів на підвищення','unit-actions/rank'],
 ['promotion-decisions','Рішення щодо нового звання','unit-actions/rank'],
 ['catalog','Каталог завдань підвищення','cabinet/training'],
 ['audit','Кадровий аудит','unit-actions/archive'],
 ['calendar','Події й відвідування','cabinet/calendar'],
 ['training','Керування КМБ','home/training'],
 ['documents','Редактор документів','cabinet/documents'],
] as const;
export type CommandSection=(typeof commandSections)[number][0];

export function workspaceForPath(path:string){
 if(path==='/command'||path.startsWith('/command/'))return 'command';
 if(path==='/admin'||path.startsWith('/admin/'))return 'admin';
 return 'personal';
}
