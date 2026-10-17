import {env} from 'cloudflare:workers';
import {authOrigin} from './auth-policy';
import {authorizeGmail,sendGmail,MailDeliveryError,mailConfigured} from './gmail-delivery';
import {AppError} from './research';

const time=()=>new Date().toISOString();
function storage(){if(!env.DB)throw new AppError('Notification storage is unavailable.',503);return env.DB;}
const query=(sql:string,...args:any[])=>storage().prepare(sql).bind(...args);
type Who={owner:string;userId?:string;authSource:string};
async function verifiedUser(who:Who){
 if(who.authSource!=='signalforge'||!who.userId)throw new AppError('Use a verified SignalForge account for monitoring emails.',403);
 const user=await query("SELECT id,email FROM auth_user WHERE id=? AND email_verified=1 AND (?='auth:'||id OR EXISTS (SELECT 1 FROM workspace_accounts w WHERE w.user_id=auth_user.id AND w.owner=?))",who.userId,who.owner,who.owner).first<any>();
 if(!user)throw new AppError('Verify your account email before enabling notifications.',403);
 return user;
}
function failure(error:unknown){return error instanceof MailDeliveryError?error:new MailDeliveryError('temporary_failure','retry','Email processing needs another attempt.');}
async function health(state:string,error=''){
 await query("INSERT INTO mail_delivery_health (id,state,error,checked) VALUES ('gmail',?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,error=excluded.error,checked=excluded.checked",state,error,time()).run();
}
export async function checkMailHealth(){
 try{await authorizeGmail(env);await health('ready');return {state:'ready'};}
 catch(error){const e=failure(error);await health(e.disposition==='blocked'?'blocked':'retry',e.message);return {state:e.disposition==='blocked'?'blocked':'retry',error:e.message};}
}
export async function monitorEmailState(who:Who){
 const setting=await query('SELECT enabled,enabled_at,test_at,user_id FROM monitor_email_settings WHERE owner=?',who.owner).first<any>();
 const sender=await query("SELECT state,error,checked FROM mail_delivery_health WHERE id='gmail'").first<{state:string;error:string;checked:string}>();
 const items=(await query('SELECT id,report_id,kind,title,state,attempts,error,created,updated,next_attempt FROM monitor_email_outbox WHERE owner=? ORDER BY created DESC,id DESC LIMIT 20',who.owner).all()).results;
 return {enabled:!!setting?.enabled,configured:mailConfigured(env),sender:sender||{state:'unchecked',error:'',checked:null},oauthTesting:env.GMAIL_OAUTH_STATUS!=='production',items};
}
export async function setMonitorEmail(who:Who,enabled:unknown){
 if(typeof enabled!=='boolean')throw new AppError('Choose whether to enable monitoring emails.');
 const user=await verifiedUser(who),now=time();
 await storage().batch([
 query("INSERT INTO monitor_email_settings (owner,user_id,enabled,enabled_at,updated) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET user_id=excluded.user_id,enabled=excluded.enabled,enabled_at=CASE WHEN monitor_email_settings.enabled=0 AND excluded.enabled=1 THEN excluded.enabled_at ELSE monitor_email_settings.enabled_at END,updated=excluded.updated",who.owner,user.id,enabled?1:0,now,now),
 ...(!enabled?[query("UPDATE monitor_email_outbox SET state='suppressed',error='Notifications were disabled.',updated=? WHERE owner=? AND state IN ('pending','retry','blocked')",now,who.owner)]:[])
 ]);
 return monitorEmailState(who);
}
export async function queueMonitorEmails(){
 // Only reports launched after opt-in qualify; enabling never emails old history.
 const rows=(await query(`SELECT r.id,r.owner,r.title,r.status,r.monitor_id,s.user_id,u.email FROM reports r
 JOIN monitor_email_settings s ON s.owner=r.owner AND s.enabled=1 AND r.created>=s.enabled_at
 JOIN auth_user u ON u.id=s.user_id AND u.email_verified=1
 WHERE r.monitor_id IS NOT NULL AND r.status IN ('completed','incomplete','failed')
 AND (r.owner='auth:'||u.id OR EXISTS (SELECT 1 FROM workspace_accounts w WHERE w.user_id=u.id AND w.owner=r.owner))
 AND NOT EXISTS (SELECT 1 FROM monitor_email_outbox o WHERE o.report_id=r.id)
 ORDER BY r.created,r.id LIMIT 40`).all()).results as any[];
 const now=time();
 for(const r of rows)await query("INSERT OR IGNORE INTO monitor_email_outbox (id,owner,user_id,recipient,report_id,monitor_id,kind,title,state,next_attempt,created,updated) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?)",crypto.randomUUID(),r.owner,r.user_id,r.email,r.id,r.monitor_id,r.status,r.title.slice(0,200),now,now,now).run();
 // Launch refusals such as exhausted report allowance have no report row.
 // Their backoff lease records when this occurrence last failed to launch.
 const failures=(await query(`SELECT m.*,s.user_id,u.email,s.enabled_at FROM monitors m JOIN monitor_email_settings s ON s.owner=m.owner AND s.enabled=1 JOIN auth_user u ON u.id=s.user_id AND u.email_verified=1 WHERE m.enabled=1 AND m.error<>'' AND m.lease_until IS NOT NULL AND (m.owner='auth:'||u.id OR EXISTS (SELECT 1 FROM workspace_accounts w WHERE w.user_id=u.id AND w.owner=m.owner)) AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.owner=m.owner AND r.monitor_id=m.id AND r.monitor_due=m.next_run) LIMIT 40`).all()).results as any[];
 for(const m of failures){
  if(Date.parse(m.lease_until)-3600000<Date.parse(m.enabled_at))continue;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(m.owner+'|'+m.id+'|'+m.next_run));
  const key='launch-'+[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
  await query("INSERT OR IGNORE INTO monitor_email_outbox (id,owner,user_id,recipient,monitor_id,kind,title,state,next_attempt,created,updated) VALUES (?,?,?,?,?,'launch_failed',?,'pending',?,?,?)",key,m.owner,m.user_id,m.email,m.id,m.name.slice(0,200),now,now,now).run();
 }
 return rows.length;
}
export async function sendMonitorEmailTest(who:Who){
 const user=await verifiedUser(who),now=time(),id=crypto.randomUUID();
 const update=query("UPDATE monitor_email_settings SET test_at=?,updated=? WHERE owner=? AND enabled=1 AND (test_at IS NULL OR test_at<?)",now,now,who.owner,new Date(Date.now()-1800000).toISOString());
 const insert=query("INSERT INTO monitor_email_outbox (id,owner,user_id,recipient,kind,title,state,next_attempt,created,updated) SELECT ?,?,?,?,'test','Monitoring email test','pending',?,?,? WHERE changes()=1",id,who.owner,user.id,user.email,now,now,now);
 const result=await storage().batch([update,insert]);
 if(!result[0].meta.changes)throw new AppError('Enable notifications first. Test emails are limited to one every 30 minutes.',429);
 await dispatchMonitorEmails(who.owner,id);
 return monitorEmailState(who);
}
export async function retryMonitorEmail(who:Who,id:string,acknowledge:unknown){
 await verifiedUser(who);
 const row=await query('SELECT * FROM monitor_email_outbox WHERE id=? AND owner=?',id,who.owner).first<any>();
 if(!row)throw new AppError('This notification was not found.',404);
 if(!['uncertain','failed'].includes(row.state)||row.attempts>=8)throw new AppError('This notification cannot be retried.');
 if(row.state==='uncertain'&&acknowledge!==true)throw new AppError('Check your inbox first, then acknowledge that retrying may send a duplicate.');
 const result=await query("UPDATE monitor_email_outbox SET state='retry',next_attempt=?,error='',updated=? WHERE id=? AND owner=? AND state=? AND EXISTS (SELECT 1 FROM monitor_email_settings WHERE owner=? AND enabled=1)",time(),time(),id,who.owner,row.state,who.owner).run();
 if(!result.meta.changes)throw new AppError('Enable notifications before retrying.');
 await dispatchMonitorEmails(who.owner,id);
 return monitorEmailState(who);
}
export async function dispatchMonitorEmails(owner?:string,onlyId?:string){
 const now=time(),started=Date.now();
 // A process can die after sending but before storing Google's receipt.
 // Expired send leases become uncertain, not an automatic duplicate send.
 await query("UPDATE monitor_email_outbox SET state='uncertain',lease_until=NULL,error='Sending was interrupted. Check your inbox before a manual retry.',updated=? WHERE state='sending' AND lease_until<?",now,now).run();
 const rows=(await query(`SELECT * FROM monitor_email_outbox WHERE state IN ('pending','retry','blocked') AND next_attempt<=? ${owner?'AND owner=?':''} ${onlyId?'AND id=?':''} ORDER BY next_attempt,id LIMIT 10`,now,...(owner?[owner]:[]),...(onlyId?[onlyId]:[])).all()).results as any[];
 let accepted=0,attention=0;
 for(const row of rows){
  if(Date.now()-started>30000)break; // Leave remaining work durable for the next tick.
  const setting=await query("SELECT s.enabled,u.email FROM monitor_email_settings s JOIN auth_user u ON u.id=s.user_id WHERE s.owner=? AND s.user_id=? AND u.email_verified=1 AND (s.owner='auth:'||u.id OR EXISTS (SELECT 1 FROM workspace_accounts w WHERE w.user_id=u.id AND w.owner=s.owner))",row.owner,row.user_id).first<any>();
  if(!setting?.enabled||setting.email.toLowerCase()!==row.recipient.toLowerCase()){
   await query("UPDATE monitor_email_outbox SET state='suppressed',error='Email consent or verified recipient changed.',updated=? WHERE id=? AND state IN ('pending','retry','blocked')",now,row.id).run();continue;
  }
  if(Date.now()-Date.parse(row.created)>7*86400000||row.attempts>=8){await query("UPDATE monitor_email_outbox SET state='failed',error='Delivery retry window ended.',updated=? WHERE id=?",now,row.id).run();continue;}
  const lease=new Date(Date.now()+120000).toISOString();
  const claimed=await query("UPDATE monitor_email_outbox SET state='sending',lease_until=?,attempts=attempts+1,updated=? WHERE id=? AND state IN ('pending','retry','blocked') AND next_attempt<=?",lease,now,row.id,now).run();
  if(!claimed.meta.changes)continue;
  let acceptedByProvider=false;
  try{
   const report=row.report_id?await query('SELECT status FROM reports WHERE id=? AND owner=? AND monitor_id=?',row.report_id,row.owner,row.monitor_id).first<any>():null;
   if(row.report_id&&!report){await query("UPDATE monitor_email_outbox SET state='suppressed',error='The saved report is no longer available.',lease_until=NULL,updated=? WHERE id=? AND lease_until=?",time(),row.id,lease).run();continue;}
   const origin=authOrigin(env);
   const url=origin+(row.report_id?'/workspace/reports/'+encodeURIComponent(row.report_id):row.monitor_id?'/workspace/monitors/'+encodeURIComponent(row.monitor_id):'/workspace/monitors');
   const state=row.kind==='test'?'This is the test email you requested. Future monitoring results and research failures will link back to your private workspace.':row.kind==='completed'?'Your monitoring briefing is ready.':row.kind==='incomplete'?'Your monitoring scan returned partial results. Review its limitations in SignalForge.':row.kind==='launch_failed'?'A monitoring scan could not start. Open SignalForge to review its allowance, configuration or research availability.':'Your monitoring research could not complete. Open SignalForge to review the failure.';
   const receipt=await sendGmail(env,{to:row.recipient,messageId:row.id,subject:row.kind==='test'?'SignalForge monitoring email test':row.kind==='completed'?'SignalForge monitoring briefing ready':'SignalForge monitoring needs attention',text:state+'\n\n'+row.title+'\n\n'+url+'\n\nSign in to view this private report. Email contains no report body or attachments.\nManage or disable these emails in Monitoring → Email notifications.\n\nSignalForge'});
   acceptedByProvider=true;
   await query("UPDATE monitor_email_outbox SET state='sent',provider_id=?,error='',lease_until=NULL,updated=? WHERE id=? AND state='sending' AND lease_until=?",receipt.id,time(),row.id,lease).run();
   await health('ready');accepted++;
  }catch(error){
   const e=acceptedByProvider?new MailDeliveryError('receipt_not_saved','uncertain','Gmail accepted this message but its receipt could not be saved. Check the inbox before retrying.'):failure(error),state=e.disposition;
   const delay=state==='blocked'?21600:Math.max(e.retryAfter,Math.min(21600,300*2**Math.min(row.attempts,6)));
   await query("UPDATE monitor_email_outbox SET state=?,error=?,next_attempt=?,lease_until=NULL,updated=? WHERE id=? AND state='sending' AND lease_until=?",state,e.message,new Date(Date.now()+delay*1000).toISOString(),time(),row.id,lease).run();
   if(state==='blocked')await query('UPDATE monitor_email_outbox SET attempts=MAX(0,attempts-1) WHERE id=?',row.id).run();
   await health(state,e.message);attention++;
   if(state==='blocked'||e.code==='rate_limited')break; // Protect the shared sender.
  }
 }
 return {accepted,attention};
}
export async function runMonitorEmailDelivery(){
 const queued=await queueMonitorEmails();
 return {queued,...await dispatchMonitorEmails()};
}
