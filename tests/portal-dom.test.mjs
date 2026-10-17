// Exercises actual portal React components in a DOM; authorization is separately tested against Worker/D1.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
const win=new Window({url:'https://signalforge.test/portal',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
for(const n of ['window','document','location','history','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Node','Event','MouseEvent','MutationObserver','localStorage','sessionStorage'])Object.defineProperty(globalThis,n,{configurable:true,writable:true,value:n==='window'?win:win[n]});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:win.navigator});globalThis.matchMedia=win.matchMedia.bind(win);globalThis.IS_REACT_ACT_ENVIRONMENT=true;win.confirm=()=>true;
const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;let ClientPortal,Manager,root,calls=[],revoked=false,allowed=false;
const snapshot={id:'snap',title:'Client research',kind:'report',body:'APPROVED SNAPSHOT',sources:[],status:'incomplete',published:'2026-10-17T00:00:00.000Z'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,opts={})=>{const route=String(url),method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;calls.push({route,method,body});if(revoked)return Response.json({error:'Client access is unavailable, expired or revoked.'},{status:404});let value;
 if(route==='/api/portal')value={items:[{id:'p',name:'Client A portal'}]};
 else if(route==='/api/portal/accept')value={id:'p'};
 else if(route==='/api/portal/p')value={portal:{id:'p',name:'Client A portal'},items:[snapshot],expires:'2026-11-17',permissions:{comment:allowed,download:allowed}};
 else if(route.endsWith('/comments'))value={items:[]};else throw Error('Unexpected '+route);return Response.json(value);
};
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,30));});};
async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
async function render(Component,props={},url='/portal'){await unmount();calls=[];revoked=false;allowed=false;win.sessionStorage.clear();win.history.replaceState({},'',url);win.document.body.innerHTML='<div id="root"></div>';root=createRoot(win.document.getElementById('root'));await act(async()=>root.render(React.createElement(Component,props)));await flush();}
const buttons=text=>[...win.document.querySelectorAll('button')].filter(x=>x.textContent===text);
async function click(node){assert.ok(node);await act(async()=>node.dispatchEvent(new win.MouseEvent('click',{bubbles:true})));await flush();}
async function change(node,value){await act(async()=>{const proto=node.tagName==='SELECT'?win.HTMLSelectElement.prototype:win.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(node,value);node.dispatchEvent(new win.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});await flush();}
before(async()=>{fs.mkdirSync('outputs',{recursive:true});await build({stdin:{resolveDir:process.cwd(),contents:"export {default as ClientPortal} from './components/client-portal';export {default as Manager} from './components/client-portal-manager';"},outfile:'outputs/portal-dom.mjs',bundle:true,format:'esm',platform:'node',external:['react','react-dom','react/*','react-dom/*'],jsx:'automatic',banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"}});({ClientPortal,Manager}=await import(pathToFileURL(path.resolve('outputs/portal-dom.mjs')).href));});
after(async()=>{await unmount();globalThis.fetch=originalFetch;await win.happyDOM.close();});

test('Client fragment invitation is removed from the address and waits for an explicit acceptance action',async()=>{
 const token='a'.repeat(72);await render(ClientPortal,{},'/portal#portal-invite='+token);
 assert.equal(win.location.hash,'');assert.ok(win.sessionStorage.getItem('signalforge.pending-portal-invitation').includes(token));assert.ok(!calls.some(c=>c.method==='POST'));
 const button=buttons('Accept client invitation')[0];await act(async()=>button.closest('form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})));await flush();
 assert.ok(calls.some(c=>c.route==='/api/portal/accept'&&c.body.token===token));assert.equal(win.sessionStorage.getItem('signalforge.pending-portal-invitation'),null);assert.ok(win.document.body.textContent.includes('APPROVED SNAPSHOT'));assert.ok(win.document.body.textContent.includes('Partial report'));
});

test('Client view obeys current comment/download controls and drops cached snapshot content on revoked access',async()=>{
 await render(ClientPortal);await change(win.document.querySelector('select'),'p');assert.equal(win.document.querySelector('[href$="/download"]'),null);
 await click(buttons('Read / refresh private conversation')[0]);assert.equal(buttons('Save private comment').length,0);
 allowed=true;await click(buttons('Refresh client access')[0]);assert.ok(win.document.querySelector('[href$="/download"]'));await click(buttons('Read / refresh private conversation')[0]);assert.equal(buttons('Save private comment').length,1);
 revoked=true;await click(buttons('Refresh client access')[0]);assert.ok(win.document.body.textContent.includes('revoked'));assert.ok(!win.document.body.textContent.includes('APPROVED SNAPSHOT'));assert.equal(win.document.querySelector('[href$="/download"]'),null);
});

test('Manager previews the exact document and requires a fresh disclosure acknowledgement before publishing',async()=>{
 const data={user:{authSource:'signalforge',role:'owner'},reports:[{id:'r',title:'Research',status:'completed',updated:'revision-date'}]};let published=false;
 const api=async(route,method='GET',body)=>{calls.push({route,method,body});if(route==='client-portals')return {items:[{id:'p',name:'Client A'}]};if(route==='pitches')return [];if(route==='client-portals/p')return {portal:{name:'Client A'},items:[],grants:[]};if(route==='client-portals/p/comments')return {items:[]};if(route==='reports/r')return {updated:'revision-date'};if(route==='client-portals/preview')return {...snapshot,kind:'report',sourceId:'r',sourceUpdated:'revision-date'};if(route==='client-portals/p/items'){published=true;return {id:'snap'};}throw Error('Unexpected '+route);};
 await render(Manager,{data,api,act:async fn=>fn(),busy:false},'/workspace/client-portals');
 const select=[...win.document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Manage portal')).querySelector('select');await change(select,'p');
 const doc=[...win.document.querySelectorAll('label')].find(l=>l.textContent.startsWith('Saved document')).querySelector('select');await change(doc,'r');await click(buttons('Preview exact snapshot')[0]);
 assert.ok(win.document.body.textContent.includes('APPROVED SNAPSHOT'));assert.equal(buttons('Publish reviewed snapshot')[0].disabled,true);const check=win.document.querySelector('input[type="checkbox"]');await click(check);assert.equal(buttons('Publish reviewed snapshot')[0].disabled,false);await click(buttons('Publish reviewed snapshot')[0]);assert.equal(published,true);
 const request=calls.find(c=>c.route==='client-portals/p/items');assert.equal(request.body.expectedUpdated,'revision-date');assert.equal(request.body.acknowledged,true);assert.equal(buttons('Publish reviewed snapshot').length,0);
});

test('Team editors do not receive external-sharing management controls',async()=>{
 await render(Manager,{data:{user:{authSource:'signalforge',workspaceId:'team',role:'editor'}},api:()=>{throw Error('No management requests expected');},act:()=>{},busy:false},'/workspace/client-portals');
 assert.ok(win.document.body.textContent.includes('Only a verified account'));assert.equal(buttons('Create client portal').length,0);assert.equal(calls.length,0);
});
