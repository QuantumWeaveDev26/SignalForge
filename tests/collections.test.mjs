import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {createHmac} from 'node:crypto';
import {pdfFixture,docxFixture} from './file-fixtures.mjs';

const origin='https://signalforge.test';
let runtime,db,project,workflow,runId,profile,report;
async function call(endpoint,method='GET',body,owner='owner-a',extra={}){
 const r=await runtime.dispatchFetch(origin+'/api/workspace'+endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json','x-fixture-owner':owner,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,value:await r.json()};
}
const inputs={template:'brand',subject:'Example brand',question:'What evidence supports its positioning?',market:'India'};
const steps=[{name:'Positioning',template:'brand',question:'Research positioning.'},{name:'Opportunities',template:'custom',question:'Synthesize the prior evidence into opportunities.'}];
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {GET,POST,PATCH,DELETE} from './app/api/workspace/[[...path]]/route.ts';
 import {POST as webhook} from './app/api/webhooks/openai/route.ts';
 import {POST as monitorTick} from './app/api/monitor-tick/route.ts';
 import {GET as sharedReport} from './app/api/shared/[token]/route.ts';
 import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';
 import {setOwner} from 'fixture-identity'; import {control,inspection} from 'fixture-provider';
 export default {async fetch(request){setOwner(request.headers.get('x-fixture-owner'));control(request.headers);if(new URL(request.url).pathname==='/fixture')return Response.json(inspection());if(new URL(request.url).pathname==='/api/webhooks/openai')return webhook(request);if(new URL(request.url).pathname==='/api/monitor-tick')return monitorTick(request);if(new URL(request.url).pathname.startsWith('/api/shared/'))return sharedReport(request);return ({GET,POST,PATCH,DELETE})[request.method](createTrackedAppRouteRequest(request).request);}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'workspace-fixtures',setup(b){
   b.onResolve({filter:/application-auth$|^fixture-identity$/},()=>({path:'identity',namespace:'fixture'}));
   b.onResolve({filter:/(^|\/)provider$|^fixture-provider$/},()=>({path:'provider',namespace:'fixture'}));
   b.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.replace(/^@\//,'')+'.ts')}));
   b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='identity'?`
     let owner;export function setOwner(value){owner=value;}
     export async function getApplicationUser(){return owner?{owner,name:'Fixture',email:'fixture@example.com',authSource:'signalforge'}:null;}`:`
     const responses=new Map();let fail=false;let hold=false;let terminal='completed';let serial=0;let lastInput='';export function inspection(){return {input:lastInput};}
     export function control(headers){fail=headers.get('x-fixture-fail')==='true';hold=headers.get('x-fixture-hold')==='true';terminal=headers.get('x-fixture-terminal')||'completed';}
     export function backgroundReady(){return true;}export function config(){return {key:'fixture-only',model:'fixture-model'};}
     export async function provider(url,payload){
       if(fail){fail=false;throw new Error('Simulated provider interruption');}
       if(url==='responses'){lastInput=payload.input;
         const id='resp_fixture_'+(++serial);const body=payload.input.includes('CURRENT USER QUESTION')?(payload.input.includes('"question":"Remember our India audience"')?'Chat remembers prior India audience evidence.':'Chat answer with public evidence.'):(payload.input.includes('PRIOR WORKFLOW FINDINGS')?'Synthesis uses prior evidence.':'Positioning evidence.');
         responses.set(id,{id,status:terminal,metadata:payload.metadata,output:[{content:[{type:'output_text',text:body,annotations:[{type:'url_citation',start_index:0,end_index:0,url:'https://example.com/source',title:'Evidence'}]}]}]});
         return {id,status:'queued',output:[]};
       }
       const id=url.split('/')[1];return hold?{id,status:'in_progress',output:[]}:responses.get(id)||{id,status:'completed',metadata:{}};
     }` }));
 }}]});
 runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OPENAI_WEBHOOK_SECRET:'whsec_c2lnbmFsZm9yZ2Utd2ViaG9vay10ZXN0LW9ubHk=',BACKGROUND_WEBHOOK_ENABLED:'true',PRIVATE_MONITOR_RUNNER_ENABLED:'true',MONITOR_RUNNER_SECRET:'fixture-runner-only'}});
 db=await runtime.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
});
after(async()=>{if(runtime)await runtime.dispose();});

const webhookKey=Buffer.from('signalforge-webhook-test-only');
async function delivery(responseId,{id='wh_'+crypto.randomUUID().replaceAll('-',''),timestamp=Math.floor(Date.now()/1000),tamper=false,extra={}}={}){
 const raw=JSON.stringify({object:'event',id:'evt_test',type:'response.completed',data:{id:responseId}});
 const signature=createHmac('sha256',webhookKey).update(`${id}.${timestamp}.${raw}`).digest('base64');
 const r=await runtime.dispatchFetch(origin+'/api/webhooks/openai',{method:'POST',headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':String(timestamp),'webhook-signature':'v1,'+signature,...extra},body:raw+(tamper?' ': '')});
 return {id,status:r.status,value:await r.json()};
}
async function backgroundRun(owner,extra={}){
 const template=await call('/workflows','POST',{name:'Background QA',input:inputs,steps},owner);
 assert.equal(template.status,201);
 const started=await call('/workflows/'+template.value.id+'/run','POST',{requestId:crypto.randomUUID(),background:true},owner,extra);
 assert.equal(started.status,201);assert.equal(started.value.backgroundEnabled,true);
 const first=await db.prepare('SELECT response_id FROM reports WHERE workflow_run_id=?').bind(started.value.id).first();
 return {id:started.value.id,response:first.response_id};
}

test('Signed completion advances and finishes a background workflow without browser polling',async()=>{
 const job=await backgroundRun('owner-background');
 let d=await delivery(job.response);assert.equal(d.status,200);assert.equal(d.value.advanced,true);
 assert.equal((await delivery(job.response,{id:d.id})).value.duplicate,true);
 assert.equal((await delivery(job.response)).status,200,'A separate repeated event cannot advance past the in-progress step.');
 const reports=(await db.prepare('SELECT * FROM reports WHERE workflow_run_id=? ORDER BY workflow_step').bind(job.id).all()).results;
 assert.equal(reports.length,2);assert.equal(reports[0].status,'completed');
 assert.equal((await delivery(reports[1].response_id)).status,200);
 const finished=await db.prepare('SELECT status FROM workflow_runs WHERE id=?').bind(job.id).first();assert.equal(finished.status,'completed');
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(job.id).first()).n,2);
});
test('Forged, altered and stale webhook payloads cannot write or launch work',async()=>{
 assert.equal((await delivery('resp_unknown',{tamper:true})).status,401);
 assert.equal((await delivery('resp_unknown',{timestamp:Math.floor(Date.now()/1000)-301})).status,401);
 assert.equal((await delivery('resp_unknown',{timestamp:Math.floor(Date.now()/1000)+301})).status,401);
 const r=await runtime.dispatchFetch(origin+'/api/webhooks/openai',{method:'POST',body:'{}'});assert.equal(r.status,401);
});
test('Transient webhook processing failures retain a retryable receipt',async()=>{
 const job=await backgroundRun('owner-background-retry');
 const first=await delivery(job.response,{extra:{'x-fixture-fail':'true'}});assert.equal(first.status,503);
 const saved=await db.prepare('SELECT state FROM background_events WHERE id=?').bind(first.id).first();assert.equal(saved.state,'pending');
 const retried=await delivery(job.response,{id:first.id});assert.equal(retried.status,200);assert.equal(retried.value.advanced,true);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(job.id).first()).n,2);
});
test('Pausing or stopping background mode prevents subsequent paid launches',async()=>{
 const paused=await backgroundRun('owner-background-pause');
 assert.equal((await call('/workflow-runs/'+paused.id+'/background','POST',{enabled:false},'owner-background-pause',{'x-fixture-fail':'true'})).status,200);
 assert.equal((await delivery(paused.response)).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(paused.id).first()).n,1);
 assert.equal((await call('/workflow-runs/'+paused.id+'/background','POST',{enabled:true},'owner-b')).status,404);
 const stopped=await backgroundRun('owner-background-stop');
 assert.equal((await call('/workflow-runs/'+stopped.id+'/stop','POST',{},'owner-background-stop')).status,200);
 assert.equal((await delivery(stopped.response)).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(stopped.id).first()).n,1);
});
test('Provider failure pauses background execution and requires an explicit retry',async()=>{
 const job=await backgroundRun('owner-background-failed',{'x-fixture-terminal':'failed'});
 const event=await delivery(job.response);assert.equal(event.status,200);assert.equal(event.value.paused,true);
 const saved=await db.prepare('SELECT status,background_enabled FROM workflow_runs WHERE id=?').bind(job.id).first();
 assert.equal(saved.status,'paused');assert.equal(saved.background_enabled,0);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(job.id).first()).n,1);
});
test('Completion webhooks synchronize independent chat answers without a visitor session',async()=>{
 const owner='owner-background-chat';const conversation=await call('/conversations','POST',{title:'Background chat'},owner);
 const sent=await call('/conversations/'+conversation.value.id+'/turns','POST',{question:'Background answer QA',requestId:crypto.randomUUID()},owner);
 assert.equal(sent.status,201);const row=await db.prepare('SELECT response_id FROM conversation_turns WHERE id=?').bind(sent.value.id).first();
 assert.equal((await delivery(row.response_id)).status,200);
 const saved=await db.prepare('SELECT status,body FROM conversation_turns WHERE id=?').bind(sent.value.id).first();assert.equal(saved.status,'completed');assert.ok(saved.body.length);
});
test('Public monitoring rejects the old private-deployment bypass flag',async()=>{
 const r=await runtime.dispatchFetch(origin+'/api/monitor-tick',{method:'POST',body:'{}'});assert.equal(r.status,401);
});
test('Concurrent completion deliveries cannot create duplicate paid steps',async()=>{
 const job=await backgroundRun('owner-background-concurrent');
 const events=await Promise.all([delivery(job.response),delivery(job.response)]);
 for(const event of events){assert.ok([200,503].includes(event.status));if(event.status===503)assert.equal((await delivery(job.response,{id:event.id})).status,200);}
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(job.id).first()).n,2);
});
test('A completion delivered before response ID persistence recovers from provider metadata',async()=>{
 const job=await backgroundRun('owner-background-fast');
 await db.prepare("UPDATE reports SET response_id=NULL,status='starting' WHERE workflow_run_id=?").bind(job.id).run();
 assert.equal((await delivery(job.response)).status,200);
 const rows=(await db.prepare('SELECT status,response_id FROM reports WHERE workflow_run_id=? ORDER BY workflow_step').bind(job.id).all()).results;
 assert.equal(rows.length,2);assert.equal(rows[0].status,'completed');assert.equal(rows[0].response_id,job.response);
});
test('Background advancement respects the shared report allowance and pauses visibly',async()=>{
 const owner='owner-background-quota',job=await backgroundRun(owner),time=new Date().toISOString();
 for(let i=0;i<7;i++)await db.prepare("INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,created,updated) VALUES (?,?,?,'brand','Example','India','Question','{}','completed',?,?)").bind(crypto.randomUUID(),owner,'Quota fixture',time,time).run();
 assert.equal((await delivery(job.response)).status,200);
 const saved=await db.prepare('SELECT status,background_enabled,error FROM workflow_runs WHERE id=?').bind(job.id).first();
 assert.equal(saved.status,'paused');assert.equal(saved.background_enabled,0);assert.match(saved.error,/8 per day|allowance/i);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(job.id).first()).n,1);
});

