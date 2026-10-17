// DOM integration of the actual Workspace and child components. No live network,
// provider calls, real sessions or browser profile access.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
const win=new Window({url:'https://signalforge.test/workspace',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
for(const name of ['window','document','location','history','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','Event','MouseEvent','PopStateEvent','MutationObserver','getComputedStyle','localStorage'])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?win:name==='getComputedStyle'?win.getComputedStyle.bind(win):win[name]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator});
globalThis.addEventListener=win.addEventListener.bind(win);globalThis.removeEventListener=win.removeEventListener.bind(win);
globalThis.matchMedia=win.matchMedia.bind(win);
globalThis.requestAnimationFrame=cb=>setTimeout(cb,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
win.HTMLElement.prototype.scrollIntoView=function(){};win.scrollTo=()=>{};win.confirm=()=>true;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
let Workspace,root,store,calls=[],pitches,failBrandSave=false;
const normalize=s=>s.replace(/\s+/g,' ').trim();
const blankInput={template:'brand',subject:'',question:'',market:'Global',attachmentIds:[],context:'',audience:'',competitors:'',window:'Last 90 days'};
function fixture(){
 const profile=id=>({id,name:id==='a'?'Alpha Coffee':'Beta Tea',market:'India',website:'https://example.com/'+id,context:id+' supplied context',audience:'Buyers',competitors:'Rival'});
 const report=id=>({id:'report-'+id,title:id+' research',template:'brand',subject:id,question:'A saved question',status:'completed',profileId:id,market:'India',body:'SAVED '+id+' REPORT',sources:[],usage:{},labels:[],created:'2026-10-17T00:00:00.000Z',updated:'2026-10-17T00:00:00.000Z'});
 store={user:{name:'QA',email:'qa@example.com',authSource:'signalforge'},preferences:{name:'QA workspace',market:'Global',timezone:'Asia/Kolkata',selected_profile_id:'a',monitor_all_brands:0},profiles:['a','b'].map(profile),reports:['a','b'].map(report),projects:['a','b'].map(id=>({id:'project-'+id,name:id+' project',description:'',profile_id:id})),attachments:['a','b'].map(id=>({id:'file-'+id,name:id+' context.txt',profile_id:id,project_id:null,archived:0,format:'text',bytes:10,created:'2026-10-17T00:00:00.000Z'})),workflows:['a','b'].map(id=>({id:'workflow-'+id,name:id+' saved workflow',description:'Research',input:{...blankInput,subject:id,profileId:id},steps:[{name:'Research',template:'brand',question:'Investigate positioning'}],favorite:false,created:'2026-10-17T00:00:00.000Z'})),workflowRuns:[],monitors:['a','b'].map(id=>({id:'monitor-'+id,name:id+' monitor',input:JSON.stringify({...blankInput,profileId:id,subject:id,question:'Monitor changes'}),enabled:0,cadence:'weekly',next_run:'2026-10-24T00:00:00.000Z'})),catalogFavorites:[],keys:[],providerReady:true,backgroundReady:true,schedulerActive:true,model:'fixture',reportCounts:{total:202,completed:200},reportCountsByBrand:[{profile_id:'a',total:125,completed:124},{profile_id:'b',total:77,completed:76}]};
 pitches=['a','b'].map(id=>({id:'pitch-'+id,input:{name:id+' saved pitch',client:id,market:'India'},revision:1,archived:0,profile_id:id,updated:'2026-10-17T00:00:00.000Z'}));
 calls=[];failBrandSave=false;
}
const originalFetch=globalThis.fetch;
globalThis.fetch=async(target,options={})=>{
 const url=new URL(String(target),'https://signalforge.test'),route=url.pathname.replace('/api/workspace',''),method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;
 calls.push({route,method,query:url.search,body});
 let data;
 if(!route||route==='/')data=store;
 else if(route==='/brand-view'){if(failBrandSave)return Response.json({error:'Brand view save temporarily unavailable.'},{status:503});store.preferences.selected_profile_id=body.profileId;data={profileId:body.profileId};}
 else if(route==='/conversations')data={items:[],nextOffset:null};
 else if(route==='/pitches')data=pitches;
 else if(route==='/agencies')data=[];
 else if(route==='/report-library'){const brand=url.searchParams.get('profileId')||url.searchParams.get('brand');const items=store.reports.filter(r=>!brand||r.profileId===brand);data={items,total:items.length,nextCursor:null,labels:[]};}
 else if(route==='/monitor-email')data={enabled:false,configured:false,sender:{state:'unchecked'},oauthTesting:true,items:[]};
 else if(route.startsWith('/reports/'))data=store.reports.find(r=>r.id===route.split('/')[2]);
 else if(route.startsWith('/messages/'))data=[];
 else if(route==='/attachments')data=store.attachments;
 else throw Error('Unexpected UI request '+method+' '+route);
 return Response.json(structuredClone(data));
};
const flush=async(ms=25)=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});};
async function mount(url='/workspace'){await unmount();fixture();win.history.replaceState({},'',url);win.document.body.innerHTML='<div id="root"></div>';root=createRoot(win.document.getElementById('root'));await act(async()=>root.render(React.createElement(Workspace)));await flush();}
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}await flush(5);}
async function click(node){assert.ok(node,'Expected button');await act(async()=>node.dispatchEvent(new win.MouseEvent('click',{bubbles:true})));await flush();}
async function nav(label){const node=[...win.document.querySelectorAll('.workspace-sidebar nav button')].find(b=>normalize(b.textContent).startsWith(label));await click(node);await flush(250);}
function field(label,tag='input,textarea,select'){const node=[...win.document.querySelectorAll('label')].find(l=>normalize(l.textContent).startsWith(label));assert.ok(node,'Missing field '+label);return node.querySelector(tag);}
async function change(node,value){assert.ok(node);await act(async()=>{const proto=node.tagName==='SELECT'?win.HTMLSelectElement.prototype:node.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new win.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});await flush();}
async function selectBrand(id){await change(win.document.querySelector('[aria-label="Workspace brand view"]'),id);}
function buttons(text){return [...win.document.querySelectorAll('button')].filter(b=>normalize(b.textContent)===text);}
before(async()=>{
 fs.mkdirSync('outputs',{recursive:true});
 await build({entryPoints:['components/workspace.tsx'],outfile:'outputs/brand-view-dom-components.mjs',bundle:true,format:'esm',platform:'node',external:['react','react-dom','react/*','react-dom/*'],jsx:'automatic',banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"},plugins:[{name:'unrelated-session-ui',setup(b){b.onResolve({filter:/account-controls$/},()=>({path:'session',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const SessionRefresh=()=>null;export const SignOut=()=>null;export const AccountControls=()=>null;'}));}}]});
 Workspace=(await import(pathToFileURL(path.resolve('outputs/brand-view-dom-components.mjs')).href)).default;
});
after(async()=>{await unmount();globalThis.fetch=originalFetch;await win.happyDOM.close();});

test('Actual workspace saves and carries a brand across projects, workflows, files, pitches, reports and monitoring',async()=>{
 await mount();assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'a');
 await selectBrand('b');await flush(250);assert.ok(calls.some(c=>c.route==='/conversations'&&new URLSearchParams(c.query).get('brand')==='b'));assert.equal(store.preferences.selected_profile_id,'b');assert.equal(new URL(win.location.href).searchParams.get('brand'),'b');
 await nav('Projects');assert.deepEqual([...win.document.querySelectorAll('.collection-card h3')].map(n=>n.textContent),['b project']);
 await nav('Workflows');const workflowText=[...win.document.querySelectorAll('.workflow-catalog-card h2')].map(n=>n.textContent);assert.ok(workflowText.includes('b saved workflow'));assert.ok(!workflowText.includes('a saved workflow'));assert.ok(workflowText.includes('Brand Audit'));
 await nav('Files');assert.ok(win.document.body.textContent.includes('b context.txt'));assert.ok(!win.document.body.textContent.includes('a context.txt'));
 await nav('Pitch workspace');assert.deepEqual([...win.document.querySelectorAll('.monitor-card h3')].map(n=>n.textContent),['b saved pitch']);
 await nav('Report library');assert.ok(calls.some(c=>c.route==='/report-library'&&new URLSearchParams(c.query).get('brand')==='b'));assert.ok(win.document.querySelector('.collection-report-open').textContent.includes('b research'));
 await nav('Monitoring');assert.deepEqual([...win.document.querySelectorAll('.monitor-card h3')].map(n=>n.textContent),['b monitor']);
 await nav('Overview');assert.equal(win.document.querySelector('.workspace-stats strong').textContent,'77');
 await unmount();
});
test('Brand view preserves an unsaved research question and its original brand association',async()=>{
 await mount();await nav('New research');assert.equal(field('Brand, business, or topic').value,'Alpha Coffee');
 await change(field('Your research question'),'Keep my original question');await selectBrand('b');
 assert.equal(field('Your research question').value,'Keep my original question');assert.equal(win.document.querySelector('[aria-label="Research brand"]').value,'a');assert.equal(field('Brand, business, or topic').value,'Alpha Coffee');
 await unmount();
});
test('Workflow launch draft survives brand filtering; explicitly starting a new launch uses the new brand',async()=>{
 await mount();await nav('Workflows');await click([...win.document.querySelectorAll('.workflow-card-main')].find(b=>b.querySelector('h2').textContent==='Brand Audit'));
 await change(field('Your brief & context'),'My unsaved workflow brief');await selectBrand('b');assert.equal(field('Your brief & context').value,'My unsaved workflow brief');assert.equal(field('Brand context','select').value,'a');
 await click([...win.document.querySelectorAll('.workflow-card-main')].find(b=>b.querySelector('h2').textContent==='Brand Audit'));assert.equal(field('Brand context','select').value,'b');
 await unmount();
});
test('A new pitch receives current brand defaults and keeps the draft after switching the view',async()=>{
 await mount();await nav('Pitch workspace');await click(buttons('New pitch brief')[0]);assert.equal(field('Client / brand').value,'Alpha Coffee');
 await change(field('Client brief / RFP'),'Do not overwrite this RFP');await selectBrand('b');assert.equal(field('Client brief / RFP').value,'Do not overwrite this RFP');assert.equal(field('Pitch brand association','select').value,'a');
 await unmount();
});
test('Selected brand persists without a URL override; explicit All brands survives reload and includes unassociated content',async()=>{
 await mount();await selectBrand('b');await unmount();win.history.replaceState({},'','/workspace');root=createRoot(win.document.getElementById('root'));await act(async()=>root.render(React.createElement(Workspace)));await flush();assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'b');
 await selectBrand('');assert.equal(store.preferences.selected_profile_id,null);assert.equal(new URL(win.location.href).searchParams.has('brand'),true);await nav('Projects');assert.equal(win.document.querySelectorAll('.collection-card h3').length,2);
 await unmount();
});
test('Opening a saved report outside the active brand keeps its saved content and the view selection',async()=>{
 await mount('/workspace/reports/report-a?brand=b');await flush();assert.ok(win.document.body.textContent.includes('SAVED a REPORT'));assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'b');assert.equal(store.reports[0].profileId,'a');
 await unmount();
});

