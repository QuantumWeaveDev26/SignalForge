// Creates only TEST plan definitions. Does not create customers or charge money.
// Secrets are read from an ignored file; output contains readiness flags only.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const file=new URL('../.env.billing.local',import.meta.url);
const raw=fs.readFileSync(file,'utf8');
const config=Object.fromEntries(raw.split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim()];}));
if(!config.RAZORPAY_KEY_ID?.startsWith('rzp_test_')||!config.RAZORPAY_KEY_SECRET)throw new Error('Save the Razorpay TEST key ID and secret in .env.billing.local first.');
const bundled=await build({entryPoints:[fileURLToPath(new URL('../lib/billing-policy.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {paidPlans}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
async function api(path,body){const r=await fetch('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(config.RAZORPAY_KEY_ID+':'+config.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Razorpay rejected test plan setup. Check test keys and Subscriptions activation.');return r.json();}
function save(){fs.writeFileSync(file,'# Private local billing settings. Never share or commit.\n'+Object.entries(config).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});}
config.BILLING_MODE='test';config.RAZORPAY_WEBHOOK_SECRET ||= randomBytes(32).toString('hex');save();
for(const plan of paidPlans)for(const currency of ['INR','USD']){
 const key=`RAZORPAY_PLAN_${plan.id.toUpperCase()}_${currency}`;
 if(config[key]){const remote=await api('plans/'+encodeURIComponent(config[key]));if(remote.period!=='monthly'||remote.interval!==1||remote.item?.amount!==plan.prices[currency]||remote.item?.currency!==currency)throw new Error('An existing test plan does not match the approved catalog.');continue;}
 // Persist each successful ID before another API call. An interrupted run cannot
 // create duplicate plans for entries whose responses were received.
 const remote=await api('plans',{period:'monthly',interval:1,item:{name:'SignalForge '+plan.name+' monthly ('+currency+')',amount:plan.prices[currency],currency,description:`${plan.chats} chat questions and ${plan.reports} report runs per billing period`}});
 if(!/^plan_[A-Za-z0-9]+$/.test(remote.id))throw new Error('Razorpay returned an invalid test plan reference.');config[key]=remote.id;save();
}
console.log(JSON.stringify({mode:'test',plansConfigured:4,webhookSecretPrepared:true,next:'Configure the TEST webhook using the secret in the private file. Never paste keys into chat.'}));
