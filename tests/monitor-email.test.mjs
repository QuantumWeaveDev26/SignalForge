import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';

const origin='https://signalforge.test',sender='sender@example.com';
let runtime,db,mode='ok',sent=[],sendCalls=0,tokenCalls=0;
const input={template:'brand',subject:'Email QA brand',question:'Research its current positioning',market:'India'};
async function call(endpoint,method='GET',body,owner='auth:qa-a',extra={}){
 const r=await runtime.dispatchFetch(origin+'/api/workspace'+endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json','x-qa-owner':owner,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,value:await r.json()};
}
async function tick(){const r=await runtime.dispatchFetch(origin+'/api/monitor-tick',{method:'POST',headers:{Authorization:'Bearer qa-runner'},body:'{}'});return {status:r.status,value:await r.json()};}
async function user(id,verified=true){await db.prepare('INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,'QA',id+'@example.com',verified?1:0,Date.now(),Date.now()).run();}
async function enable(owner){const r=await call('/monitor-email','POST',{enabled:true},owner);assert.equal(r.status,200,JSON.stringify(r));}
async function dueAll(){await db.prepare("UPDATE monitor_email_outbox SET next_attempt='2000-01-01T00:00:00.000Z' WHERE state IN ('pending','retry','blocked')").run();}
async function monitorReport(owner,status='completed',created=new Date().toISOString()){
 const id=crypto.randomUUID(),monitor=crypto.randomUUID();
 await db.prepare('INSERT INTO monitors (id,owner,name,input,cadence,next_run,created,enabled) VALUES (?,?,?,?,?,?,?,0)').bind(monitor,owner,'QA rule',JSON.stringify(input),'weekly',created,created).run();
 await db.prepare('INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,body,sources,monitor_id,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,'QA result','brand',input.subject,'India',input.question,JSON.stringify(input),status,'PRIVATE REPORT BODY MUST NOT BE EMAILED','[]',monitor,created,created).run();
 return id;
}
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {GET,POST,PATCH,DELETE} from './app/api/workspace/[[...path]]/route.ts';
 import {POST as tick} from './app/api/monitor-tick/route.ts';
 import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';
 import {setOwner} from 'qa-identity';
 export default {fetch(request){setOwner(request.headers.get('x-qa-owner'));return new URL(request.url).pathname==='/api/monitor-tick'?tick(request):({GET,POST,PATCH,DELETE})[request.method](createTrackedAppRouteRequest(request).request);}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'qa',setup(b){
 b.onResolve({filter:/application-auth$|^qa-identity$/},()=>({path:'identity',namespace:'qa'}));
 b.onResolve({filter:/(^|\/)provider$/},()=>({path:'provider',namespace:'qa'}));
 b.onResolve({filter:/^@\//},a=>({path:path.resolve(a.path.replace(/^@\//,'')+'.ts')}));
 b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='identity'?`
 let owner;export function setOwner(value){owner=value;}
 export async function getApplicationUser(){return owner?{owner,userId:owner.replace('auth:',''),email:owner.replace('auth:','')+'@example.com',name:'QA',authSource:'signalforge'}:null;}
 `:`
 let serial=0;const responses=new Map();export function config(){return {key:'fixture',model:'fixture'};}export function backgroundReady(){return true;}
 export async function provider(url,payload){if(url==='responses'){const id='resp_qa_'+(++serial);responses.set(id,{id,status:'completed',output:[{content:[{type:'output_text',text:'PRIVATE REPORT BODY MUST NOT BE EMAILED',annotations:[{type:'url_citation',url:'https://example.com/evidence',title:'Evidence',start_index:0,end_index:0}]}]}]});return {id,status:'queued',output:[]};}return responses.get(url.split('/')[1]);}
 `}));
 }}]});
 runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{AUTH_BASE_URL:origin,GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-secret',GMAIL_REFRESH_TOKEN:'test-refresh',AUTH_EMAIL_FROM:sender,MONITOR_RUNNER_SECRET:'qa-runner'},outboundService:async request=>{
 const url=new URL(request.url);
 if(url.hostname==='oauth2.googleapis.com'){tokenCalls++;if(mode==='auth')return Response.json({error:'invalid_grant'},{status:400});if(mode==='token-flaky'&&tokenCalls%2===1)return new Response('temporary',{status:503});return Response.json({access_token:'fixture-access'});}
 if(url.hostname==='openidconnect.googleapis.com')return Response.json({email:mode==='mismatch'?'other@example.com':sender,email_verified:true});
 if(url.hostname==='gmail.googleapis.com'){sendCalls++;const body=await request.json();sent.push(Buffer.from(body.raw,'base64url').toString('utf8'));if(mode==='rate')return Response.json({error:{errors:[{reason:'userRateLimitExceeded'}]}},{status:429,headers:{'Retry-After':'3600'}});if(mode==='unknown')return new Response('temporary',{status:503});return Response.json({id:'gmail-qa-'+sendCalls});}
 throw new Error('Unexpected external request: '+url.hostname);
 }});
 db=await runtime.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 for(const id of ['qa-a','qa-b','qa-retry','qa-unknown','qa-auth','qa-optout','qa-changed','qa-lease','qa-flaky','qa-fail','qa-rollback'])await user(id);
 await user('qa-unverified',false);
});
after(async()=>{if(runtime)await runtime.dispose();});

