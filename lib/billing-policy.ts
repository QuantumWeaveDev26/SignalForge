// Retail prices and allowances approved by the operator on 15 October 2026.
// Amounts are integer paise/cents, never supplied by the browser.
export const paidPlans = [
  {id:'solo',name:'Solo',prices:{INR:149900,USD:1900},chats:50,reports:10},
  {id:'pro',name:'Pro',prices:{INR:399900,USD:4900},chats:200,reports:30},
] as const;
export type Currency='INR'|'USD';
export type PlanId=typeof paidPlans[number]['id'];
export function selectedPlan(value:unknown){return paidPlans.find(p=>p.id===value);}
export function money(amount:number,currency:Currency){return new Intl.NumberFormat(currency==='INR'?'en-IN':'en-US',{style:'currency',currency,maximumFractionDigits:0}).format(amount/100);}
export const subscriptionCycles=120;
export async function validSignature(message:string,signature:string,secret:string){
 if(!secret||!/^([a-f0-9]{64})$/i.test(signature))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g)!,h=>parseInt(h,16)),new TextEncoder().encode(message));
}
