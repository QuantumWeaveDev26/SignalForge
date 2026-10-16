import {env} from 'cloudflare:workers';
import {verifiedResponseEvent} from '@/lib/openai-webhook-policy';
import {receiveBackgroundEvent} from '@/lib/background';
import {AppError} from '@/lib/research';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 try{
  if(Number(req.headers.get('content-length')||0)>32768)throw new AppError('Webhook body is too large.',413);
  const raw=await req.text();if(new TextEncoder().encode(raw).length>32768)throw new AppError('Webhook body is too large.',413);
  const event=await verifiedResponseEvent(raw,req.headers,env.OPENAI_WEBHOOK_SECRET);
  // Complete the durable write before acknowledging; unsuccessful deliveries are retried.
  const result=event?await receiveBackgroundEvent(event):{received:true,ignored:true};
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof AppError?error.message:'Background delivery could not finish. Retry later.'},{status:error instanceof AppError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
