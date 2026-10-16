import {AppError} from './research';

// Standard Webhooks: verify the original bytes, delivery ID and timestamp.
export async function verifiedResponseEvent(raw:string,headers:Headers,secret:string|undefined,time=Date.now()){
 if(!secret)throw new AppError('Background delivery is not configured.',503);
 const delivery=headers.get('webhook-id')||'',timestamp=headers.get('webhook-timestamp')||'',signatures=headers.get('webhook-signature')||'';
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(delivery)||!/^\d{1,12}$/.test(timestamp)||Math.abs(time/1000-Number(timestamp))>300)throw new AppError('Invalid webhook signature.',401);
 let key:CryptoKey;
 try{const decoded=atob(secret.replace(/^whsec_/,''));key=await crypto.subtle.importKey('raw',Uint8Array.from(decoded,c=>c.charCodeAt(0)),{name:'HMAC',hash:'SHA-256'},false,['verify']);}
 catch{throw new AppError('Background delivery configuration is invalid.',503);}
 const signed=new TextEncoder().encode(`${delivery}.${timestamp}.${raw}`);
 let valid=false;
 for(const entry of signatures.split(/\s+/)){const [version,value]=entry.split(',');if(version!=='v1'||!value)continue;try{if(await crypto.subtle.verify('HMAC',key,Uint8Array.from(atob(value),c=>c.charCodeAt(0)),signed))valid=true;}catch{/* Other supported signatures may still match. */}}
 if(!valid)throw new AppError('Invalid webhook signature.',401);
 let event:any;try{event=JSON.parse(raw);}catch{throw new AppError('Invalid webhook body.');}
 if(!event||event.object!=='event'||typeof event.type!=='string')throw new AppError('Invalid webhook event.');
 if(!['response.completed','response.failed','response.cancelled','response.incomplete'].includes(event.type))return null;
 if(typeof event.data?.id!=='string'||!/^resp_[A-Za-z0-9_-]{1,190}$/.test(event.data.id))throw new AppError('Invalid response reference.');
 return {id:delivery,responseId:event.data.id,type:event.type};
}
