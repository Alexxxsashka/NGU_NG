import {AlignmentType,Document,Packer,Paragraph,Table,TableCell,TableRow,TextRun,WidthType} from 'docx';
import {dateLabel,shiftDate} from './domain';

export type AwardOrder={
 number:string;
 week:string;
 paidAt:string;
 total:string;
 recipients:{staticId:string;name:string;amount:string}[];
};

function money(amount:string){
 const [whole,fraction='00']=amount.split('.');
 return whole.replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0')+','+fraction.padEnd(2,'0')+' $';
}
function cell(text:string,alignment:typeof AlignmentType[keyof typeof AlignmentType],bold=false){
 return new TableCell({children:[new Paragraph({alignment,children:[new TextRun({text,bold})]})]});
}
export async function awardOrderDocx(order:AwardOrder){
 const header=new TableRow({tableHeader:true,cantSplit:true,children:[
  cell('№',AlignmentType.CENTER,true),cell('Військовослужбовець',AlignmentType.LEFT,true),
  cell('Static ID',AlignmentType.CENTER,true),cell('Премія',AlignmentType.RIGHT,true),
 ]});
 const rows=order.recipients.map((recipient,index)=>new TableRow({cantSplit:true,children:[
  cell(String(index+1),AlignmentType.CENTER),cell(recipient.name,AlignmentType.LEFT),
  cell(recipient.staticId,AlignmentType.CENTER),cell(money(recipient.amount),AlignmentType.RIGHT),
 ]}));
 const date=new Intl.DateTimeFormat('uk-UA',{dateStyle:'long',timeZone:'Europe/Kyiv'}).format(new Date(order.paidAt));
 const document=new Document({
  title:'Наказ про щотижневе преміювання',
  styles:{default:{document:{run:{font:'Arial',size:22},paragraph:{spacing:{after:100}}}}},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1040,right:1040,bottom:1040,left:1040}}},children:[
   new Paragraph({alignment:AlignmentType.CENTER,text:'Національна гвардія України · NG GTA 5 RP'}),
   new Paragraph({style:'Title',alignment:AlignmentType.CENTER,text:'Наказ про щотижневе преміювання'}),
   new Paragraph({alignment:AlignmentType.CENTER,text:'№ '+order.number+' · '+date}),
   new Paragraph({text:'Звітний період з '+dateLabel(order.week)+' до '+dateLabel(shiftDate(order.week,6))+' включно.'}),
   new Paragraph({text:'Преміювати військовослужбовців за погодженими результатами виконання завдань у звітному періоді.'}),
   new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[650,4900,1650,2600],margins:{top:90,bottom:90,left:110,right:110},rows:[header,...rows]}),
   new Paragraph({spacing:{before:180,after:120},children:[new TextRun({text:'Усього до виплати '+money(order.total),bold:true})]}),
   new Paragraph({text:'Підпис уповноваженої особи ____________________'}),
  ]}],
 });
 return Packer.toBuffer(document);
}
