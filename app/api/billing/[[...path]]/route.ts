import {identity} from '@/lib/server';
import {AppError} from '@/lib/research';
import {accountForUser,publicPlans,billingState,createCheckout,verifyCheckout,refreshBilling,cancelSubscription,acceptWebhook} from '@/lib/billing';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request:Request){
 try{
  const action=new URL(request.url).pathname.replace(/^\/api\/billing\/?/,'');
  if(!action&&request.method==='GET')return json(publicPlans());
  if(Number(request.headers.get('content-length')||0)>128000)throw new AppError('Request is too large.',413);
  if(action==='webhook'&&request.method==='POST')return json(await acceptWebhook(await request.text(),request.headers.get('x-razorpay-signature')||'',request.headers.get('x-razorpay-event-id')||''));
  const user=await identity(request,request.method!=='GET');
  if(user.api||user.authSource!=='signalforge'||!('userId' in user)||!user.userId)throw new AppError('Sign in with your SignalForge account to manage billing.',403);
  const account=accountForUser(user.userId);
  if(action==='status'&&request.method==='GET')return json(await billingState(account));
  if(request.method==='POST'){
   if(action==='refresh')return json(await refreshBilling(account));
   if(action==='cancel')return json(await cancelSubscription(account));
   const raw=await request.text();if(raw.length>8000)throw new AppError('Request is too large.',413);
   let value;try{value=JSON.parse(raw);}catch{throw new AppError('Invalid request body.');}
   if(!value||typeof value!=='object'||Array.isArray(value))throw new AppError('Invalid request body.');
   if(action==='checkout')return json(await createCheckout(account,value.plan,value.currency),201);
   if(action==='verify')return json(await verifyCheckout(account,value));
  }
  throw new AppError('Billing action not found.',404);
 }catch(error){return json({error:error instanceof AppError?error.message:'Billing could not be updated. Please refresh or contact support.'},error instanceof AppError?error.status:500);}
}
export {handle as GET,handle as POST};
