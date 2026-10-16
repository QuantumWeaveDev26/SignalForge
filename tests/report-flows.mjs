import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/workspace',{redirect:'manual'});const cookie=signIn.headers.get('set-cookie').split(';')[0];
async function call(path,method='GET',body){const response=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});return {status:response.status,value:await response.json()};}
const reportId=JSON.parse(fs.readFileSync('outputs/live-research.json','utf8')).reportId;
const results=[];let v=await call('/api/workspace/reports/'+reportId);assert.equal(v.value.status,'completed');assert.ok(v.value.sources.length>0);assert.ok(v.value.body.length>1000);results.push('real completed report with sources reopened');
v=await call('/api/workspace/reports/'+reportId+'/share','POST',{});assert.equal(v.status,200);const token=v.value.token;
v=await call('/api/shared/'+token);assert.equal(v.status,200);assert.equal(v.value.body.length>1000,true);assert.equal(v.value.owner,undefined);assert.equal(v.value.input,undefined);assert.equal(v.value.responseId,undefined);assert.equal(v.value.shareToken,undefined);results.push('share exposes report content only');
await call('/api/workspace/reports/'+reportId+'/share','DELETE');v=await call('/api/shared/'+token);assert.equal(v.status,404);results.push('revocation makes old share unavailable');
v=await call('/api/workspace/monitors','POST',{name:'Paused test monitoring rule',cadence:'weekly',input:{template:'brand',subject:'Test only',question:'Test only - no run requested',market:'India'}});assert.equal(v.status,201);const monitorId=v.value.id;await call('/api/workspace/monitors/'+monitorId,'PATCH',{enabled:false});v=await call('/api/workspace');assert.equal(v.value.monitors.find(m=>m.id===monitorId).enabled,0);await call('/api/workspace/monitors/'+monitorId,'DELETE');results.push('monitor creation and pause persisted');
const previous=await call('/api/workspace/messages/'+reportId);
if(!previous.value.some(m=>m.role==='assistant')){v=await call('/api/workspace/reports/'+reportId+'/chat','POST',{question:'In three concise bullets, which limitations should a user keep in mind when reading this report? Use the saved report; no additional searches are necessary.'});assert.equal(v.status,200);assert.ok(v.value.body.length>50);}
v=await call('/api/workspace/messages/'+reportId);assert.ok(v.value.some(m=>m.role==='user'));assert.ok(v.value.some(m=>m.role==='assistant'));results.push('live follow-up answer persisted with conversation');
fs.writeFileSync('outputs/report-flows.json',JSON.stringify({passed:results.length,results},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));