test('Additive migration retains old reports and detaches new references on deletion',()=>{
 const database=new DatabaseSync(':memory:');database.exec('PRAGMA foreign_keys=ON');
 const migrations=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.slice(0,2))database.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 database.exec("INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,body,created,updated) VALUES ('old','a','Original','brand','Brand','India','Question','{}','completed','Original evidence','2026-10-15','2026-10-15')");
 for(const f of migrations.slice(2))database.exec(fs.readFileSync('drizzle/'+f,'utf8'));
 const old=database.prepare('SELECT * FROM reports WHERE id=?').get('old');assert.equal(old.body,'Original evidence');assert.equal(old.favorite,0);assert.equal(old.labels,'[]');
 database.exec("INSERT INTO projects (id,owner,name,created,updated) VALUES ('p','a','Project','2026-10-15','2026-10-15');UPDATE reports SET project_id='p' WHERE id='old';DELETE FROM projects WHERE id='p'");
 assert.equal(database.prepare('SELECT project_id FROM reports WHERE id=?').get('old').project_id,null);
 assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);database.close();
});
test('Projects persist, validate brand ownership and reject cross-owner access',async()=>{
 let v=await call('/profiles','POST',{name:'Example',market:'India'});assert.equal(v.status,201);profile=v.value.id;
 v=await call('/projects','POST',{name:'Launch research',profileId:profile,description:'Category investigation'});assert.equal(v.status,201);project=v.value.id;
 assert.equal((await call('/projects/'+project,'GET',undefined,'owner-b')).status,404);
 assert.equal((await call('/projects','POST',{name:'Intrusion',profileId:profile},'owner-b')).status,404);
 v=await call('/projects/'+project,'PATCH',{name:'Launch research revised',description:'Updated',profileId:profile});assert.equal(v.value.name,'Launch research revised');
 assert.equal((await call('/projects','POST',{name:'CSRF'},'owner-a',{Origin:'https://other.test'})).status,403);
});
test('Saved workflows validate real steps and preserve favorites',async()=>{
 let v=await call('/workflows','POST',{name:'Audit',input:inputs,steps});assert.equal(v.status,201);workflow=v.value.id;assert.equal(v.value.steps.length,2);
 v=await call('/workflows/'+workflow,'PATCH',{favorite:true});assert.equal(v.value.favorite,true);
 assert.equal((await call('/workflows','POST',{name:'Invalid',input:inputs,steps:[]})).status,400);
 assert.equal((await call('/workflows','POST',{name:'Invalid',input:inputs,steps:[{name:'Bad',template:'invented',question:'Question'}]})).status,400);
 assert.equal((await call('/workflows/'+workflow,'GET',undefined,'owner-b')).status,404);
});
test('Workflow runs persist, advance explicitly and carry prior findings into the next report',async()=>{
 let v=await call('/workflows/'+workflow+'/run','POST',{projectId:project});assert.equal(v.status,201);runId=v.value.id;assert.equal(v.value.reports.length,1);report=v.value.reports[0].id;
 assert.equal(v.value.reports[0].projectId,project);assert.equal(v.value.reports[0].profileId,profile);
 v=await call('/workflow-runs/'+runId);assert.equal(v.value.status,'ready');assert.equal(v.value.nextStep,1);assert.equal(v.value.reports.length,1,'GET must not launch the next step');
 // Editing the template cannot change the run's original steps.
 await call('/workflows/'+workflow,'PATCH',{name:'Changed template',input:inputs,steps:[steps[0]]});
 v=await call('/workflow-runs/'+runId+'/advance','POST',{});assert.equal(v.status,200);assert.equal(v.value.reports.length,2);
 v=await call('/workflow-runs/'+runId);assert.equal(v.value.status,'completed');assert.equal(v.value.steps.length,2);assert.match(v.value.reports[1].body,/prior evidence/);
 v=await call('/workflow-runs/'+runId+'/advance','POST',{});assert.equal(v.value.reports.length,2,'repeated advance after completion must not launch duplicates');
 assert.equal((await call('/workflow-runs/'+runId,'GET',undefined,'owner-b')).status,404);
});
test('Workflow step lease prevents duplicate launches while a step is still running',async()=>{
 let v=await call('/workflows/'+workflow+'/run','POST',{});const id=v.value.id;
 v=await call('/workflow-runs/'+id+'/advance','POST',{},'owner-a',{'x-fixture-hold':'true'});assert.equal(v.value.reports.length,1);
 const count=await db.prepare('SELECT count(*) AS n FROM reports WHERE workflow_run_id=?').bind(id).first();assert.equal(count.n,1);
 await db.prepare('UPDATE workflow_runs SET lease_until=? WHERE id=?').bind('2099-01-01T00:00:00Z',id).run();
 v=await call('/workflow-runs/'+id+'/advance','POST',{});assert.equal(v.value.status,'launching');
 assert.equal((await call('/workflow-runs/'+id+'/stop','POST',{})).status,409);
 await db.prepare('UPDATE workflow_runs SET lease_until=NULL WHERE id=?').bind(id).run();
});
test('Provider errors are saved and can be retried without losing the run',async()=>{
 let v=await call('/workflows/'+workflow+'/run','POST',{},'owner-a',{'x-fixture-fail':'true'});assert.equal(v.status,201);const id=v.value.id;assert.equal(v.value.status,'paused');assert.ok(v.value.error);
 v=await call('/workflow-runs/'+id+'/advance','POST',{retry:true});assert.equal(v.status,200);
 v=await call('/workflow-runs/'+id);assert.equal(v.value.status,'completed');
});
test('Stopping a workflow prevents subsequent paid launches',async()=>{
 let v=await call('/workflows/'+workflow+'/run','POST',{});const id=v.value.id;
 v=await call('/workflow-runs/'+id+'/stop','POST',{});assert.equal(v.status,200);
 assert.equal((await call('/workflow-runs/'+id+'/advance','POST',{})).status,400);
 assert.equal((await call('/workflow-runs/'+id)).value.status,'cancelled');
});
test('Report organization persists and cannot attach another owner project',async()=>{
 let v=await call('/reports/'+report,'PATCH',{favorite:true,labels:['pitch','India','pitch'],projectId:project,profileId:profile});assert.equal(v.status,200);assert.equal(v.value.favorite,true);assert.deepEqual(v.value.labels,['pitch','India']);
 const other=await call('/projects','POST',{name:'Other owner project'},'owner-b');
 assert.equal((await call('/reports/'+report,'PATCH',{projectId:other.value.id})).status,404);
 assert.equal((await call('/reports/'+report,'PATCH',{labels:['x'.repeat(41)]})).status,400);
 assert.equal((await call('/reports/'+report,'PATCH',{favorite:'yes'})).status,400);
 v=await call('/reports/'+report);assert.equal(v.value.favorite,true);assert.equal(v.value.projectId,project);
});
test('Deleting a project or workflow preserves completed reports and run snapshots',async()=>{
 assert.equal((await call('/projects/'+project,'DELETE')).status,200);
 let v=await call('/reports/'+report);assert.equal(v.status,200);assert.equal(v.value.projectId,null);assert.ok(v.value.body);
 assert.equal((await call('/workflows/'+workflow,'DELETE')).status,200);
 v=await call('/workflow-runs/'+runId);assert.equal(v.value.workflowId,null);assert.equal(v.value.status,'completed');assert.equal(v.value.steps.length,2);
 assert.equal((await call('')).value.projects.length,0);
});
let conversation,firstTurn;
test('A real conversation is independent of reports, brand-scoped and private',async()=>{
 let v=await call('/conversations','POST',{profileId:profile,mode:'strategy'});assert.equal(v.status,201);conversation=v.value.id;assert.equal(v.value.context.name,'Example');assert.equal(v.value.turns.length,0);
 assert.equal((await call('/conversations/'+conversation,'GET',undefined,'owner-b')).status,404);
 assert.equal((await call('/conversations','POST',{profileId:profile},'owner-b')).status,404);
 assert.equal((await call('/conversations','POST',{mode:'invented'})).status,400);
 const count=await db.prepare('SELECT count(*) AS n FROM reports WHERE owner=?').bind('owner-a').first();assert.equal(count.n,6);
});
test('Chat answers persist with citations and follow-ups receive prior conversation context',async()=>{
 let v=await call('/conversations/'+conversation+'/turns','POST',{question:'Remember our India audience',requestId:'chat-request-1'});assert.equal(v.status,201);firstTurn=v.value.id;assert.equal(v.value.status,'queued');assert.equal(v.value.responseId,undefined);
 v=await call('/conversations/'+conversation);assert.equal(v.value.turns[0].status,'completed');assert.equal(v.value.turns[0].sources.length,1);assert.equal(v.value.title,'Remember our India audience');
 v=await call('/conversations/'+conversation+'/turns','POST',{question:'What did we discuss?',requestId:'chat-request-2'});assert.equal(v.status,201);
 v=await call('/conversations/'+conversation);assert.equal(v.value.turns.length,2);assert.match(v.value.turns[1].body,/remembers prior India audience/);
 const found=await call('/conversations?q=audience');assert.ok(found.value.items.some(c=>c.id===conversation));
 const other=await call('/conversations?q=audience','GET',undefined,'owner-b');assert.equal(other.value.items.length,0);
});
test('Chat request IDs prevent duplicate paid launches and cannot cross conversations',async()=>{
 const before=await db.prepare('SELECT count(*) AS n FROM conversation_turns WHERE owner=?').bind('owner-a').first();
 const v=await call('/conversations/'+conversation+'/turns','POST',{question:'Remember our India audience',requestId:'chat-request-1'});assert.equal(v.value.id,firstTurn);
 const after=await db.prepare('SELECT count(*) AS n FROM conversation_turns WHERE owner=?').bind('owner-a').first();assert.equal(after.n,before.n);
 const other=await call('/conversations','POST',{mode:'research'});
 assert.equal((await call('/conversations/'+other.value.id+'/turns','POST',{question:'Hello',requestId:'chat-request-1'})).status,409);
});
test('Chat rejects foreign files and blocks additional turns until the current answer finishes',async()=>{
 await db.prepare('INSERT INTO attachments (id,owner,name,key,bytes,created) VALUES (?,?,?,?,?,?)').bind('foreign-context','owner-b','File.txt','context/other/file',5,new Date().toISOString()).run();
 assert.equal((await call('/conversations/'+conversation+'/turns','POST',{question:'Read this',requestId:'foreign-file-request',attachmentIds:['foreign-context']})).status,404);
 const v=await call('/conversations/'+conversation+'/turns','POST',{question:'Investigate this brand',requestId:'pending-chat'});assert.equal(v.value.status,'queued');
 assert.equal((await call('/conversations/'+conversation+'/turns','POST',{question:'Second overlapping question',requestId:'overlap'})).status,429);
 assert.equal((await call('/conversations/'+conversation,'DELETE')).status,409);
 assert.equal((await call('/conversations/'+conversation+'/cancel','POST',{turnId:v.value.id},'owner-b')).status,404);
 const stopped=await call('/conversations/'+conversation+'/cancel','POST',{turnId:v.value.id});assert.equal(stopped.value.status,'cancelled');
 const state=await call('/conversations/'+conversation);assert.equal(state.value.turns.at(-1).status,'cancelled');
});
test('Chat provider failures remain visible and retry creates an inspectable new answer',async()=>{
 let v=await call('/conversations/'+conversation+'/turns','POST',{question:'A question after failure',requestId:'failed-chat'},'owner-a',{'x-fixture-fail':'true'});assert.equal(v.status,201);assert.equal(v.value.status,'failed');const failed=v.value.id;
 v=await call('/conversations/'+conversation+'/retry','POST',{turnId:failed,requestId:'retry-chat'});assert.equal(v.status,201);assert.notEqual(v.value.id,failed);
 v=await call('/conversations/'+conversation);assert.equal(v.value.turns.at(-1).status,'completed');
});
test('Chat quotas survive conversation deletion and duplicate requests do not consume quota again',async()=>{
 const owner='quota-owner';const date=new Date().toISOString().slice(0,10);const usageId=owner+':'+date;
 const c=await call('/conversations','POST',{mode:'research'},owner);
 await call('/conversations/'+c.value.id+'/turns','POST',{question:'Question',requestId:'quota-first'},owner);
 const usage=await db.prepare('SELECT turns FROM conversation_usage WHERE id=?').bind(usageId).first();assert.equal(usage.turns,1);
 await call('/conversations/'+c.value.id);await call('/conversations/'+c.value.id+'/turns','POST',{question:'Question',requestId:'quota-first'},owner);
 assert.equal((await db.prepare('SELECT turns FROM conversation_usage WHERE id=?').bind(usageId).first()).turns,1);
 await call('/conversations/'+c.value.id,'GET',undefined,owner);assert.equal((await call('/conversations/'+c.value.id,'DELETE',undefined,owner)).status,200);
 await db.prepare('UPDATE conversation_usage SET turns=40 WHERE id=?').bind(usageId).run();
 const next=await call('/conversations','POST',{},owner);assert.equal((await call('/conversations/'+next.value.id+'/turns','POST',{question:'Over quota',requestId:'quota-over'},owner)).status,429);
});
test('Conversation rename, pagination validation and deletion work without changing reports',async()=>{
 assert.equal((await call('/conversations/'+conversation,'PATCH',{title:'Saved strategic discussion'})).status,200);
 assert.equal((await call('/conversations/'+conversation)).value.title,'Saved strategic discussion');
 assert.equal((await call('/conversations?offset=-1')).status,400);
 assert.equal((await call('/conversations/'+conversation,'DELETE')).status,200);
 assert.equal((await call('/conversations/'+conversation)).status,404);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM conversation_turns WHERE conversation_id=?').bind(conversation).first()).n,0);
});
test('Conversation search treats wildcard characters literally and paginates older chats',async()=>{
 const owner='history-owner',time=new Date().toISOString();
 for(let i=0;i<22;i++)await db.prepare('INSERT INTO conversations (id,owner,title,mode,created,updated) VALUES (?,?,?,?,?,?)').bind('history-'+String(i).padStart(2,'0'),owner,i===0?'50% growth':'Saved chat '+i,'strategy',time,time).run();
 let v=await call('/conversations','GET',undefined,owner);assert.equal(v.value.items.length,20);assert.equal(v.value.nextOffset,20);
 const first=v.value.items.map(c=>c.id);v=await call('/conversations?offset='+v.value.nextOffset,'GET',undefined,owner);assert.equal(v.value.items.length,2);assert.equal(v.value.nextOffset,null);assert.ok(v.value.items.every(c=>!first.includes(c.id)));
 v=await call('/conversations?q=%25','GET',undefined,owner);assert.equal(v.value.items.length,1);assert.equal(v.value.items[0].title,'50% growth');
});
test('The reference workflow catalog runs directly, saves favorites and rejects unconnected datasets',async()=>{
 let v=await call('/workflow-catalog/four-cs','PATCH',{favorite:true});assert.equal(v.status,200);assert.ok((await call('')).value.catalogFavorites.includes('four-cs'));
 assert.equal((await call('','GET',undefined,'owner-b')).value.catalogFavorites.length,0);
 v=await call('/workflow-catalog/four-cs/run','POST',{profileId:profile,input:{subject:'Example',context:'Launch brief'}});assert.equal(v.status,201);assert.equal(v.value.steps[1].name,'Consumer and culture');assert.equal(v.value.workflowId,null);
 assert.equal((await call('/workflow-catalog/brand-social-sentiment/run','POST',{})).status,503);
 assert.equal((await call('/workflow-catalog/unknown/run','POST',{})).status,404);
 await call('/workflow-catalog/four-cs','PATCH',{favorite:false});assert.equal((await call('')).value.catalogFavorites.length,0);
});
test('Conversation creation request IDs survive retries without duplicating conversations',async()=>{
 const owner='new-chat-owner';
 const first=await call('/conversations','POST',{requestId:'creation-once'},owner);assert.equal(first.status,201);
 const duplicate=await call('/conversations','POST',{requestId:'creation-once'},owner);assert.equal(duplicate.value.id,first.value.id);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM conversations WHERE owner=?').bind(owner).first()).n,1);
 assert.equal((await call('/conversations','POST',{requestId:'creation-once'},'another-owner')).status,409);
});
test('Project and persona context are snapshotted, agent choices persist per answer and retries preserve them',async()=>{
 const owner='persona-owner';
 const brand=await call('/profiles','POST',{name:'Commuter Brand',market:'India',context:'Original brand evidence'},owner);
 const project=await call('/projects','POST',{name:'Commuter research',profileId:brand.value.id},owner);
 const persona={name:'Urban commuter',description:'Needs a reliable first electric scooter within a modest budget.'};
 let result=await call('/conversations','POST',{projectId:project.value.id,persona},owner);assert.equal(result.status,201);const chat=result.value.id;
 assert.equal(result.value.profileId,brand.value.id);assert.equal(result.value.projectId,project.value.id);assert.deepEqual(result.value.persona,persona);
 assert.equal((await call('/conversations','POST',{persona:{name:'Incomplete'}},owner)).status,400);
 assert.equal((await call('/conversations','POST',{projectId:project.value.id},'intruder')).status,404);
 await db.prepare('UPDATE profiles SET context=? WHERE id=?').bind('Changed evidence',brand.value.id).run();
 result=await call('/conversations/'+chat+'/turns','POST',{question:'What concerns might this audience have?',mode:'research',requestId:'persona-question'},owner);assert.equal(result.value.mode,'research');
 let inspection=await (await runtime.dispatchFetch(origin+'/fixture')).json();assert.match(inspection.input,/Urban commuter/);assert.match(inspection.input,/Original brand evidence/);assert.doesNotMatch(inspection.input,/Changed evidence/);assert.match(inspection.input,/not representative research or actual interview evidence/);
 await call('/conversations/'+chat,'GET',undefined,owner);
 result=await call('/conversations/'+chat+'/turns','POST',{question:'Pressure test the positioning',mode:'strategy',requestId:'strategy-question'},owner);assert.equal(result.value.mode,'strategy');
 result=await call('/conversations/'+chat,'GET',undefined,owner);assert.equal(result.value.turns[0].mode,'research');assert.equal(result.value.turns[1].mode,'strategy');
 result=await call('/conversations/'+chat+'/turns','POST',{question:'Interrupted research',mode:'research',requestId:'interrupted-persona'},owner,{'x-fixture-fail':'true'});const failed=result.value.id;assert.equal(result.value.status,'failed');
 await call('/conversations/'+chat+'/turns','POST',{question:'A strategy question',mode:'strategy',requestId:'later-strategy'},owner);await call('/conversations/'+chat,'GET',undefined,owner);
 result=await call('/conversations/'+chat+'/retry','POST',{turnId:failed,requestId:'retry-original-agent'},owner);assert.equal(result.value.mode,'research');
 await call('/conversations/'+chat,'GET',undefined,owner);
 await call('/conversations/'+chat,'PATCH',{favorite:true},owner);
 result=await call('/conversations?favorite=true&project='+project.value.id,'GET',undefined,owner);assert.equal(result.value.items.length,1);assert.equal(result.value.items[0].id,chat);
 await call('/projects/'+project.value.id,'DELETE',undefined,owner);result=await call('/conversations/'+chat,'GET',undefined,owner);assert.equal(result.status,200);assert.equal(result.value.projectId,null);assert.equal(result.value.persona.name,persona.name);
});
test('Earlier chat messages paginate with stable owner-scoped cursors beyond the latest 100',async()=>{
 const owner='long-chat-owner',chat=(await call('/conversations','POST',{mode:'research'},owner)).value.id,time=new Date().toISOString();
 for(let i=0;i<123;i++)await db.prepare("INSERT INTO conversation_turns (id,owner,conversation_id,request_id,question,status,body,created,updated) VALUES (?,?,?,?,?,'completed',?,?,?)").bind('long-turn-'+i,owner,chat,'long-request-'+i,'Question '+i,'Answer '+i,time,time).run();
 let result=await call('/conversations/'+chat,'GET',undefined,owner);assert.equal(result.value.turns.length,100);assert.equal(result.value.turns[0].question,'Question 23');assert.equal(result.value.hasOlder,true);assert.equal(result.value.turns[0].mode,'research','pre-migration answers inherit their original conversation agent');
 const cursor=result.value.oldestCursor;
 result=await call('/conversations/'+chat+'/turns?before='+cursor,'GET',undefined,owner);assert.equal(result.value.turns.length,23);assert.equal(result.value.turns[0].question,'Question 0');assert.equal(result.value.turns.at(-1).question,'Question 22');assert.equal(result.value.hasOlder,false);
 assert.equal((await call('/conversations/'+chat+'/turns?before='+cursor,'GET',undefined,'intruder')).status,404);
 const other=(await call('/conversations','POST',{},owner)).value.id;
 assert.equal((await call('/conversations/'+other+'/turns?before='+cursor,'GET',undefined,owner)).status,404);
});
test('Workflow defaults retain owned brand, project, files and ordered editable steps',async()=>{
 const owner='default-workflow-owner';
 const brand=(await call('/profiles','POST',{name:'Saved Brand',market:'India',context:'Brand background'},owner)).value;
 const project=(await call('/projects','POST',{name:'Saved Project',profileId:brand.id},owner)).value;
 const attachmentId='saved-workflow-file';await db.prepare('INSERT INTO attachments (id,owner,name,key,bytes,created) VALUES (?,?,?,?,?,?)').bind(attachmentId,owner,'Brief.txt','fixture/brief',13,new Date().toISOString()).run();await (await runtime.getR2Bucket('BUCKET')).put('fixture/brief','Evidence file');
 const defaults={...inputs,profileId:brand.id,projectId:project.id,attachmentIds:[attachmentId],context:'Campaign goals',audience:'Urban audience',competitors:'Public competitors',window:'Last 30 days'};
 let result=await call('/workflows','POST',{name:'Owned defaults',input:defaults,steps:[steps[1],steps[0]]},owner);assert.equal(result.status,201);const template=result.value;
 assert.equal(template.input.profileId,brand.id);assert.equal(template.input.projectId,project.id);assert.deepEqual(template.input.attachmentIds,[attachmentId]);assert.equal(template.steps[0].name,'Opportunities');
 result=await call('/workflows/'+template.id+'/run','POST',{requestId:'workflow-start-once'},owner);assert.equal(result.status,201);const run=result.value;
 assert.equal(run.profileId,brand.id);assert.equal(run.projectId,project.id);assert.equal(run.input.subject,'Saved Brand');assert.match(run.input.context,/Brand background/);assert.match(run.input.context,/Campaign goals/);assert.deepEqual(run.input.attachmentIds,[attachmentId]);
 const duplicate=await call('/workflows/'+template.id+'/run','POST',{requestId:'workflow-start-once'},owner);assert.equal(duplicate.value.id,run.id);assert.equal(duplicate.value.reports.length,1);
 assert.equal((await call('/workflows','POST',{name:'Foreign defaults',input:defaults,steps},'intruder')).status,404);
});
test('Expected step guards prevent delayed requests from launching extra workflow research',async()=>{
 const owner='advance-guard-owner';
 let result=await call('/workflow-catalog/brand-audit/run','POST',{requestId:'guard-run',input:{subject:'Guard brand'}},owner);assert.equal(result.status,201);const run=result.value.id;
 result=await call('/workflow-runs/'+run,'GET',undefined,owner);assert.equal(result.value.nextStep,1);
 const request={expectedStep:1,expectedReportId:null};
 result=await call('/workflow-runs/'+run+'/advance','POST',request,owner);assert.equal(result.value.reports.length,2);
 result=await call('/workflow-runs/'+run,'GET',undefined,owner);assert.equal(result.value.nextStep,2);
 result=await call('/workflow-runs/'+run+'/advance','POST',request,owner);assert.equal(result.value.reports.length,2,'replaying step 1 must not launch step 2');
 assert.equal((await call('/workflow-runs/'+run+'/advance','POST',{expectedStep:-1},owner)).status,400);
 result=await call('/workflow-runs/'+run+'/advance','POST',{expectedStep:2,expectedReportId:null},owner);assert.equal(result.value.reports.length,3);
 result=await call('/workflow-runs/'+run,'GET',undefined,owner);assert.equal(result.value.status,'completed');
 const rerun=await call('/workflow-runs/'+run+'/rerun','POST',{requestId:'rerun-once'},owner);assert.equal(rerun.status,201);assert.equal(rerun.value.steps.length,3);assert.equal(rerun.value.input.subject,'Guard brand');assert.notEqual(rerun.value.id,run);
 assert.equal((await call('/workflow-runs/'+run+'/rerun','POST',{requestId:'rerun-once'},owner)).value.id,rerun.value.id);
});
test('Retry guards retain failed attempts and cannot repeat the same paid retry',async()=>{
 const owner='retry-guard-owner';
 let result=await call('/workflow-catalog/four-cs/run','POST',{input:{subject:'Retry brand'}},owner,{'x-fixture-fail':'true'});const run=result.value.id,failed=result.value.reports[0].id;
 const retry={retry:true,expectedStep:0,expectedReportId:failed};
 result=await call('/workflow-runs/'+run+'/advance','POST',retry,owner,{'x-fixture-fail':'true'});assert.equal(result.status,500);
 result=await call('/workflow-runs/'+run,'GET',undefined,owner);assert.equal(result.value.attempts.length,2);assert.equal(result.value.reports.length,1);assert.notEqual(result.value.reports[0].id,failed);
 const replay=await call('/workflow-runs/'+run+'/advance','POST',retry,owner);assert.equal(replay.status,200);assert.equal(replay.value.attempts.length,2);
});

