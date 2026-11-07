import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { username } from 'better-auth/plugins';
import { db, query } from '@/db';
import * as schema from '@/db/schema';
import type { Viewer } from './domain';
let instance:ReturnType<typeof createAuth> | undefined;
function createAuth(){
  if(process.env.VERCEL_ENV==='preview'&&process.env.ALLOW_PREVIEW_WRITES!=='true')throw new Error('Preview authorization requires an isolated database.');
  if(!process.env.AUTH_SECRET || !process.env.APP_URL) throw new Error('Авторизацію ще не налаштовано.');
  return betterAuth({
    appName:'НГУ — звітність',baseURL:process.env.APP_URL,secret:process.env.AUTH_SECRET,
    database:drizzleAdapter(db(),{provider:'pg',schema,transaction:true}),
    emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:12,maxPasswordLength:128,requireEmailVerification:false},
    user:{additionalFields:{role:{type:'string',defaultValue:'member',input:false}}},
    session:{expiresIn:60*60*24*7,updateAge:60*60*24,cookieCache:{enabled:false}},
    rateLimit:{enabled:true,storage:'database',window:60,max:40,customRules:{'/sign-in/username':{window:60,max:8}}},
    advanced:{ipAddress:{ipAddressHeaders:process.env.VERCEL?['x-vercel-forwarded-for']:['x-forwarded-for']}},
    plugins:[username({minUsernameLength:3,maxUsernameLength:40})]
  });
}
export function getAuth(){return instance ??= createAuth();}
export async function viewer(headers:Headers):Promise<Viewer|null>{
  if(!process.env.DATABASE_URL || !process.env.AUTH_SECRET || !process.env.APP_URL)return null;
  const session=await getAuth().api.getSession({headers});
  if(!session)return null;
  return (await query<Viewer>('SELECT id,name,email,username,role,must_change_password AS "mustChangePassword" FROM app_user WHERE id=$1',[session.user.id]))[0]??null;
}
