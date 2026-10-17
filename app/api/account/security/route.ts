import {env} from 'cloudflare:workers';
import {accountAuth} from '@/lib/application-auth';
import {requireAuthOrigin} from '@/lib/auth-policy';
import {accountDevices,revokeDevice} from '@/lib/account-security';
import {AppError,bounded} from '@/lib/research';
export const dynamic='force-dynamic';
async function handle(req:Request){try{const auth=accountAuth();if(req.method==='GET')return Response.json(await accountDevices(auth,req.headers),{headers:{'Cache-Control':'no-store'}});requireAuthOrigin(req,env);const raw=await req.text();if(raw.length>256)throw new AppError('Request too large.',413);let value;try{value=JSON.parse(raw);}catch{throw new AppError('Invalid request.');}return Response.json(await revokeDevice(auth,req.headers,bounded(value.sessionId,'Session',100,true)),{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof AppError?e.message:'Session action failed. Retry after signing in again.'},{status:e instanceof AppError?e.status:400});}}
export const GET=handle;export const POST=handle;