async function tick(extra={}){
 const r=await runtime.dispatchFetch(origin+'/api/monitor-tick',{method:'POST',headers:{Authorization:'Bearer fixture-runner-only',...extra},body:'{}'});
 return {status:r.status,value:await r.json()};
}
test('Cloud runner launches a due scan once, persists it and schedules the next weekly occurrence',async()=>{
 const owner='monitor-qa';const created=await call('/monitors','POST',{name:'Weekly QA',input:inputs,cadence:'weekly'},owner);
 assert.equal(created.status,201);const id=created.value.id;
 const first=await tick();assert.equal(first.status,200);
 let rule=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first();
 assert.ok(rule.last_report);assert.ok(rule.next_run>new Date().toISOString());assert.equal(rule.error,'');
 let report=await db.prepare('SELECT * FROM reports WHERE id=?').bind(rule.last_report).first();assert.equal(report.monitor_due,created.value.next_run);assert.equal(report.status,'completed');
 await tick();assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE monitor_id=?').bind(id).first()).n,1);
 // Simulate an interrupted acknowledgement after the report was already saved.
 await db.prepare('UPDATE monitors SET next_run=?,lease_until=NULL WHERE id=?').bind(created.value.next_run,id).run();
 await tick();rule=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(id).first();assert.equal(rule.last_report,report.id);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE monitor_id=?').bind(id).first()).n,1);
 await call('/monitors/'+id,'PATCH',{enabled:false},owner);
 await db.prepare('UPDATE monitors SET next_run=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',id).run();
 await tick();assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE monitor_id=?').bind(id).first()).n,1);
});
test('Concurrent runner retries reserve one occurrence; provider failures are visible and not billed again',async()=>{
 const owner='monitor-concurrent';const created=await call('/monitors','POST',{name:'Concurrent QA',input:inputs,cadence:'daily'},owner);const id=created.value.id;
 await Promise.all([tick(),tick()]);assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE monitor_id=?').bind(id).first()).n,1);
 await call('/monitors/'+id,'PATCH',{enabled:false},owner);
 const failed=await call('/monitors','POST',{name:'Failure QA',input:inputs,cadence:'weekly'},'monitor-failure');
 await tick({'x-fixture-fail':'true'});
 const rule=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(failed.value.id).first();assert.ok(rule.error);assert.ok(rule.last_report);
 assert.equal((await db.prepare('SELECT status FROM reports WHERE id=?').bind(rule.last_report).first()).status,'failed');
 await tick();assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE monitor_id=?').bind(rule.id).first()).n,1);
 await call('/monitors/'+rule.id,'PATCH',{enabled:false},'monitor-failure');
});

