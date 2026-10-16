import {env} from 'cloudflare:workers';
import {AppError} from './research';
import {paidPlans,selectedPlan,subscriptionCycles,validSignature} from './billing-policy';
import {billingMode,checkoutReady,providerPlan,razorpay} from './razorpay';
const database=()=>{if(!env.DB)throw new AppError('Billing storage is unavailable.',503);return env.DB;};
const first=(sql:string,...args:any[])=>database().prepare(sql).bind(...args).first<any>();
const execute=(sql:string,...args:any[])=>database().prepare(sql).bind(...args).run();
const stamp=()=>new Date().toISOString();
const seconds=()=>Math.floor(Date.now()/1000);
const terminal=(status:string)=>['cancelled','completed','expired'].includes(status);
function resource(value:unknown,prefix:string){if(typeof value!=='string'||!new RegExp('^'+prefix+'_[a-zA-Z0-9]{1,64}$').test(value))throw new AppError('Invalid payment reference.');return value;}
export const accountForUser=(userId:string)=>'auth:'+userId;
export async function accountForOwner(owner:string){
 if(owner.startsWith('auth:'))return owner;
 const link=await first('SELECT user_id FROM workspace_accounts WHERE owner=?',owner);
 return link?accountForUser(link.user_id):'legacy:'+owner;
}
export function publicPlans(){return {mode:billingMode(),plans:paidPlans.map(p=>({...p,available:{INR:checkoutReady(p.id,'INR'),USD:checkoutReady(p.id,'USD')}}))};}
export async function paidPeriod(account:string,mode=billingMode()){
 return first('SELECT * FROM billing_payments WHERE account=? AND mode=? AND revoked=0 AND period_start<=? AND period_end>? ORDER BY period_start DESC LIMIT 1',account,mode,seconds(),seconds());
}
// The quota predicate is evaluated inside the same D1 transaction as the domain
// insert and its ledger entry. Reading a balance alone never reserves usage.
export async function quota(owner:string,kind:'chat'|'report'){
 const account=await accountForOwner(owner),enabled=billingMode()==='live';
 if(!enabled)return {enabled,account,period:'evaluation',limit:0,where:'1=1',binds:[] as any[]};
 const payment=await paidPeriod(account,'live'),plan=selectedPlan(payment?.plan);
 const everPaid=await first("SELECT id FROM billing_payments WHERE account=? AND mode='live' LIMIT 1",account);
 const period=payment?payment.subscription_id+':'+payment.period_start:'trial';
 const limit=plan?(kind==='chat'?plan.chats:plan.reports):everPaid?0:kind==='chat'?10:3;
 const binds:any[]=[account,period,kind,limit];
 let where='(SELECT count(*) FROM billing_usage WHERE account=? AND period=? AND kind=?)<?';
 if(payment){where+=" AND EXISTS (SELECT 1 FROM billing_payments WHERE id=? AND account=? AND mode='live' AND revoked=0 AND period_start<=unixepoch() AND period_end>unixepoch())";binds.push(payment.id,account);}
 return {enabled,account,period,limit,where,binds};
}
export function usageEntry(q:Awaited<ReturnType<typeof quota>>,kind:string,record:string){
 return database().prepare('INSERT INTO billing_usage (id,account,period,kind,created) SELECT ?,?,?,?,? WHERE changes()>0').bind(record,q.account,q.period,kind,stamp());
}
export async function billingState(account:string){
 const mode=billingMode();const contract=await first('SELECT * FROM billing_subscriptions WHERE account=? AND mode=? ORDER BY created DESC LIMIT 1',account,mode);
 const payment=await paidPeriod(account),plan=selectedPlan(payment?.plan);
 const livePayment=await paidPeriod(account,'live'),effective=selectedPlan(livePayment?.plan);
 const period=livePayment?livePayment.subscription_id+':'+livePayment.period_start:'trial';
 const usage=await database().prepare('SELECT kind,count(*) AS count FROM billing_usage WHERE account=? AND period=? GROUP BY kind').bind(account,period).all<any>();
 const everPaid=await first("SELECT id FROM billing_payments WHERE account=? AND mode='live' LIMIT 1",account);
 const lock=await first('SELECT state FROM billing_checkouts WHERE id=?',mode+':'+account);
 return {...publicPlans(),subscription:contract?{id:contract.id,plan:contract.plan,currency:contract.currency,status:contract.status,cancelRequested:!!contract.cancel_requested}:null,paidUntil:payment?.period_end||null,paidPlan:plan?.id||null,checkoutUncertain:lock?.state==='creating',
  allowance:mode==='live'?{plan:effective?.name||'Evaluation',chats:effective?.chats||(everPaid?0:10),reports:effective?.reports||(everPaid?0:3),chatsUsed:usage.results.find(r=>r.kind==='chat')?.count||0,reportsUsed:usage.results.find(r=>r.kind==='report')?.count||0,ends:livePayment?.period_end||null}:null};
}
export async function createCheckout(account:string,planId:unknown,currency:unknown){
 const plan=selectedPlan(planId);if(!plan||!['INR','USD'].includes(String(currency)))throw new AppError('Choose a supported plan and currency.');
 const unit=currency as 'INR'|'USD',mode=billingMode(),providerId=providerPlan(plan.id,unit);
 if(!checkoutReady(plan.id,unit)||!providerId)throw new AppError('Checkout is not activated for this plan and currency yet.',503);
 const old=await first('SELECT * FROM billing_subscriptions WHERE account=? AND mode=? ORDER BY created DESC LIMIT 1',account,mode);
 if(old){
  await syncSubscription(old.id);const current=await first('SELECT * FROM billing_subscriptions WHERE id=?',old.id);
  if(!terminal(current.status)){
   if(current.status==='created'&&current.plan===plan.id&&current.currency===unit)return {key:env.RAZORPAY_KEY_ID,subscriptionId:old.id,mode};
   throw new AppError('Manage or cancel your existing subscription before choosing another plan.',409);
  }
  if(await paidPeriod(account))throw new AppError('Your paid access continues until the current period ends. Choose a new plan after that date.',409);
  await execute("UPDATE billing_checkouts SET state='idle',subscription_id=NULL WHERE id=? AND state='ready'",mode+':'+account);
 }
 const remotePlan=await razorpay('plans/'+resource(providerId,'plan'));
 if(remotePlan.period!=='monthly'||remotePlan.interval!==1||remotePlan.item?.amount!==plan.prices[unit]||remotePlan.item?.currency!==unit)throw new AppError('The configured Razorpay plan does not match the published price. Checkout is paused.',503);
 const lock=mode+':'+account;
 await execute("INSERT OR IGNORE INTO billing_checkouts (id,account,mode,state,created) VALUES (?,?,?,'idle',?)",lock,account,mode,stamp());
 const claim=await execute("UPDATE billing_checkouts SET state='creating',created=? WHERE id=? AND state='idle'",stamp(),lock);
 if(!claim.meta.changes)throw new AppError('A checkout is already being prepared. Refresh billing status. If it remains pending, contact support before retrying.',409);
 // Do not automatically repeat an uncertain POST: Razorpay may have created it.
 const subscription=await razorpay('subscriptions',{plan_id:providerId,total_count:subscriptionCycles,quantity:1,customer_notify:true,expire_by:seconds()+3600,notes:{signalforge_account:account,signalforge_plan:plan.id}});
 resource(subscription.id,'sub');if(subscription.plan_id!==providerId)throw new AppError('The payment plan could not be confirmed.',502);
 await database().batch([
  database().prepare('INSERT INTO billing_subscriptions (id,account,mode,plan,currency,provider_plan,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').bind(subscription.id,account,mode,plan.id,unit,providerId,subscription.status,stamp(),stamp()),
  database().prepare("UPDATE billing_checkouts SET state='ready',subscription_id=? WHERE id=?").bind(subscription.id,lock),
 ]);
 return {key:env.RAZORPAY_KEY_ID,subscriptionId:subscription.id,mode};
}
async function recordInvoice(contract:any,invoice:any){
 const plan=selectedPlan(contract.plan);if(!plan)throw new AppError('Unknown subscription plan.',502);
 if(invoice.subscription_id!==contract.id||invoice.status!=='paid'||!invoice.payment_id)return;
 const payment=await razorpay('payments/'+resource(invoice.payment_id,'pay'));
 if(payment.invoice_id===invoice.id&&(payment.amount_refunded>0||payment.status==='refunded'))await execute('UPDATE billing_payments SET revoked=1,updated=? WHERE id=? AND subscription_id=?',stamp(),payment.id,contract.id);
 const expected=plan.prices[contract.currency as 'INR'|'USD'];
 if(payment.status!=='captured'||payment.invoice_id!==invoice.id||payment.currency!==contract.currency||payment.amount!==expected||invoice.currency!==contract.currency||invoice.amount_paid!==expected)return;
 const start=invoice.billing_start,end=invoice.billing_end;
 if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start||end-start>35*86400)return;
 await execute('INSERT INTO billing_payments (id,subscription_id,account,mode,plan,currency,amount,period_start,period_end,revoked,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revoked=MAX(billing_payments.revoked,excluded.revoked),updated=excluded.updated',payment.id,contract.id,contract.account,contract.mode,contract.plan,contract.currency,payment.amount,start,end,payment.amount_refunded>0?1:0,stamp());
}
export async function syncSubscription(subscriptionId:string,paymentId?:string){
 const contract=await first('SELECT * FROM billing_subscriptions WHERE id=? AND mode=?',subscriptionId,billingMode());if(!contract)return false;
 const remote=await razorpay('subscriptions/'+resource(contract.id,'sub'));
 if(remote.id!==contract.id||remote.plan_id!==contract.provider_plan||remote.quantity!==1||remote.notes?.signalforge_account!==contract.account)throw new AppError('Subscription ownership could not be verified.',502);
 await execute('UPDATE billing_subscriptions SET status=?,updated=? WHERE id=?',remote.status,stamp(),contract.id);
 if(paymentId){const payment=await razorpay('payments/'+resource(paymentId,'pay'));if(payment.invoice_id)await recordInvoice(contract,await razorpay('invoices/'+resource(payment.invoice_id,'inv')));}
 // Fetch current paid invoices independently of a browser callback. Old webhook
 // snapshots cannot roll back a recorded billing period or clear a refund.
 const invoices=await razorpay('invoices?subscription_id='+encodeURIComponent(contract.id)+'&count=100&from='+(seconds()-40*86400));
 for(const invoice of invoices.items||[])if(invoice.billing_end>seconds()&&invoice.billing_start<=seconds())await recordInvoice(contract,invoice);
 return true;
}
export async function verifyCheckout(account:string,value:any){
 const subscriptionId=resource(value.razorpay_subscription_id,'sub');
 const contract=await first('SELECT * FROM billing_subscriptions WHERE id=? AND account=? AND mode=?',subscriptionId,account,billingMode());
 if(!contract)throw new AppError('This subscription does not belong to your account.',404);
 const paymentId=resource(value.razorpay_payment_id,'pay');
 if(!await validSignature(paymentId+'|'+contract.id,String(value.razorpay_signature||''),env.RAZORPAY_KEY_SECRET||''))throw new AppError('Payment verification failed.',400);
 await syncSubscription(contract.id,paymentId);return billingState(account);
}
export async function refreshBilling(account:string){
 const contracts=await database().prepare('SELECT id FROM billing_subscriptions WHERE account=? AND mode=? ORDER BY created DESC LIMIT 1').bind(account,billingMode()).all<any>();
 for(const c of contracts.results)await syncSubscription(c.id);return billingState(account);
}
export async function cancelSubscription(account:string){
 const contract=await first('SELECT * FROM billing_subscriptions WHERE account=? AND mode=? ORDER BY created DESC LIMIT 1',account,billingMode());
 if(!contract)throw new AppError('No subscription was found.',404);
 await syncSubscription(contract.id);const current=await first('SELECT status FROM billing_subscriptions WHERE id=?',contract.id);
 if(!terminal(current.status)&&!contract.cancel_requested){
  await razorpay('subscriptions/'+resource(contract.id,'sub')+'/cancel',{cancel_at_cycle_end:!!await paidPeriod(account)});
  await execute('UPDATE billing_subscriptions SET cancel_requested=1,updated=? WHERE id=?',stamp(),contract.id);
 }
 return refreshBilling(account);
}
export async function acceptWebhook(raw:string,signature:string,eventId:string){
 if(billingMode()==='disabled')throw new AppError('Payment webhooks are not active.',503);
 if(raw.length>128000)throw new AppError('Webhook is too large.',413);
 if(!await validSignature(raw,signature,env.RAZORPAY_WEBHOOK_SECRET||''))throw new AppError('Invalid webhook signature.',400);
 if(!eventId||eventId.length>160)throw new AppError('Missing webhook event ID.');
 let event;try{event=JSON.parse(raw);}catch{throw new AppError('Invalid webhook body.');}if(!event||typeof event!=='object')throw new AppError('Invalid webhook body.');if(await first('SELECT id FROM billing_events WHERE id=?',billingMode()+':'+eventId))return {received:true,duplicate:true};
 const subscriptionId=event.payload?.subscription?.entity?.id;
 const paymentId=event.payload?.payment?.entity?.id||event.payload?.refund?.entity?.payment_id;
 let handled=false;
 if(subscriptionId)handled=await syncSubscription(resource(subscriptionId,'sub'),paymentId);
 else if(paymentId){
  const saved=await first('SELECT subscription_id FROM billing_payments WHERE id=? AND mode=?',resource(paymentId,'pay'),billingMode());
  if(saved)handled=await syncSubscription(saved.subscription_id,paymentId);
 }
 if(event.event==='payment.dispute.created'){
  const disputed=event.payload?.dispute?.entity?.payment_id;
  if(disputed)await execute('UPDATE billing_payments SET revoked=1,updated=? WHERE id=? AND mode=?',stamp(),resource(disputed,'pay'),billingMode());
 }
 await execute('INSERT OR IGNORE INTO billing_events (id,type,created) VALUES (?,?,?)',billingMode()+':'+eventId,String(event.event||'unknown').slice(0,100),stamp());
 return {received:true,handled};
}