test('Direct new-research links use the selected brand, while unknown brand URLs safely fall back to All brands',async()=>{
 await mount('/workspace/research?brand=b');assert.equal(field('Brand, business, or topic').value,'Beta Tea');assert.equal(win.document.querySelector('[aria-label="Research brand"]').value,'b');await unmount();
 await mount('/workspace/projects?brand=not-owned');assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'');assert.equal(win.document.querySelectorAll('.collection-card h3').length,2);assert.ok(!calls.some(c=>c.route==='/brand-view'));await unmount();
});
test('New project and manual monitor capture the current brand once instead of changing an open form',async()=>{
 await mount();await nav('Projects');await click([...win.document.querySelectorAll('button')].find(b=>normalize(b.textContent)==='Create project'));assert.equal(field('Brand context','select').value,'a');await selectBrand('b');assert.equal(field('Brand context','select').value,'a');
 await nav('Monitoring');await click(buttons('Create rule')[0]);assert.equal(field('Subject').value,'Beta Tea');await selectBrand('a');assert.equal(field('Subject').value,'Beta Tea');assert.equal(field('Market').value,'India');await unmount();
});
test('History navigation restores brand scope without rewriting the saved preference',async()=>{
 await mount();await nav('Projects');await selectBrand('b');await nav('Files');await act(async()=>{win.history.back();await new Promise(r=>setTimeout(r,50));win.dispatchEvent(new win.PopStateEvent('popstate'));});await flush(50);assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'b');assert.equal(store.preferences.selected_profile_id,'b');
 await act(async()=>{win.history.replaceState({},'','/workspace/projects?brand=a');win.dispatchEvent(new win.PopStateEvent('popstate'));});await flush(50);assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'a');assert.deepEqual([...win.document.querySelectorAll('.collection-card h3')].map(n=>n.textContent),['a project']);assert.equal(store.preferences.selected_profile_id,'b');await unmount();
});