test('Notification consent requires verified ownership, rejects forged recipients and cross-site/developer writes',async()=>{
 assert.equal((await call('/monitor-email','POST',{enabled:true},'')).status,401);
 assert.equal((await call('/monitor-email','POST',{enabled:true},'auth:qa-unverified')).status,403);
 assert.equal((await call('/monitor-email','POST',{enabled:true},'auth:qa-a',{Origin:'https://other.example'})).status,403);
 assert.equal((await call('/monitor-email','POST',{enabled:true,to:'victim@example.com'})).status,400);
 assert.equal((await call('/monitor-email','POST',{enabled:true},'auth:qa-a',{Authorization:'Bearer forged'})).status,403);
 const r=await call('/monitor-email');assert.equal(r.value.enabled,false);assert.equal(r.value.oauthTesting,true);
});

test('Real monitoring tick completes a scan and sends one private link, repeated ticks do not duplicate',async()=>{
 await enable('auth:qa-a');
 const created=await call('/monitors','POST',{name:'Email integration QA',input,cadence:'weekly'});assert.equal(created.status,201);
 const before=sendCalls;const r=await tick();assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.value.emailDelivery.accepted,1);
 const outbox=(await db.prepare("SELECT * FROM monitor_email_outbox WHERE owner='auth:qa-a'").all()).results;
 assert.equal(outbox.length,1);assert.equal(outbox[0].state,'sent');assert.ok(outbox[0].provider_id);
 const mime=sent.at(-1),text=Buffer.from(mime.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString();
 assert.match(mime,/To: qa-a@example.com/);assert.match(text,new RegExp('/workspace/reports/'+outbox[0].report_id));assert.doesNotMatch(text,/PRIVATE REPORT BODY|fixture-access|test-secret|test-refresh/);
 await tick();assert.equal(sendCalls,before+1);
 await call('/monitors/'+created.value.id,'PATCH',{enabled:false});
});

test('Opt-in never sends historical reports and notification history is owner isolated',async()=>{
 const old=await monitorReport('auth:qa-b','completed','2025-01-01T00:00:00.000Z');await enable('auth:qa-b');await tick();
 assert.equal(await db.prepare('SELECT id FROM monitor_email_outbox WHERE report_id=?').bind(old).first(),null);
 const r=await call('/monitor-email','GET',undefined,'auth:qa-b');assert.equal(r.value.items.length,0);
});

test('Rate-limit rejection persists retry and respects retry-after before a single accepted retry',async()=>{
 mode='rate';await enable('auth:qa-retry');const report=await monitorReport('auth:qa-retry');await tick();
 let row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'retry');assert.ok(Date.parse(row.next_attempt)-Date.now()>3500000);
 const count=sendCalls;await tick();assert.equal(sendCalls,count);
 mode='ok';await dueAll();await tick();row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'sent');await tick();assert.equal(sendCalls,count+1);
});

test('Ambiguous send is never automatically resent; manual retry requires duplicate acknowledgement and ownership',async()=>{
 mode='unknown';await enable('auth:qa-unknown');const report=await monitorReport('auth:qa-unknown');await tick();
 let row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'uncertain');
 const count=sendCalls;await tick();assert.equal(sendCalls,count);
 assert.equal((await call('/monitor-email/'+row.id+'/retry','POST',{},'auth:qa-b')).status,404);
 assert.equal((await call('/monitor-email/'+row.id+'/retry','POST',{},'auth:qa-unknown')).status,400);
 mode='ok';assert.equal((await call('/monitor-email/'+row.id+'/retry','POST',{acknowledgeDuplicateRisk:true},'auth:qa-unknown')).status,200);
 assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE id=?').bind(row.id).first()).state,'sent');
});

test('Expired authorization blocks without sending and recovers after reconnect without exhausting send attempts',async()=>{
 mode='auth';await enable('auth:qa-auth');const report=await monitorReport('auth:qa-auth'),before=sendCalls;await tick();
 let row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'blocked');assert.equal(row.attempts,0);assert.equal(sendCalls,before);
 const state=await call('/monitor-email','GET',undefined,'auth:qa-auth');assert.equal(state.value.sender.state,'blocked');assert.match(state.value.sender.error,/reconnect/);
 mode='ok';await dueAll();await tick();row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'sent');
});

test('Disabling or changing verified recipient suppresses queued mail; delivery cannot redirect to arbitrary email',async()=>{
 mode='rate';await enable('auth:qa-optout');const report=await monitorReport('auth:qa-optout');await tick();await call('/monitor-email','POST',{enabled:false},'auth:qa-optout');
 assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE report_id=?').bind(report).first()).state,'suppressed');
 await enable('auth:qa-changed');const changed=await monitorReport('auth:qa-changed');await tick();await db.prepare("UPDATE auth_user SET email='new@example.com' WHERE id='qa-changed'").run();
 mode='ok';await dueAll();await tick();assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE report_id=?').bind(changed).first()).state,'suppressed');
});

