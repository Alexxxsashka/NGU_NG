import { getAuth } from '@/lib/auth';
import { failure,writable } from '@/lib/security';
export const runtime='nodejs';
export async function GET(request:Request){try{return await getAuth().handler(request);}catch(e){return failure(e);}}
export async function POST(request:Request){try{writable();return await getAuth().handler(request);}catch(e){return failure(e);}}