test('All-brand opt-in enrolls current and future brands once and honors individual pause and workspace opt-out',async()=>{
 const owner='monitor-brands';
 const first=await call('/profiles','POST',{name:'First',context:'Public brand context.'},owner);assert.equal(first.status,201);
 const foreign=await call('/profiles','POST',{name:'Private other brand'},'monitor-other');assert.equal(foreign.status,201);
 assert.equal((await call('/monitors/all-brands','POST',{enabled:true},owner)).value.count,1);
 assert.equal((await call('/monitors/all-brands','POST',{enabled:true},owner)).value.count,1);
 const second=await call('/profiles','POST',{name:'Second'},owner);assert.equal(second.status,201);
 let rules=(await db.prepare('SELECT * FROM monitors WHERE owner=?').bind(owner).all()).results;
 assert.equal(rules.length,2);assert.ok(rules.every(r=>r.cadence==='weekly'&&JSON.parse(r.input).market==='India'&&JSON.parse(r.input).profileId===r.managed_profile_id));
 assert.equal((await db.prepare('SELECT count(*) AS n FROM monitors WHERE managed_profile_id=?').bind(foreign.value.id).first()).n,0);
 const paused=rules[0];assert.equal((await call('/monitors/'+paused.id,'PATCH',{enabled:false},owner)).status,200);
 await tick();assert.equal((await db.prepare('SELECT enabled FROM monitors WHERE id=?').bind(paused.id).first()).enabled,0);
 assert.equal((await call('/monitors/'+paused.id,'PATCH',{enabled:true},'monitor-other')).status,404);
 assert.equal((await call('/monitors/all-brands','POST',{enabled:false},owner)).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM monitors WHERE owner=? AND enabled=1').bind(owner).first()).n,0);
 await call('/profiles','POST',{name:'Not opted in'},owner);assert.equal((await db.prepare('SELECT count(*) AS n FROM monitors WHERE owner=?').bind(owner).first()).n,2);
 assert.equal((await call('/profiles/'+first.value.id,'DELETE',undefined,owner)).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM monitors WHERE managed_profile_id=?').bind(first.value.id).first()).n,0);
});
test('Quota exhaustion leaves monitoring retryable without bypassing the allowance',async()=>{
 const owner='monitor-quota';
 for(let i=0;i<8;i++){const r=await call('/reports','POST',inputs,owner);assert.equal(r.status,201);await call('/reports/'+r.value.id,'GET',undefined,owner);}
 const created=await call('/monitors','POST',{name:'Quota QA',input:inputs,cadence:'weekly'},owner);await tick();
 const rule=await db.prepare('SELECT * FROM monitors WHERE id=?').bind(created.value.id).first();assert.match(rule.error,/8 per day/);assert.ok(rule.lease_until>new Date().toISOString());assert.equal(rule.next_run,created.value.next_run);assert.equal(rule.last_report,null);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE owner=?').bind(owner).first()).n,8);
 await call('/monitors/'+rule.id,'PATCH',{enabled:false},owner);
});

async function uploadFixture(owner,name,bytes,extra={}){
 const form=new FormData();form.append('file',new File([bytes],name));for(const [k,v]of Object.entries(extra))form.append(k,v);
 const encoded=new Request(origin+'/api/workspace/attachments',{method:'POST',body:form});
 const r=await runtime.dispatchFetch(encoded.url,{method:'POST',headers:{Origin:origin,'Content-Type':encoded.headers.get('content-type'),'x-fixture-owner':owner},body:await encoded.arrayBuffer()});return {status:r.status,value:await r.json()};
}
test('PDF and DOCX uploads extract actual text in the Worker, keep original bytes and isolate owners',async()=>{
 const owner='files-qa';
 const project=await call('/projects','POST',{name:'Files project'},owner);assert.equal(project.status,201);
 for(const [name,bytes,marker]of [['Brief.pdf',pdfFixture(),'[Page 1]'],['Brief.docx',docxFixture(),'[Paragraph 2]']]){
  const uploaded=await uploadFixture(owner,name,bytes,{projectId:project.value.id});assert.equal(uploaded.status,201,JSON.stringify(uploaded.value));
  assert.ok(uploaded.value.text_chars>0);assert.equal(uploaded.value.project_id,project.value.id);assert.equal(uploaded.value.key,undefined);
  const id=uploaded.value.id;const preview=await call('/attachments/'+id,'GET',undefined,owner);assert.equal(preview.status,200);assert.match(preview.value.text,/Budget INR 240000/);assert.ok(preview.value.text.includes(marker));
  if(name.endsWith('docx'))assert.match(preview.value.text,/भारत/);
  assert.equal((await call('/attachments/'+id,'GET',undefined,'files-other')).status,404);
  const downloaded=await runtime.dispatchFetch(origin+'/api/workspace/attachments/'+id+'/download',{headers:{'x-fixture-owner':owner}});assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()),bytes);
  const chat=await call('/conversations','POST',{},owner);const answer=await call('/conversations/'+chat.value.id+'/turns','POST',{question:'What is in the brief?',requestId:crypto.randomUUID(),attachmentIds:[id]},owner);assert.equal(answer.status,201);
  const inspect=await(await runtime.dispatchFetch(origin+'/fixture')).json();assert.match(inspect.input,/Budget INR 240000/);assert.ok(inspect.input.includes(marker));
  assert.equal((await call('/attachments/'+id,'PATCH',{archived:true},owner)).status,200);
  assert.equal((await call('/attachments/'+id,'PATCH',{archived:false},'files-other')).status,404);
  const blocked=await call('/reports','POST',{...inputs,attachmentIds:[id]},owner);assert.equal(blocked.status,400);assert.match(blocked.value.error,/archived/);
  assert.equal((await call('/attachments/'+id,'PATCH',{archived:false,name:'Renamed brief'},owner)).status,200);
 }
 assert.equal((await call('/projects/'+project.value.id,'DELETE',undefined,owner)).status,200);
 const files=await call('/attachments','GET',undefined,owner);assert.equal(files.value.length,2);assert.ok(files.value.every(f=>f.project_id===null));
});
test('Files reject malformed, unreadable and oversized inputs without leaving records or exposing foreign associations',async()=>{
 const owner='files-invalid';
 assert.equal((await uploadFixture(owner,'fake.pdf','not a PDF')).status,400);
 assert.equal((await uploadFixture(owner,'bad.docx','not a ZIP')).status,400);
 assert.equal((await uploadFixture(owner,'old.doc','binary')).status,400);
 assert.equal((await uploadFixture(owner,'scan.pdf',pdfFixture([]))).status,400);
 assert.equal((await uploadFixture(owner,'too-large.txt','x'.repeat(5000001))).status,413);
 assert.equal((await uploadFixture(owner,'complex.docx',docxFixture('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><w:p><w:r><w:t>&secret;</w:t></w:r></w:p>'))).status,400);
 const foreign=await call('/projects','POST',{name:'Foreign'},'files-other');assert.equal((await uploadFixture(owner,'brief.txt','safe',{projectId:foreign.value.id})).status,404);
 assert.equal((await call('/attachments','GET',undefined,owner)).value.length,0);
 const good=await uploadFixture(owner,'notes.md','Budget INR 240000\nOnly supplied context');assert.equal(good.status,201);
 await call('/attachments/'+good.value.id,'PATCH',{archived:true},owner);
 assert.equal((await call('/attachments','GET',undefined,owner)).value.length,0);
 assert.equal((await call('/attachments?archived=true','GET',undefined,owner)).value.length,1);
});