test('Pristine chat follows the selected brand, but a typed question keeps its draft brand',async()=>{
 await mount();await selectBrand('b');assert.equal(win.document.querySelector('[aria-label="Chat brand context"]').value,'b');
 await change(win.document.querySelector('.chat-composer textarea')||win.document.querySelector('textarea'),'Keep my chat question');await selectBrand('a');
 assert.equal(win.document.querySelector('[aria-label="Chat brand context"]').value,'b');assert.ok([...win.document.querySelectorAll('textarea')].some(n=>n.value==='Keep my chat question'));
 await unmount();
});
test('Failed brand-preference writes retain the current view and remain retryable without losing a draft',async()=>{
 await mount();await nav('New research');await change(field('Your research question'),'Keep me through save failure');failBrandSave=true;await selectBrand('b');
 assert.equal(store.preferences.selected_profile_id,'a');assert.equal(win.document.querySelector('[aria-label="Workspace brand view"]').value,'a');assert.ok(win.document.body.textContent.includes('Brand view save temporarily unavailable.'));
 assert.equal(field('Your research question').value,'Keep me through save failure');failBrandSave=false;await selectBrand('b');assert.equal(store.preferences.selected_profile_id,'b');assert.equal(field('Your research question').value,'Keep me through save failure');await unmount();
});

