import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const signIn=await fetch(base+'/signin-with-chatgpt?return_to=/workspace',{redirect:'manual'});
const cookie=signIn.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
async function call(endpoint,method='GET',body){const r=await fetch(base+'/api/workspace'+endpoint,{method,headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});return {status:r.status,value:await r.json()};}
const created=[];const checks=[];
try{
 let v=await call('/projects','POST',{name:'Temporary collection verification',description:'Local check; removed afterwards.'});assert.equal(v.status,201);const project=v.value.id;created.push(['/projects/',project]);
 v=await call('/projects/'+project);assert.equal(v.value.name,'Temporary collection verification');checks.push('Project saved and reopened through the real route');
 v=await call('/workflows','POST',{name:'Temporary workflow verification',input:{subject:'Example',market:'India'},steps:[{name:'Audit',template:'brand',question:'Research public brand evidence.'},{name:'Synthesis',template:'custom',question:'Synthesize prior findings.'}]});assert.equal(v.status,201);const workflow=v.value.id;created.push(['/workflows/',workflow]);
 v=await call('/workflows/'+workflow,'PATCH',{favorite:true});assert.equal(v.value.favorite,true);assert.equal(v.value.steps.length,2);checks.push('Two-step workflow saved and favorited');
 v=await call('');assert.ok(v.value.projects.some(p=>p.id===project));assert.ok(v.value.workflows.some(w=>w.id===workflow));checks.push('Workspace bootstrap includes projects and workflows');
 for(const route of ['projects','projects/'+project,'workflows','reports']){const r=await fetch(base+'/workspace/'+route,{headers:{Cookie:cookie},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const html=await r.text();assert.ok(html.includes('Projects')&&html.includes('Workflows'));}
 checks.push('Project, workflow and report workspace routes render successfully');
 console.log(JSON.stringify({passed:checks.length,checks,paidResearchLaunched:false},null,2));
}finally{for(const [endpoint,id] of created.reverse())await call(endpoint+id,'DELETE');}
