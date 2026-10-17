import {Buffer} from 'node:buffer';
import type {AuthEnvironment} from './auth-policy';

export class MailDeliveryError extends Error {
 code:string;disposition:'retry'|'blocked'|'uncertain'|'failed';retryAfter:number;
 constructor(code:string,disposition:'retry'|'blocked'|'uncertain'|'failed',message:string,retryAfter=300){super(message);this.code=code;this.disposition=disposition;this.retryAfter=retryAfter;}
}
export const validMailbox=(value:string)=>/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)&&!/[\r\n]/.test(value);
export function mailConfigured(c:AuthEnvironment){return !!(c.GOOGLE_CLIENT_ID&&c.GOOGLE_CLIENT_SECRET&&c.GMAIL_REFRESH_TOKEN&&c.AUTH_EMAIL_FROM&&validMailbox(c.AUTH_EMAIL_FROM));}
const authorizationError=()=>new MailDeliveryError('authorization_required','blocked','Gmail sender authorization needs reconnecting.');
async function safeRequest(url:string,options:RequestInit){
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(8000)});if(r.status>=500&&attempt<2){await new Promise(resolve=>setTimeout(resolve,100*2**attempt));continue;}return r;}
  catch{if(attempt===2)throw new MailDeliveryError('connection_failed','retry','Gmail is temporarily unreachable.');}
 }
 throw new MailDeliveryError('connection_failed','retry','Gmail is temporarily unreachable.');
}
export async function authorizeGmail(c:AuthEnvironment){
 if(!mailConfigured(c))throw new MailDeliveryError('not_configured','blocked','Email delivery is not configured.');
 const r=await safeRequest('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:c.GMAIL_REFRESH_TOKEN!,client_id:c.GOOGLE_CLIENT_ID!,client_secret:c.GOOGLE_CLIENT_SECRET!})});
 const token:any=await r.json().catch(()=>({}));
 if(r.status===429||r.status>=500)throw new MailDeliveryError('temporarily_unavailable','retry','Google authorization is temporarily unavailable.');
 if(!r.ok||typeof token?.access_token!=='string')throw authorizationError();
 const authorization='Bearer '+token.access_token;
 const identity=await safeRequest('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:authorization}});
 const user:any=await identity.json().catch(()=>({}));
 if(identity.status===429||identity.status>=500)throw new MailDeliveryError('temporarily_unavailable','retry','Gmail identity verification is temporarily unavailable.');
 if(!identity.ok||user?.email_verified!==true||typeof user.email!=='string'||user.email.toLowerCase()!==c.AUTH_EMAIL_FROM!.toLowerCase())throw new MailDeliveryError('sender_mismatch','blocked','Account email sender does not match the authorized Gmail mailbox.');
 return authorization;
}
export async function sendGmail(c:AuthEnvironment,mail:{to:string;subject:string;text:string;messageId?:string}){
 if(!validMailbox(mail.to)||/[\r\n]/.test(mail.subject)||mail.subject.length>200||mail.messageId&&!/^[a-zA-Z0-9-]{1,100}$/.test(mail.messageId))throw new MailDeliveryError('invalid_message','failed','Invalid email address or message.');
 const authorization=await authorizeGmail(c);
 const lines=[`From: SignalForge <${c.AUTH_EMAIL_FROM}>`,`To: ${mail.to}`,`Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=`,`Date: ${new Date().toUTCString()}`,...(mail.messageId?[`Message-ID: <${mail.messageId}@signalforge.invalid>`]:[]),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(mail.text,'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n')||''];
 let response:Response;
 try{response=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(lines.join('\r\n'),'utf8').toString('base64url')}),signal:AbortSignal.timeout(15000)});}
 catch{throw new MailDeliveryError('send_outcome_unknown','uncertain','Gmail did not confirm the send. Check the inbox before retrying; it may already have arrived.');}
 const data:any=await response.json().catch(()=>({}));
 const reasons=(Array.isArray(data?.error?.errors)?data.error.errors:[]).map((e:any)=>e?.reason);
 if(response.status===429||response.status===403&&reasons.some((r:string)=>['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded'].includes(r))){
  const retry=response.headers.get('retry-after'),seconds=Number(retry),date=Date.parse(retry||'');
  const after=retry?(Number.isFinite(seconds)?seconds:Math.ceil((date-Date.now())/1000)):300;
  throw new MailDeliveryError('rate_limited','retry','Gmail temporarily refused delivery because of its sending limits.',Math.min(86400,Math.max(300,Number.isFinite(after)?after:300)));
 }
 if(response.status===401||response.status===403)throw authorizationError();
 // Sending is not idempotent: never blindly retry an uncertain acceptance.
 if(response.status>=500||response.ok&&typeof data?.id!=='string')throw new MailDeliveryError('send_outcome_unknown','uncertain','Gmail did not confirm the send. Check the inbox before retrying; it may already have arrived.');
 if(!response.ok)throw new MailDeliveryError('message_rejected','failed','Gmail rejected this message.');
 return {id:data.id as string};
}
