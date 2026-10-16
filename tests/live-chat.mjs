// Explicit live verification only. Uses the preview's configured provider; not part of the fixture test suite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:5173';
const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/workspace',{redirect:'manual'});
const cookie=signIn.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
async function call(path,method='GET',body){const r=await fetch(base+'/api/workspace'+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(40000)});const value=await r.json();if(!r.ok)throw new Error(value.error||'Request failed');return value;}
let conversationId;
try{
 const root=await call('');assert.equal(root.providerReady,true,'Existing provider must be configured.');
 const c=await call('/conversations','POST',{title:'Temporary live chat verification',mode:'research'});conversationId=c.id;
 async function answer(question){
  let turn=await call('/conversations/'+conversationId+'/turns','POST',{question,requestId:crypto.randomUUID()});const start=Date.now();let previous='';
  while(['starting','queued','in_progress'].includes(turn.status)&&Date.now()-start<180000){if(turn.status!==previous){console.log(JSON.stringify({phase:'live-chat',status:turn.status}));previous=turn.status;}await new Promise(resolve=>setTimeout(resolve,3000));const state=await call('/conversations/'+conversationId);turn=state.turns.find(t=>t.id===turn.id);}
  assert.equal(turn.status,'completed',turn.error||'Answer did not complete');return turn;
 }
 const first=await answer('Find Amul’s official website and cite two facts about its products from that website. Keep under 120 words. Treat this as a verification question.');
 assert.ok(first.body.length>150);assert.ok(first.sources.some(s=>new URL(s.url).hostname.endsWith('amul.com')),'A primary-source citation is required.');
 const second=await answer('Which brand did I just ask about? Answer in one sentence using our conversation.');assert.match(second.body,/amul/i);
 const result={completed:true,provider:'Existing configured OpenAI project',answers:2,firstAnswerCharacters:first.body.length,citedSources:first.sources.length,primarySourceVerified:true,followupContextVerified:true};
 fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/live-chat.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 if(conversationId){const state=await call('/conversations/'+conversationId);for(const turn of state.turns)if(['starting','queued','in_progress'].includes(turn.status))await call('/conversations/'+conversationId+'/cancel','POST',{turnId:turn.id});await call('/conversations/'+conversationId,'DELETE');}
}