const pitchBrief={name:'Amber launch pitch',client:'Fictional Amber',market:'India',brief:'Fictional RFP: launch a coffee brand. Budget is INR 240000.',requirements:'A requirement-to-evidence matrix and three distinct pitch angles.',goals:'Prepare a defensible positioning recommendation.',budget:'INR 240000',deadline:'2026-11-30',attachmentIds:[]};

test('Pitch briefs retain agency snapshots, protect concurrent edits and restore earlier playbooks without losing history',async()=>{
 const owner='pitch-revisions';const agency=await call('/agencies','POST',{name:'QA agency',credentials:'Research and strategy',proof:'Fictional case study, not a customer claim'},owner);assert.equal(agency.status,201);
 const created=await call('/pitches','POST',{input:{...pitchBrief,agencyId:agency.value.id},requestId:'pitch-create-qa'},owner);assert.equal(created.status,201,JSON.stringify(created.value));const pitch=created.value;
 assert.match(pitch.body,/no AI research/);assert.equal(pitch.revision,1);assert.equal((await call('/pitches','POST',{input:pitchBrief,requestId:pitch.id},owner)).value.id,pitch.id);
 await call('/agencies/'+agency.value.id,'PATCH',{name:'QA agency',credentials:'Updated capabilities',proof:'Updated proof',expectedRevision:1},owner);
 const snapshot=await call('/pitches/'+pitch.id,'GET',undefined,owner);assert.equal(snapshot.value.agency.credentials,'Research and strategy');
 const edits=await Promise.all([call('/pitches/'+pitch.id,'PATCH',{expectedRevision:1,body:'# Edited angle A'},owner),call('/pitches/'+pitch.id,'PATCH',{expectedRevision:1,body:'# Edited angle B'},owner)]);assert.deepEqual(edits.map(e=>e.status).sort(),[200,409]);
 let saved=(await call('/pitches/'+pitch.id,'GET',undefined,owner)).value;assert.equal(saved.revision,2);assert.equal(saved.versions.length,2);
 const initial=saved.versions.find(v=>v.revision===1);const restored=await call('/pitches/'+pitch.id+'/restore','POST',{expectedRevision:2,versionId:initial.id},owner);assert.equal(restored.status,200);assert.equal(restored.value.revision,3);assert.equal(restored.value.body,pitch.body);assert.equal(restored.value.agency.credentials,'Research and strategy');
 const refreshed=await call('/pitches/'+pitch.id,'PATCH',{expectedRevision:3,refreshAgency:true},owner);assert.equal(refreshed.status,200);assert.equal(refreshed.value.agency.credentials,'Updated capabilities');
 assert.equal((await call('/pitches/'+pitch.id,'PATCH',{expectedRevision:3,body:'stale'},owner)).status,409);
 assert.equal((await call('/pitches/'+pitch.id,'GET',undefined,'pitch-other')).status,404);
 assert.equal((await call('/pitches/'+pitch.id+'/versions/'+initial.id,'GET',undefined,'pitch-other')).status,404);
 assert.equal((await call('/agencies/'+agency.value.id,'PATCH',{...agency.value,expectedRevision:2},'pitch-other')).status,404);
});

