// Explicit local browser harness: actual Workspace + Worker API, disposable D1 and no provider calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const brandMode=process.argv.includes('--brand');
const port=57932,origin='http://127.0.0.1:'+port;
const alias={name:'workspace-alias',setup(b){b.onResolve({filter:/^@\//},args=>{const name=path.resolve(args.path.replace(/^@\//,''));return {path:['.ts','.tsx',''].map(ext=>name+ext).find(f=>fs.existsSync(f))};});}};
const client=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Workspace from './components/workspace';createRoot(document.getElementById('root')).render(<Workspace/>);`},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[alias]});
const worker=await build({stdin:{resolveDir:process.cwd(),contents:`import {GET,POST,PATCH,DELETE} from './app/api/workspace/[[...path]]/route.ts';import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';export default{fetch(request){return ({GET,POST,PATCH,DELETE})[request.method](createTrackedAppRouteRequest(request).request)}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'isolated-qa-identity',setup(b){b.onResolve({filter:/application-auth$/},()=>({path:'identity',namespace:'qa'}));b.onResolve({filter:/(^|\/)provider$/},()=>({path:'provider',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='identity'?`export async function getApplicationUser(){return {owner:'library-browser-qa',name:'Isolated library QA',email:'qa@example.invalid',authSource:'preview'}};`:`export function config(){return {key:'fixture-only',model:'fixture-only'}};export function backgroundReady(){return false};export function provider(){throw new Error('QA harness refuses provider calls')};`}));}},alias]});
const runtime=new Miniflare({modules:true,script:worker.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET']});
const db=await runtime.getD1Database('DB');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
for(let i=0;i<132;i++)await db.prepare('INSERT INTO reports (id,owner,title,template,subject,market,question,input,status,created,updated,favorite,labels,body) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('library-'+String(i).padStart(3,'0'),'library-browser-qa',i===0?'QA Historic needle beyond 100':'QA Library report '+String(i).padStart(3,'0'),i===0?'competitors':'brand','QA Example','India','Clearly fictional browser QA record; no real research claims.','{}','completed',i===0?'2025-01-01T00:00:00.000Z':'2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z',i===0?1:0,JSON.stringify(i===0?['Archived evidence']:['Recent']),'# QA report\nFictional test record only.').run();
async function call(endpoint,method='GET',value){const r=await runtime.dispatchFetch(origin+'/api/workspace'+endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
let qaBrand;
if(brandMode){
 await call('/monitors/all-brands','POST',{enabled:true});qaBrand=await call('/profiles','POST',{name:'QA Atlas brand',market:'India',website:'https://example.com/atlas',audience:'QA retail buyers',competitors:'QA rival',context:'Fictional original brand context.'});
 const project=await call('/projects','POST',{name:'QA Atlas project',profileId:qaBrand.id});
 await db.prepare('UPDATE reports SET profile_id=?,project_id=?').bind(qaBrand.id,project.id).run();
 const rule=await db.prepare('SELECT id FROM monitors WHERE managed_profile_id=?').bind(qaBrand.id).first();await call('/monitors/'+rule.id,'PATCH',{enabled:false});
 await call('/workflows','POST',{name:'QA Atlas workflow',input:{subject:qaBrand.name,market:'India',context:qaBrand.context,profileId:qaBrand.id},steps:[{name:'Research',template:'brand',question:'Fictional QA research'}]});
 await call('/conversations','POST',{profileId:qaBrand.id,title:'QA existing snapshot'});
 const form=new FormData();form.append('file',new File(['Fictional QA supplied context'],'atlas-context.txt'));form.append('profileId',qaBrand.id);const encoded=new Request(origin+'/api/workspace/attachments',{method:'POST',body:form});const upload=await runtime.dispatchFetch(encoded.url,{method:'POST',headers:{Origin:origin,'Content-Type':encoded.headers.get('content-type')},body:await encoded.arrayBuffer()});if(!upload.ok)throw new Error('QA file setup failed');
}
let failNext=false;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(brandMode&&url.pathname==='/__qa/brand-conflict'&&req.method==='POST'){const current=await call('/profiles/'+qaBrand.id);await call('/profiles/'+qaBrand.id,'PATCH',{...current,name:'QA updated in another tab',expectedRevision:current.revision});res.end('OK');return;}
 if(url.pathname==='/__qa/fail-next'&&req.method==='POST'){failNext=true;res.end('OK');return;}
 if(url.pathname.startsWith('/api/workspace')){if(failNext&&url.pathname==='/api/workspace/report-library'&&url.searchParams.has('before')){failNext=false;res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Simulated QA page failure'}));return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const result=await runtime.dispatchFetch(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(url.pathname==='/qa-client.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(client.outputFiles[0].text);return;}
 if(url.pathname==='/site.css'){res.writeHead(200,{'Content-Type':'text/css'});res.end(fs.readFileSync('app/site.css'));return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Isolated SignalForge library QA</title><link rel="stylesheet" href="/site.css"></head><body><button style="position:fixed;bottom:0;right:0;z-index:9999" id="fail">${brandMode?'QA: change brand in another tab':'QA: fail next older-page load'}</button><div id="root"></div><script>document.getElementById('fail').onclick=()=>fetch('${brandMode?'/__qa/brand-conflict':'/__qa/fail-next'}',{method:'POST'})</script><script type="module" src="/qa-client.js"></script></body></html>`);
 }catch{res.writeHead(500);res.end('Local QA harness error');}});
server.listen(port,'127.0.0.1',()=>console.log('Isolated browser QA ready: '+origin+(brandMode?'/workspace/profiles/'+qaBrand.id:'/workspace/reports')));
async function stop(){server.close();await runtime.dispose();process.exit(0);}process.on('SIGINT',stop);process.on('SIGTERM',stop);
