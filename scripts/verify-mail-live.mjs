// Explicit one-message Gmail acceptance check. Does not touch production data,
// launch research, or request/read mailbox contents. Credentials stay local.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const proof='outputs/monitor-email-live-acceptance.json';
if(!process.argv.includes('--send'))throw Error('Use --send to authorize one real test email to the configured sender mailbox.');
if(fs.existsSync(proof)){console.log(fs.readFileSync(proof,'utf8'));process.exit(0);}
process.loadEnvFile('.env.auth.local');
const {GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GMAIL_REFRESH_TOKEN,AUTH_EMAIL_FROM,AUTH_BASE_URL}=process.env;
if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!GMAIL_REFRESH_TOKEN||!AUTH_EMAIL_FROM)throw Error('Existing ignored Gmail sender configuration is required.');
fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync(proof,JSON.stringify({state:'reserved',note:'Do not resend automatically if this check is interrupted.'},null,2),{flag:'wx'});
let runtime;
try{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {sendMonitorEmailTest,setMonitorEmail,monitorEmailState} from './lib/monitor-email.ts';
 const who={owner:'auth:mail-live-qa',userId:'mail-live-qa',authSource:'signalforge'};
 export default {async fetch(){await setMonitorEmail(who,true);await sendMonitorEmailTest(who);return Response.json(await monitorEmailState(who));}};
 `},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*']});
 runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GMAIL_REFRESH_TOKEN,AUTH_EMAIL_FROM,AUTH_BASE_URL:AUTH_BASE_URL||'https://signalforge-research-nr.brandmintai.chatgpt.site'}});
 const db=await runtime.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare('INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind('mail-live-qa','Operator mail QA',AUTH_EMAIL_FROM,1,Date.now(),Date.now()).run();
 const response=await runtime.dispatchFetch('https://local-mail.test/'),state=await response.json();
 assert.equal(response.status,200);const row=state.items.find(r=>r.kind==='test');
 const stored=await db.prepare('SELECT state,provider_id,error FROM monitor_email_outbox WHERE id=?').bind(row.id).first();
 const evidence={checkedAt:new Date().toISOString(),environment:'isolated Worker/D1 using existing real Gmail sender credentials',productionDataModified:false,researchProviderCalls:0,requestedMessages:1,state:stored.state,gmailAccepted:stored.state==='sent'&&!!stored.provider_id,inboxReceipt:'Not inspected; Gmail send-only scope does not grant inbox access.',error:stored.error||null,oauthStatus:'Testing retained by operator instruction',theme:'unchanged'};
 fs.writeFileSync(proof,JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 assert.equal(stored.state,'sent','Gmail must acknowledge the test message.');
}finally{if(runtime)await runtime.dispose();}
