import Decimal from 'decimal.js';

export function taskReward(points:number,pointValue:unknown):string|null{
  if(pointValue===null||pointValue===undefined||pointValue==='')return null;
  return new Decimal(String(pointValue)).mul(points).toFixed(2);
}
