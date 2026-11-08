export function defaultRecruitment(name:string){
 const title=name.trim().toLocaleLowerCase('uk');
 if(title.startsWith('ссо'))return 'Спеціальні операції, тактична підтримка та супровід.\nВід рангу 6. Фізична підготовка, навички володіння зброєю та категорія B.';
 if(title.startsWith('нцп'))return 'Вступна підготовка, лекції, тренування й перевірка знань.\nПоріг рангу уточнює керуючий склад. Без активних стягнень. Потрібне письмове погодження Командувача.';
 if(title.startsWith('оаз'))return 'Повітряна розвідка, підтримка, перевезення й підготовка пілотів.\nВід рангу 4. Бажана категорія S або готовність її отримати.';
 if(title.startsWith('злп'))return 'Постачання, ресурсне забезпечення та обслуговування техніки.\nВід рангу 4. Категорії B і C.';
 if(/^(всп|звп)/.test(title))return 'Внутрішній контроль, перевірки та розгляд скарг.\nВід рангу 5, щонайменше 14 днів служби та відсутність активних стягнень.';
 return '';
}

export function recruitmentRequirements(name:string){
 const title=name.trim().toLocaleLowerCase('uk');
 const ncp=title.startsWith('нцп');
 const police=/^(всп|звп)/.test(title);
 return {
  minRank:title.startsWith('ссо')?6:police?5:/^(оаз|злп)/.test(title)?4:null,
  minDays:police?14:0,
  clearDiscipline:ncp||police,
  commanderApproval:ncp,
 };
}