test('Expired send leases become uncertain, cancelled scans are ignored and failures/partials notify accurately',async()=>{
 await enable('auth:qa-lease');const report=await monitorReport('auth:qa-lease','cancelled');await tick();assert.equal(await db.prepare('SELECT id FROM monitor_email_outbox WHERE report_id=?').bind(report).first(),null);
 const id=crypto.randomUUID(),now=new Date().toISOString();await db.prepare("INSERT INTO monitor_email_outbox (id,owner,user_id,recipient,kind,title,state,next_attempt,lease_until,created,updated) VALUES (?,'auth:qa-lease','qa-lease','qa-lease@example.com','test','QA','sending',?,'2000-01-01',?,?)").bind(id,now,now,now).run();
 const before=sendCalls;await tick();assert.equal(sendCalls,before);assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE id=?').bind(id).first()).state,'uncertain');
 await enable('auth:qa-fail');const failed=await monitorReport('auth:qa-fail','failed'),partial=await monitorReport('auth:qa-fail','incomplete');await tick();
 for(const id of [failed,partial])assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE report_id=?').bind(id).first()).state,'sent');
 assert.match(Buffer.from(sent.at(-1).split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString(),/partial results|could not complete/);
});

test('Concurrent dispatch claims one send; test emails are durable and rate limited',async()=>{
 await enable('auth:qa-flaky');mode='token-flaky';await monitorReport('auth:qa-flaky');const before=sendCalls;const results=await Promise.all([tick(),tick()]);assert.ok(results.every(r=>r.status===200));assert.equal(sendCalls,before+1);
 mode='ok';const result=await call('/monitor-email/test','POST',{},'auth:qa-flaky');assert.equal(result.status,200);assert.ok(result.value.items.some(i=>i.kind==='test'&&i.state==='sent'));assert.equal((await call('/monitor-email/test','POST',{},'auth:qa-flaky')).status,429);
 assert.equal((await call('/monitor-email/test','POST',{to:'other@example.com'},'auth:qa-flaky')).status,400);
});

test('A missing durable receipt after Gmail acceptance cannot trigger an automatic resend',async()=>{
 await enable('auth:qa-rollback');const report=await monitorReport('auth:qa-rollback');
 await db.prepare("CREATE TRIGGER fail_email_receipt BEFORE UPDATE ON monitor_email_outbox WHEN NEW.owner='auth:qa-rollback' AND NEW.state='sent' BEGIN SELECT RAISE(ABORT,'receipt save failure'); END").run();
 await tick();const row=await db.prepare('SELECT * FROM monitor_email_outbox WHERE report_id=?').bind(report).first();assert.equal(row.state,'uncertain');
 const before=sendCalls;await tick();assert.equal(sendCalls,before);await db.prepare('DROP TRIGGER fail_email_receipt').run();
});

test('Launch allowance failures without a report produce one actionable email per due occurrence',async()=>{
 const owner='auth:qa-launch';await user('qa-launch');await enable(owner);
 const created=new Date().toISOString();for(let n=0;n<8;n++)await db.prepare("INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,created,updated) VALUES (?,?,?,'brand','quota','India','quota','{}','completed',?,?)").bind(crypto.randomUUID(),owner,'Quota fixture',created,created).run();
 const rule=await call('/monitors','POST',{name:'Quota refusal notification',input,cadence:'weekly'},owner);assert.equal(rule.status,201);
 const before=sendCalls;await tick();assert.equal(sendCalls,before+1);
 const rows=(await db.prepare("SELECT * FROM monitor_email_outbox WHERE owner=?").bind(owner).all()).results;assert.equal(rows.length,1);assert.equal(rows[0].kind,'launch_failed');assert.equal(rows[0].report_id,null);assert.equal(rows[0].state,'sent');
 await db.prepare("UPDATE monitors SET lease_until=NULL WHERE id=?").bind(rule.value.id).run();await tick();assert.equal(sendCalls,before+1);await call('/monitors/'+rule.value.id,'PATCH',{enabled:false},owner);
});
test('Verified preview-workspace links authorize notifications, while an unlinked workspace cannot claim them',async()=>{
 await user('preview-qa');
 assert.equal((await call('/monitor-email','POST',{enabled:true},'preview-qa')).status,403);
 await db.prepare('INSERT INTO workspace_accounts (user_id,owner,created) VALUES (?,?,?)').bind('preview-qa','preview-qa',new Date().toISOString()).run();
 await enable('preview-qa');const id=await monitorReport('preview-qa');await tick();assert.equal((await db.prepare('SELECT state FROM monitor_email_outbox WHERE report_id=?').bind(id).first()).state,'sent');
});

