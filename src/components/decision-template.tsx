'use client';
import {Field} from './ui';

const templates=[
 'Підтверджено за результатами перевірки.',
 'Додайте доказ виконання та уточніть обставини.',
 'Наданих доказів недостатньо для підтвердження.',
];
export function DecisionTemplate({field}:{field:string}){
 return <Field label="Шаблон відповіді"><select defaultValue="" onChange={event=>{
  const target=event.currentTarget.form?.elements.namedItem(field);
  if(event.currentTarget.value&&target instanceof HTMLTextAreaElement)target.value=event.currentTarget.value;
  event.currentTarget.value='';
 }}>
  <option value="">Оберіть шаблон або напишіть відповідь</option>
  {templates.map(template=><option key={template}>{template}</option>)}
 </select></Field>;
}

export function wantsNext(event:Event){
 return (event as SubmitEvent).submitter?.getAttribute('data-next')==='true';
}