test('Pitch research snapshots its brief and files, preserves client context and imports cited output only on request',async()=>{
 const owner='pitch-research';const profile=await call('/profiles','POST',{name:'Different saved brand',market:'Global'},owner);
 const project=await call('/projects','POST',{name:'Pitch project',profileId:profile.value.id},owner);
 const file=await uploadFixture(owner,'pitch-brief.pdf',pdfFixture());assert.equal(file.status,201);
 const agency=await call('/agencies','POST',{name:'Agency evidence',credentials:'Agency snapshot A'},owner);
 const created=await call('/pitches','POST',{input:{...pitchBrief,agencyId:agency.value.id,attachmentIds:[file.value.id]},projectId:project.value.id},owner);assert.equal(created.status,201);
 const id=created.value.id;const requestId='pitch-research-unique';const launches=await Promise.all([call('/pitches/'+id+'/research','POST',{requestId},owner),call('/pitches/'+id+'/research','POST',{requestId},owner)]);assert.ok(launches.every(r=>r.status===201),JSON.stringify(launches));
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE owner=?').bind(owner).first()).n,1);
 const inspection=await(await runtime.dispatchFetch(origin+'/fixture')).json();assert.match(inspection.input,/Fictional Amber/);assert.match(inspection.input,/Agency snapshot A/);assert.match(inspection.input,/\[Page 1\]/);assert.match(inspection.input,/240000/);
 const run=(await call('/workflow-runs/'+requestId,'GET',undefined,owner)).value;assert.equal(run.status,'completed');assert.equal(run.pitchId,id);assert.equal(run.input.subject,'Fictional Amber');assert.equal(run.input.market,'India');
 let pitch=(await call('/pitches/'+id,'GET',undefined,owner)).value;assert.equal(pitch.revision,1);assert.equal(pitch.sources.length,0,'No automatic draft replacement.');
 const imported=await call('/pitches/'+id+'/import','POST',{runId:requestId,expectedRevision:1},owner);assert.equal(imported.status,200,JSON.stringify(imported.value));assert.equal(imported.value.revision,2);assert.equal(imported.value.sources[0].url,'https://example.com/source');
 assert.equal((await call('/pitches/'+id+'/import','POST',{runId:requestId,expectedRevision:1},owner)).status,409);
 const another=await call('/pitches','POST',{input:pitchBrief},owner);assert.equal((await call('/pitches/'+another.value.id+'/import','POST',{runId:requestId,expectedRevision:1},owner)).status,404);
 assert.equal((await call('/pitches/'+id+'/research','POST',{requestId},'pitch-other')).status,404);
 const other=await call('/pitches','POST',{input:pitchBrief},'pitch-other');assert.equal((await call('/pitches/'+other.value.id+'/research','POST',{requestId},'pitch-other')).status,409);
 assert.equal((await call('/projects/'+project.value.id,'DELETE',undefined,owner)).status,200);assert.equal((await call('/pitches/'+id,'GET',undefined,owner)).value.projectId,null);
});

