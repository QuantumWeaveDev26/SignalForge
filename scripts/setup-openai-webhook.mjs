// Operator-only provisioning. Uses the already approved project key; never prints secrets.
import fs from 'node:fs';
try{process.loadEnvFile(new URL('../../.env.local',import.meta.url));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!process.env.OPENAI_API_KEY)throw Error('The approved OpenAI project key is required.');
const url='https://signalforge-research-nr.brandmintai.chatgpt.site/api/webhooks/openai';
async function request(path,body){
 const response=await fetch('https://api.openai.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const value=await response.json().catch(()=>({}));if(!response.ok)throw Error(`Webhook setup HTTP ${response.status}; code ${value.error?.code||'unavailable'}.`);return value;
}
let after,existing;
do{const page=await request('webhook_endpoints?limit=100'+(after?'&after='+encodeURIComponent(after):''));existing=page.data.find(e=>e.url===url);if(existing||!page.has_more)break;const next=page.last_id||page.data.at(-1)?.id;if(!next||next===after)throw Error('Webhook pagination did not advance.');after=next;}while(true);
const target=new URL('../.env.background.local',import.meta.url);
if(existing){
 if(!fs.existsSync(target))throw Error('The webhook already exists. Recover its stored signing secret; do not create a duplicate or rotate automatically.');
 console.log(JSON.stringify({id:existing.id,url:existing.url,reused:true}));
}else{
 if(!process.argv.includes('--create')){console.log(JSON.stringify({existing:false,url,action:'Rerun with --create after the receiver is verified.'}));process.exit(0);}
 if(fs.existsSync(target))throw Error('A local webhook configuration exists but no matching endpoint was found. Review before replacing it.');
 const endpoint=await request('webhook_endpoints',{name:'SignalForge background research',url,event_types:['response.completed','response.failed','response.cancelled','response.incomplete']});
 if(!endpoint.signing_secret)throw Error('The webhook was created but no signing secret was returned. Recover it before continuing.');
 fs.writeFileSync(target,'OPENAI_WEBHOOK_SECRET='+endpoint.signing_secret+'\nBACKGROUND_WEBHOOK_ENABLED=true\n',{flag:'wx'});
 fs.mkdirSync(new URL('../outputs/',import.meta.url),{recursive:true});
 fs.writeFileSync(new URL('../outputs/openai-webhook-setup.json',import.meta.url),JSON.stringify({id:endpoint.id,url:endpoint.url,eventTypes:endpoint.event_types},null,2));
 console.log(JSON.stringify({id:endpoint.id,url:endpoint.url,secretSavedSecurely:true}));
}
