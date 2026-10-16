import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/workspace',{redirect:'manual'});
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
async function call(path,method='GET',body){const r=await fetch(base+'/api/workspace'+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,value:await r.json()};}
let conversation,profile;const checks=[];
try{
 let v=await call('/profiles','POST',{name:'Temporary chat brand',market:'India',context:'Temporary saved brand context'});assert.equal(v.status,201);profile=v.value.id;
 v=await call('/conversations','POST',{profileId:profile,mode:'research'});assert.equal(v.status,201);conversation=v.value.id;assert.equal(v.value.context.context,'Temporary saved brand context');checks.push('Brand snapshot saved in an independent conversation');
 await call('/conversations/'+conversation,'PATCH',{title:'Temporary searchable discussion'});
 v=await call('/conversations?q=searchable');assert.equal(v.status,200);assert.ok(v.value.items.some(c=>c.id===conversation));checks.push('Conversation title and search persist');
 v=await call('/workflow-catalog/brand-audit','PATCH',{favorite:true});assert.equal(v.status,200);assert.ok((await call('')).value.catalogFavorites.includes('brand-audit'));await call('/workflow-catalog/brand-audit','PATCH',{favorite:false});checks.push('Built-in workflow favorite persists');
 for(const route of ['/workspace','/workspace/chats/'+conversation,'/workspace/workflows']){const r=await fetch(base+route,{headers:{Cookie:cookie}});assert.equal(r.status,200);assert.ok((await r.text()).includes('Chat'));}checks.push('Chat home, saved chat and workflow routes render');
 const destination='/workspace/chats/'+conversation;const anonymous=await fetch(base+destination,{redirect:'manual'});assert.equal(anonymous.status,307);assert.equal(new URL(anonymous.headers.get('location'),base).searchParams.get('return_to'),destination);checks.push('Sign-in preserves the requested conversation URL');
 console.log(JSON.stringify({passed:checks.length,checks,paidResearchLaunched:false},null,2));
}finally{if(conversation)await call('/conversations/'+conversation,'DELETE');if(profile)await call('/profiles/'+profile,'DELETE');}