test('Pitch validation rejects bad dates, inaccessible/archived context and unqualified research imports',async()=>{
 const owner='pitch-validation';for(const deadline of ['tomorrow','2026-02-30','2026-99-99']){assert.equal((await call('/pitches','POST',{input:{...pitchBrief,deadline}},owner)).status,400);}
 const foreign=await call('/agencies','POST',{name:'Private',credentials:'Private credentials'},'pitch-other');assert.equal((await call('/pitches','POST',{input:{...pitchBrief,agencyId:foreign.value.id}},owner)).status,404);
 const agency=await call('/agencies','POST',{name:'Archived',credentials:'Old'},owner);await call('/agencies/'+agency.value.id,'PATCH',{...agency.value,expectedRevision:1,archived:true},owner);assert.equal((await call('/pitches','POST',{input:{...pitchBrief,agencyId:agency.value.id}},owner)).status,400);
 const file=await uploadFixture(owner,'notes.txt','Brief data');await call('/attachments/'+file.value.id,'PATCH',{archived:true},owner);assert.equal((await call('/pitches','POST',{input:{...pitchBrief,attachmentIds:[file.value.id]}},owner)).status,400);
 const created=await call('/pitches','POST',{input:pitchBrief},owner);const id=created.value.id;
 const failed=await call('/pitches/'+id+'/research','POST',{requestId:'pitch-failed'},owner,{'x-fixture-terminal':'incomplete'});assert.equal(failed.status,201);
 const imported=await call('/pitches/'+id+'/import','POST',{runId:'pitch-failed',expectedRevision:1},owner);assert.equal(imported.status,409);assert.equal((await call('/pitches/'+id,'GET',undefined,owner)).value.revision,1);
 await call('/pitches/'+id,'PATCH',{expectedRevision:1,archived:true},owner);assert.equal((await call('/pitches/'+id+'/research','POST',{requestId:'pitch-archived'},owner)).status,400);
});

test('Pitch research honors report quotas and retries retain the original launch snapshot',async()=>{
 const owner='pitch-quota';for(let i=0;i<8;i++){const r=await call('/reports','POST',inputs,owner);await call('/reports/'+r.value.id,'GET',undefined,owner);}
 const created=await call('/pitches','POST',{input:pitchBrief},owner);const id=created.value.id;
 const result=await call('/pitches/'+id+'/research','POST',{requestId:'pitch-quota-retry'},owner);assert.equal(result.status,201);assert.equal(result.value.status,'paused');assert.match(result.value.error,/8 per day/);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE owner=?').bind(owner).first()).n,8);
 await call('/pitches/'+id,'PATCH',{expectedRevision:1,input:{...pitchBrief,brief:'Different brief after launch'}},owner);
 await call('/pitches/'+id+'/research','POST',{requestId:'pitch-quota-retry'},owner);
 const run=await db.prepare('SELECT input FROM workflow_runs WHERE id=?').bind('pitch-quota-retry').first();assert.match(JSON.parse(run.input).context,/coffee brand/);assert.doesNotMatch(JSON.parse(run.input).context,/Different brief after launch/);
});

