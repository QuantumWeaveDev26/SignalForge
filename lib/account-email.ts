import type {AccountEmail} from './auth-config';
import {authOrigin,type AuthEnvironment} from './auth-policy.ts';
import {sendGmail,MailDeliveryError} from './gmail-delivery.ts';
export async function sendAccountEmail(config:AuthEnvironment&{DB?:D1Database},mail:AccountEmail){
 if(new URL(mail.url).origin!==authOrigin(config))throw new Error('Invalid account email link.');
 const verification=mail.kind==='verify';
 const record=async(state:string,error='')=>{try{await config.DB?.prepare("INSERT INTO mail_delivery_health (id,state,error,checked) VALUES ('gmail',?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,error=excluded.error,checked=excluded.checked").bind(state,error,new Date().toISOString()).run();}catch{/* Health telemetry must never retry an accepted account email. */}};
 try{
  await sendGmail(config,{to:mail.to,subject:verification?'Verify your SignalForge email':'Reset your SignalForge password',text:`${verification?'Confirm your email to finish creating your SignalForge account.':'You requested a SignalForge password reset.'}\n\n${mail.url}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.\n\nSignalForge`});
  await record('ready');
 }catch(error){await record(error instanceof MailDeliveryError?error.disposition:'retry',error instanceof MailDeliveryError?error.message:'Email delivery needs attention.');throw error;}
}
