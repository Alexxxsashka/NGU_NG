import 'server-only';
import {z} from 'zod';
import {accessibleUnits} from './unit-page';
import {HttpError} from './security';

export async function workspaceUnits(userId:string,unitId:string|null){
 if(!unitId)return [];
 const [unit]=await accessibleUnits(userId,z.uuid().parse(unitId));
 if(!unit?.editor)throw new HttpError('Керування цим підрозділом недоступне.',403);
 return [unit];
}
