import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const origin='https://signalforge.test',secret='fixture-payment-secret',hookSecret='fixture-webhook-secret';
const sign=(s,key=secret)=>createHmac('sha256',key).update(s).digest('hex');
const subscriptions=new Map(),payments=new Map(),invoices=new Map();
let runtime,db,workerScript,serial=0,creationCalls=0,simulateTimeout=false,badPlan=false;
const clock=()=>Math.floor(Date.now()/1000);
async function merchant(request){
 assert.ok(['live','test'].some(mode=>request.headers.get('authorization')==='Basic '+Buffer.from('rzp_'+mode+'_fixture:'+secret).toString('base64')));
 const url=new URL(request.url),parts=url.pathname.replace('/v1/','').split('/');
 let value;
 if(parts[0]==='plans'){
  const tier=parts[1].includes('solo')?'solo':'pro',currency=parts[1].endsWith('INR')?'INR':'USD';value={id:parts[1],period:'monthly',interval:1,item:{amount:badPlan?1:tier==='solo'?(currency==='INR'?149900:1900):(currency==='INR'?399900:4900),currency}};
 }else if(parts[0]==='subscriptions'&&request.method==='POST'&&!parts[1]){
  creationCalls++;const body=await request.json();assert.equal(body.quantity,1);assert.equal(body.total_count,120);assert.equal(body.customer_notify,true);assert.equal(body.addons,undefined);
  const id='sub_fixture'+(++serial);value={...body,id,status:'created'};subscriptions.set(id,value);
  if(simulateTimeout){simulateTimeout=false;return Response.json({error:'uncertain server result'},{status:500});}
 }else if(parts[0]==='subscriptions'&&parts[2]==='cancel'){
  const body=await request.json();value=subscriptions.get(parts[1]);assert.equal(typeof body.cancel_at_cycle_end,'boolean');if(!body.cancel_at_cycle_end)value.status='cancelled';value.cancelRequested=true;
 }else if(parts[0]==='subscriptions')value=subscriptions.get(parts[1]);
 else if(parts[0]==='payments')value=payments.get(parts[1]);
 else if(parts[0]==='invoices')value=parts[1]?invoices.get(parts[1]):{items:[...invoices.values()].filter(i=>i.subscription_id===url.searchParams.get('subscription_id'))};
 if(!value)return Response.json({error:'fixture not found'},{status:404});return Response.json(value);
}
async function call(action,body,account='a',workspace){
 const response=await runtime.dispatchFetch(origin+'/api/'+action,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(account?{'x-fixture-user':account}:{}),...(workspace?{'x-fixture-owner':workspace}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,value:await response.json()};
}
async function webhook(payload,eventId,signature){const raw=JSON.stringify(payload);const response=await runtime.dispatchFetch(origin+'/api/billing/webhook',{method:'POST',body:raw,headers:{'x-razorpay-signature':signature||sign(raw,hookSecret),'x-razorpay-event-id':eventId}});return {status:response.status,value:await response.json()};}
function charge(subscriptionId,status='captured'){
 const subscription=subscriptions.get(subscriptionId),id='pay_fixture'+(++serial),invoiceId='inv_fixture'+serial;
 const currency=subscription.plan_id.endsWith('USD')?'USD':'INR';
 const amount=subscription.plan_id.includes('solo')?(currency==='INR'?149900:1900):(currency==='INR'?399900:4900);
 payments.set(id,{id,status,amount,currency,invoice_id:invoiceId,amount_refunded:0});
 invoices.set(invoiceId,{id:invoiceId,subscription_id:subscriptionId,payment_id:id,status:'paid',amount_paid:amount,currency,billing_start:clock()-30,billing_end:clock()+28*86400});subscription.status='active';return id;
}
async function subscribe(account='a',currency='INR'){
 const checkout=await call('billing/checkout',{plan:'solo',currency},account);assert.equal(checkout.status,201);const id=checkout.value.subscriptionId,payment=charge(id);
 const result=await call('billing/verify',{razorpay_subscription_id:id,razorpay_payment_id:payment,razorpay_signature:sign(payment+'|'+id)},account);assert.equal(result.status,200);assert.equal(result.value.paidPlan,'solo');return {id,payment};
}
function createRuntime(mode='live'){
 return new Miniflare({modules:true,script:workerScript,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{BILLING_MODE:mode,RAZORPAY_KEY_ID:'rzp_'+mode+'_fixture',RAZORPAY_KEY_SECRET:secret,RAZORPAY_WEBHOOK_SECRET:hookSecret,RAZORPAY_PLAN_SOLO_INR:'plan_soloINR',RAZORPAY_PLAN_SOLO_USD:'plan_soloUSD',RAZORPAY_PLAN_PRO_INR:'plan_proINR',RAZORPAY_PLAN_PRO_USD:'plan_proUSD'},outboundService:merchant});
}
async function migrate(database){for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await database.prepare(sql).run();}
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {GET,POST} from './app/api/billing/[[...path]]/route.ts';
 import * as workspace from './app/api/workspace/[[...path]]/route.ts';
 import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';
 import {setIdentity} from 'fixture-identity';
 export default {async fetch(request){setIdentity(request.headers);const tracked=createTrackedAppRouteRequest(request).request;return request.url.includes('/api/billing')?({GET,POST})[request.method](tracked):workspace[request.method](tracked);}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'billing-fixtures',setup(b){
  b.onResolve({filter:/application-auth$|^fixture-identity$/},()=>({path:'identity',namespace:'fixture'}));
  b.onResolve({filter:/(^|\/)provider$/},()=>({path:'provider',namespace:'fixture'}));
  b.onResolve({filter:/^@\//},a=>({path:path.resolve(a.path.replace(/^@\//,'')+'.ts')}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='identity'?`
   let user;export function setIdentity(headers){const id=headers.get('x-fixture-user');user=id?{userId:id,owner:headers.get('x-fixture-owner')||'auth:'+id,name:'Fixture',email:'fixture@example.com',authSource:'signalforge'}:null;}export async function getApplicationUser(){return user;}`:`
   export function backgroundReady(){return false;}export function config(){return {key:'fixture',model:'fixture'};}export async function provider(url,payload){return {id:'fixture',status:'completed',output:[{content:[{type:'output_text',text:'Fixture research answer',annotations:[{type:'url_citation',url:'https://example.com/source',title:'Evidence'}]}]}]};}` }));
 }}]});
 workerScript=result.outputFiles[0].text;runtime=createRuntime();
 db=await runtime.getD1Database('DB');
 await migrate(db);
});
after(async()=>{await runtime?.dispose();});
test('Published prices and currencies are authoritative; protected billing requires a session',async()=>{
 const catalog=await call('billing',undefined,null);assert.equal(catalog.status,200);assert.equal(catalog.value.plans[0].prices.INR,149900);assert.equal(catalog.value.plans[1].prices.USD,4900);assert.equal(catalog.value.plans[0].available.USD,true);
 assert.equal((await call('billing/status',undefined,null)).status,401);
 assert.equal((await call('billing/checkout',{plan:'invented',currency:'INR'})).status,400);
 assert.equal((await call('billing/checkout',{plan:'solo',currency:'EUR'})).status,400);
 badPlan=true;assert.equal((await call('billing/checkout',{plan:'solo',currency:'INR'},'bad-plan')).status,503);badPlan=false;
});
test('Checkout resumes one subscription and does not accept a browser price',async()=>{
 const first=await call('billing/checkout',{plan:'solo',currency:'USD',amount:1,providerPlan:'plan_fake'},'checkout');assert.equal(first.status,201);
 const remote=subscriptions.get(first.value.subscriptionId);assert.equal(remote.plan_id,'plan_soloUSD');
 const count=creationCalls;const again=await call('billing/checkout',{plan:'solo',currency:'USD'},'checkout');assert.equal(again.value.subscriptionId,first.value.subscriptionId);assert.equal(creationCalls,count);
 assert.equal((await call('billing/checkout',{plan:'pro',currency:'INR'},'checkout')).status,409);
});
test('An uncertain provider POST cannot silently create a second subscription',async()=>{
 simulateTimeout=true;assert.equal((await call('billing/checkout',{plan:'solo',currency:'INR'},'uncertain')).status,502);
 const count=creationCalls;assert.equal((await call('billing/checkout',{plan:'solo',currency:'INR'},'uncertain')).status,409);assert.equal(creationCalls,count);
 assert.equal((await call('billing/status',undefined,'uncertain')).value.checkoutUncertain,true);
});
test('Signature, ownership, captured payment and invoice are required before paid access',async()=>{
 const checkout=await call('billing/checkout',{plan:'solo',currency:'INR'},'verify');const id=checkout.value.subscriptionId,payment=charge(id,'authorized');
 const payload={razorpay_subscription_id:id,razorpay_payment_id:payment,razorpay_signature:sign(payment+'|'+id)};
 assert.equal((await call('billing/verify',{...payload,razorpay_signature:'f'.repeat(64)},'verify')).status,400);
 assert.equal((await call('billing/verify',payload,'intruder')).status,404);
 assert.equal((await call('billing/verify',payload,'verify')).value.paidUntil,null);
 payments.get(payment).status='captured';assert.equal((await call('billing/verify',payload,'verify')).value.paidPlan,'solo');
 await call('billing/verify',payload,'verify');assert.equal((await db.prepare('SELECT count(*) AS n FROM billing_payments WHERE id=?').bind(payment).first()).n,1);
});
test('Raw webhook signatures, replay deduplication and current provider state are verified',async()=>{
 const {id}=await subscribe('webhook');
 const event={event:'subscription.charged',payload:{subscription:{entity:{id,status:'created'}}}};
 assert.equal((await webhook(event,'evt-bad','f'.repeat(64))).status,400);
 assert.equal((await webhook(event,'evt-once')).status,200);
 assert.equal((await webhook(event,'evt-once')).value.duplicate,true);
 const state=(await call('billing/status',undefined,'webhook')).value;assert.equal(state.subscription.status,'active');assert.equal(state.paidPlan,'solo');
});
test('Refunds revoke paid periods, and later webhooks cannot restore them',async()=>{
 const {id,payment}=await subscribe('refund');payments.get(payment).amount_refunded=149900;payments.get(payment).status='refunded';
 const event={event:'refund.processed',payload:{refund:{entity:{payment_id:payment}}}};
 assert.equal((await webhook(event,'evt-refund')).status,200);
 assert.equal((await call('billing/status',undefined,'refund')).value.paidPlan,null);
 payments.get(payment).amount_refunded=0;payments.get(payment).status='captured';await webhook({event:'subscription.charged',payload:{subscription:{entity:{id}}}},'evt-late-charge');
 assert.equal((await call('billing/status',undefined,'refund')).value.paidPlan,null);
});
test('Cancellation stops renewal and retains verified access until the paid period ends',async()=>{
 await subscribe('cancel');const cancelled=await call('billing/cancel',{},'cancel');assert.equal(cancelled.status,200);assert.equal(cancelled.value.subscription.cancelRequested,true);assert.equal(cancelled.value.paidPlan,'solo');
 assert.equal((await call('billing/checkout',{plan:'pro',currency:'USD'},'cancel')).status,409);
});
test('Chat and report follow-ups share an atomic quota that survives deletion',async()=>{
 const {id,payment}=await subscribe('meter');const invoice=invoices.get(payments.get(payment).invoice_id),period=id+':'+invoice.billing_start;
 for(let i=0;i<49;i++)await db.prepare('INSERT INTO billing_usage (id,account,period,kind,created) VALUES (?,?,?,?,?)').bind('seed-chat-'+i,'auth:meter',period,'chat',new Date().toISOString()).run();
 const report=await call('workspace/reports',{template:'brand',subject:'Fixture',question:'Research this brand',market:'India'},'meter');assert.equal(report.status,201);
 assert.equal((await call('workspace/reports/'+report.value.id+'/chat',{question:'Follow-up'},'meter')).status,200);
 const conversation=await call('workspace/conversations',{},'meter');const turn=await call('workspace/conversations/'+conversation.value.id+'/turns',{requestId:'over-limit',question:'More research'},'meter');assert.equal(turn.status,429);
 const status=(await call('billing/status',undefined,'meter')).value;assert.equal(status.allowance.chatsUsed,50);assert.equal(status.allowance.reportsUsed,1);
});
test('Workflow steps use report quota and cannot launch beyond the paid allowance',async()=>{
 const {id,payment}=await subscribe('workflow');const invoice=invoices.get(payments.get(payment).invoice_id),period=id+':'+invoice.billing_start;
 for(let i=0;i<9;i++)await db.prepare('INSERT INTO billing_usage (id,account,period,kind,created) VALUES (?,?,?,?,?)').bind('seed-report-'+i,'auth:workflow',period,'report',new Date().toISOString()).run();
 const workflow=await call('workspace/workflows',{name:'Two passes',input:{template:'brand',subject:'Fixture',question:'Evidence',market:'India'},steps:[{name:'First',template:'brand',question:'Brand evidence'},{name:'Next',template:'custom',question:'Next evidence'}]},'workflow');assert.equal(workflow.status,201);
 const run=await call('workspace/workflows/'+workflow.value.id+'/run',{},'workflow');assert.equal(run.status,201);
 const next=await call('workspace/workflow-runs/'+run.value.id+'/advance',{},'workflow');assert.equal(next.status,429);assert.match(next.value.error,/allowance/);assert.equal((await call('workspace/workflow-runs/'+run.value.id,undefined,'workflow')).value.reports.length,1);
 assert.equal((await call('billing/status',undefined,'workflow')).value.allowance.reportsUsed,10);
});
test('Concurrent trial requests reserve exactly three report runs',async()=>{
 const requests=await Promise.all(Array.from({length:5},()=>call('workspace/reports',{template:'brand',subject:'Trial',question:'Evidence',market:'India'},'trial')));
 assert.equal(requests.filter(r=>r.status===201).length,3);assert.equal(requests.filter(r=>r.status===429).length,2);
 assert.equal((await call('billing/status',undefined,'trial')).value.allowance.reportsUsed,3);
});
test('Concurrent checkouts create one provider subscription at most',async()=>{
 const before=creationCalls;const responses=await Promise.all(Array.from({length:3},()=>call('billing/checkout',{plan:'solo',currency:'INR'},'checkout-race')));
 assert.equal(creationCalls-before,1);assert.equal(responses.filter(r=>r.status===201).length,1);assert.ok(responses.every(r=>[201,409].includes(r.status)));
});
test('Expired paid access cannot reset to free evaluation; saved reports remain readable',async()=>{
 const {payment}=await subscribe('expired');const report=await call('workspace/reports',{template:'brand',subject:'Saved evidence',question:'Evidence',market:'India'},'expired');assert.equal(report.status,201);
 await db.prepare('UPDATE billing_payments SET period_end=? WHERE id=?').bind(clock()-1,payment).run();
 const state=(await call('billing/status',undefined,'expired')).value;assert.equal(state.paidPlan,null);assert.equal(state.allowance.reports,0);
 assert.equal((await call('workspace/reports',{template:'brand',subject:'More evidence',question:'Evidence',market:'India'},'expired')).status,429);
 assert.equal((await call('workspace/reports/'+report.value.id,undefined,'expired')).status,200);
});
test('Linked workspace selection shares the account allowance',async()=>{
 await db.prepare("INSERT INTO auth_user (id,name,email,email_verified,created_at,updated_at) VALUES ('linked','Fixture','linked@example.com',1,0,0)").run();
 await db.prepare("INSERT INTO workspace_accounts (user_id,owner,created) VALUES ('linked','old-preview','2026-10-15')").run();
 for(let i=0;i<3;i++)assert.equal((await call('workspace/reports',{template:'brand',subject:'Trial',question:'Evidence',market:'India'},'linked',i===0?'old-preview':undefined)).status,201);
 assert.equal((await call('workspace/reports',{template:'brand',subject:'Fourth',question:'Evidence',market:'India'},'linked','old-preview')).status,429);
 assert.equal((await call('billing/status',undefined,'linked')).value.allowance.reportsUsed,3);
});
test('Deleting an answered conversation cannot restore trial chat credits',async()=>{
 const conversation=await call('workspace/conversations',{},'delete-usage');
 const turn={requestId:'one-question',question:'Research this'};
 assert.equal((await call('workspace/conversations/'+conversation.value.id+'/turns',turn,'delete-usage')).status,201);
 assert.equal((await call('workspace/conversations/'+conversation.value.id+'/turns',turn,'delete-usage')).status,201);
 const response=await runtime.dispatchFetch(origin+'/api/workspace/conversations/'+conversation.value.id,{method:'DELETE',headers:{Origin:origin,'x-fixture-user':'delete-usage'}});assert.equal(response.status,200);
 assert.equal((await call('billing/status',undefined,'delete-usage')).value.allowance.chatsUsed,1);
});
test('A correctly signed payment with the wrong amount or currency grants no access',async()=>{
 const checkout=await call('billing/checkout',{plan:'solo',currency:'USD'},'wrong-amount');const id=checkout.value.subscriptionId,payment=charge(id);
 payments.get(payment).amount=1;
 const body={razorpay_subscription_id:id,razorpay_payment_id:payment,razorpay_signature:sign(payment+'|'+id)};
 assert.equal((await call('billing/verify',body,'wrong-amount')).value.paidPlan,null);
 payments.get(payment).amount=1900;payments.get(payment).currency='INR';
 assert.equal((await call('billing/verify',body,'wrong-amount')).value.paidPlan,null);
});
test('Cross-origin requests cannot initiate a subscription or cancel one',async()=>{
 for(const action of ['checkout','cancel']){const response=await runtime.dispatchFetch(origin+'/api/billing/'+action,{method:'POST',body:JSON.stringify({plan:'solo',currency:'INR'}),headers:{Origin:'https://foreign.test','x-fixture-user':'a'}});assert.equal(response.status,403);}
});
test('Test payments are isolated from live research entitlements',async()=>{
 const main=runtime;runtime=createRuntime('test');
 try{
  const testDb=await runtime.getD1Database('DB');await migrate(testDb);
  await subscribe('test-payment');const state=(await call('billing/status',undefined,'test-payment')).value;
  assert.equal(state.mode,'test');assert.equal(state.allowance,null);
  assert.equal((await testDb.prepare("SELECT count(*) AS n FROM billing_payments WHERE mode='live'").first()).n,0);
  assert.equal((await testDb.prepare("SELECT count(*) AS n FROM billing_payments WHERE mode='test'").first()).n,1);
  const result=await call('workspace/reports',{template:'brand',subject:'Test account',question:'Evidence',market:'India'},'test-payment');assert.equal(result.status,201);
  assert.equal((await testDb.prepare('SELECT count(*) AS n FROM billing_usage').first()).n,0);
 }finally{await runtime.dispose();runtime=main;}
});
test('Disabled checkout cannot create subscriptions or accept webhooks',async()=>{
 const main=runtime;runtime=createRuntime('disabled');
 try{
  const catalog=(await call('billing')).value;assert.equal(catalog.mode,'disabled');assert.equal(catalog.plans[0].available.INR,false);
  assert.equal((await call('billing/checkout',{plan:'solo',currency:'INR'},'a')).status,503);
  assert.equal((await webhook({event:'subscription.charged'},'disabled-event')).status,503);
 }finally{await runtime.dispose();runtime=main;}
});
