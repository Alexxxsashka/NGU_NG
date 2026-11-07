import 'server-only';
import { unstable_cache } from 'next/cache';
import { db,query } from '@/db';
import { tasks,units,ranks } from '@/db/schema';
import { and,eq,asc } from 'drizzle-orm';
import type { Catalog } from './domain';
const cached=unstable_cache(async()=>{
  const d=db();const [taskRows,unitRows,rankRows]=await Promise.all([
    d.select({id:tasks.id,name:tasks.name,unitId:tasks.unitId,points:tasks.points,version:tasks.version,timeCategory:tasks.timeCategory,startsAt:tasks.startsAt,endsAt:tasks.endsAt}).from(tasks).where(eq(tasks.active,true)).orderBy(asc(tasks.sortOrder),asc(tasks.name)),
    d.select({id:units.id,name:units.name}).from(units).where(eq(units.active,true)).orderBy(asc(units.sortOrder)),
    d.select({id:ranks.id,name:ranks.name}).from(ranks).orderBy(asc(ranks.id))
  ]);return {tasks:taskRows,units:unitRows,ranks:rankRows};
},['public-catalog'],{tags:['catalog'],revalidate:60});
export async function getCatalog(week:string):Promise<Catalog>{const [catalog,period]=await Promise.all([cached(),query('SELECT open FROM reporting_periods WHERE week_start=$1',[week])]);return {...catalog,week,open:period[0]?.open===true};}