test('A long multilingual pitch revision survives browser-sized UTF-8 request headers without accepting forged source links',async()=>{
 const owner='pitch-unicode';const pitch=await call('/pitches','POST',{input:pitchBrief},owner);const value={expectedRevision:1,body:'भारत '.repeat(5000),sources:[{url:'https://unverified.example',title:'Forged evidence'}]};
 const saved=await call('/pitches/'+pitch.value.id,'PATCH',value,owner,{'Content-Length':String(Buffer.byteLength(JSON.stringify(value)))});assert.equal(saved.status,200,JSON.stringify(saved.value));assert.equal(saved.value.body,value.body.trim());assert.deepEqual(saved.value.sources,[]);
});

test('Monitoring snapshots the previous completed owned occurrence, supplies it to research and preserves it across later metadata changes',async()=>{
 const owner='comparison-owner',created=await call('/monitors','POST',{name:'Comparison QA',input:inputs,cadence:'weekly'},owner),monitorId=created.value.id;
 await db.prepare('UPDATE monitors SET next_run=? WHERE id=?').bind('2026-01-01T00:00:00.000Z',monitorId).run();
 const first=(await call('/monitors/run-due','POST',{},owner)).value.results[0];let baseline=(await call('/reports/'+first.reportId,'GET',undefined,owner)).value;assert.equal(baseline.monitorComparison.state,'first');
 await db.prepare('UPDATE reports SET body=?,sources=? WHERE id=?').bind('Owned earlier briefing evidence',JSON.stringify([{url:'https://example.com/prior',title:'Earlier evidence'}]),baseline.id).run();
 for(const [status,day]of [['failed','05'],['in_progress','06']]){const r=await call('/reports','POST',inputs,owner);await db.prepare('UPDATE reports SET monitor_id=?,monitor_due=?,status=? WHERE id=?').bind(monitorId,'2026-01-'+day+'T00:00:00.000Z',status,r.value.id).run();}
 const foreign=await call('/reports','POST',inputs,'comparison-foreign');await db.prepare("UPDATE reports SET monitor_id=?,monitor_due='2026-01-07T00:00:00.000Z',status='completed',body='PRIVATE FOREIGN BRIEFING' WHERE id=?").bind(monitorId,foreign.value.id).run();
 await db.prepare('UPDATE monitors SET next_run=?,lease_until=NULL WHERE id=?').bind('2026-01-08T00:00:00.000Z',monitorId).run();
 const second=(await call('/monitors/run-due','POST',{},owner)).value.results[0];assert.ok(second.reportId,JSON.stringify(second));
 let current=(await call('/reports/'+second.reportId,'GET',undefined,owner)).value;assert.equal(current.monitorComparison.state,'matched');assert.equal(current.monitorComparison.baseline.id,baseline.id);assert.equal(current.monitorComparison.baseline.body,undefined);assert.equal(current.monitorComparison.baseline.sources[0].title,'Earlier evidence');
 const inspection=await(await runtime.dispatchFetch(origin+'/fixture')).json();assert.match(inspection.input,/Owned earlier briefing evidence/);assert.match(inspection.input,/Changes since the previous briefing/);assert.doesNotMatch(inspection.input,/PRIVATE FOREIGN BRIEFING/);
 await db.prepare('UPDATE reports SET title=?,body=?,sources=? WHERE id=?').bind('Renamed prior','Modified fixture text','[]',baseline.id).run();current=(await call('/reports/'+second.reportId,'GET',undefined,owner)).value;assert.equal(current.monitorComparison.baseline.sources.length,1);assert.notEqual(current.monitorComparison.baseline.title,'Renamed prior');
 const duplicate=await call('/monitors/run-due','POST',{},owner);assert.equal(duplicate.value.results.length,0);
 const history=await call('/monitors/'+monitorId+'/history','GET',undefined,owner);assert.equal(history.status,200);assert.ok(history.value.items.some(r=>r.id===current.id));assert.ok(!history.value.items.some(r=>r.id===foreign.value.id));assert.ok(history.value.items.every(r=>r.body===undefined&&r.monitor_comparison===undefined));
 assert.equal((await call('/monitors/'+monitorId+'/history','GET',undefined,'comparison-foreign')).status,404);
 const shared=await call('/reports/'+current.id+'/share','POST',{},owner);const publicView=await(await runtime.dispatchFetch(origin+'/api/shared/'+shared.value.token)).json();assert.equal(publicView.monitorComparison,undefined);assert.equal(publicView.monitorId,undefined);assert.doesNotMatch(JSON.stringify(publicView),/Owned earlier briefing evidence|Earlier evidence/);
});

test('Monitoring comparison withholds changed-scope claims and clients cannot forge comparison metadata',async()=>{
 const owner='comparison-scope',monitor=await call('/monitors','POST',{name:'Scope QA',input:inputs,cadence:'weekly'},owner),id=monitor.value.id;
 await db.prepare('UPDATE monitors SET next_run=? WHERE id=?').bind('2026-02-01T00:00:00.000Z',id).run();const first=(await call('/monitors/run-due','POST',{},owner)).value.results[0];await call('/reports/'+first.reportId,'GET',undefined,owner);
 await db.prepare('UPDATE monitors SET input=?,next_run=? WHERE id=?').bind(JSON.stringify({...inputs,market:'US'}),'2026-02-08T00:00:00.000Z',id).run();const next=(await call('/monitors/run-due','POST',{},owner)).value.results[0];const report=(await call('/reports/'+next.reportId,'GET',undefined,owner)).value;assert.equal(report.monitorComparison.state,'scope_changed');assert.ok(report.monitorComparison.scopeChanges.includes('Market'));
 const inspection=await(await runtime.dispatchFetch(origin+'/fixture')).json();assert.match(inspection.input,/different or unknown research scope/);assert.doesNotMatch(inspection.input,/PRIOR MONITOR BRIEFING DATA/);
 const forged=await call('/reports','POST',{...inputs,monitorId:id,monitorComparison:{state:'matched',baseline:{id:'foreign'}}},owner);assert.equal(forged.status,201);assert.equal(forged.value.monitorId,null);assert.equal(forged.value.monitorComparison,null);
});

test('Monitoring history paginates tied timestamps safely and rejects malformed cursors without launching research',async()=>{
 const owner='comparison-history',monitor=await call('/monitors','POST',{name:'History QA',input:inputs,cadence:'weekly'},owner),id=monitor.value.id;
 for(let i=0;i<25;i++)await db.prepare("INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,created,updated,monitor_id) VALUES (?,?,'Historical scan','brand','Example','India','Question',?,'completed',?,?,?)").bind('history-'+String(i).padStart(2,'0'),owner,JSON.stringify(inputs),'2026-02-01T00:00:00.000Z','2026-02-01T00:00:00.000Z',id).run();
 const first=(await call('/monitors/'+id+'/history','GET',undefined,owner)).value;assert.equal(first.items.length,20);assert.ok(first.nextCursor);assert.ok(first.items.every(r=>r.comparison_state===null));
 const second=(await call('/monitors/'+id+'/history?'+new URLSearchParams({before:first.nextCursor}),'GET',undefined,owner)).value;assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,25);
 assert.equal((await call('/monitors/'+id+'/history?before=broken','GET',undefined,owner)).status,400);
 assert.equal((await call('/monitors/'+id+'/history?before='+encodeURIComponent(JSON.stringify({created:'not-a-date',id:'test'})),'GET',undefined,owner)).status,400);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM reports WHERE owner=?').bind(owner).first()).n,25);
});
