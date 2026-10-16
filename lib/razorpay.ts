import {env} from 'cloudflare:workers';
import {AppError} from './research';
export function billingMode(){return env.BILLING_MODE==='live'?'live':env.BILLING_MODE==='test'?'test':'disabled';}
export function providerPlan(plan:string,currency:string){return (env as Record<string,unknown>)[`RAZORPAY_PLAN_${plan.toUpperCase()}_${currency}`] as string|undefined;}
export function checkoutReady(plan:string,currency:string){const mode=billingMode();return mode!=='disabled'&&!!env.RAZORPAY_KEY_SECRET&&!!env.RAZORPAY_WEBHOOK_SECRET&&!!providerPlan(plan,currency)&&!!env.RAZORPAY_KEY_ID?.startsWith(`rzp_${mode}_`);}
export async function razorpay(path:string,body?:unknown){
 const mode=billingMode();if(mode==='disabled'||!env.RAZORPAY_KEY_ID?.startsWith(`rzp_${mode}_`)||!env.RAZORPAY_KEY_SECRET)throw new AppError('Payment configuration is not active.',503);
 let response:Response;
 try{response=await fetch('https://api.razorpay.com/v1/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Basic '+btoa(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{throw new AppError('Razorpay could not be reached. Check billing status before trying again.',502);}
 if(!response.ok)throw new AppError('Razorpay could not complete this action. Contact support if billing status does not update.',502);
 return response.json() as Promise<any>;
}
