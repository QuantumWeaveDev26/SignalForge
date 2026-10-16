// Operator-only acceptance check: one real report in an isolated local database.
// Production owners, quotas and monitoring rules are never modified.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
try{process.loadEnvFile(new URL('../../.env.local',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!process.argv.includes('--run'))throw Error('Use --run to authorize one real provider report.');
if(!process.env.OPENAI_API_KEY)throw Error('The existing approved provider key is required.');
const compiled=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {runMonitors,all,refresh,owned} from './lib/server.ts';
 export default {async fetch(req){const owner='local-monitor-acceptance';if(new URL(req.url).pathname==='/tick')return Response.json(await runMonitors(owner));const rows=await all('SELECT * FROM reports WHERE owner=?',owner);for(const row of rows)await refresh(await owned('reports',row.id,owner));return Response.json(await all('SELECT * FROM reports WHERE owner=?',owner));}};
`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'local-identity',setup(b){
 b.onResolve({filter:/application-auth$/},()=>({path:'identity',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function getApplicationUser(){return null;}'}));
 b.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.slice(2)+'.ts')}));
}}]});
const runtime=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_MODEL:process.env.OPENAI_MODEL||'gpt-5.4-mini'}});
try{
 const db=await runtime.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const created=new Date().toISOString(),id=crypto.randomUUID();
 const input={template:'custom',subject:'Google Cloud Scheduler',market:'India',question:'Using official Google Cloud documentation only, explain HTTP job authentication and one operational limitation. Keep this QA report concise.',attachmentIds:[]};
 await db.prepare('INSERT INTO monitors (id,owner,name,input,cadence,next_run,created) VALUES (?,?,?,?,?,?,?)').bind(id,'local-monitor-acceptance','QA — real provider monitoring',JSON.stringify(input),'weekly',created,created).run();
 const tick=async()=>{const r=await runtime.dispatchFetch('https://local.test/tick');assert.equal(r.status,200);return r.json();};
 const started=await tick();assert.equal(started.length,1);assert.ok(started[0].reportId,'A real provider response must be reserved.');assert.ok(!started[0].error);
 assert.equal((await tick()).length,0,'A second trigger cannot launch another scan.');
 let report;
 for(let i=0;i<48;i++){
   const rows=await(await runtime.dispatchFetch('https://local.test/reports')).json();assert.equal(rows.length,1);report=rows[0];
   if(!['starting','queued','in_progress'].includes(report.status))break;
   console.log('Real monitor: '+report.status);await new Promise(resolve=>setTimeout(resolve,5000));
 }
 assert.equal(report.status,'completed');const sources=JSON.parse(report.sources);assert.ok(sources.length);
 await db.prepare('UPDATE monitors SET next_run=?,lease_until=NULL WHERE id=?').bind(created,id).run();
 const recovered=await tick();assert.equal(recovered[0].reportId,report.id,'Lost acknowledgement recovers the saved report.');
 const nextScheduled=await db.prepare('SELECT next_run FROM monitors WHERE id=?').bind(id).first();assert.ok(nextScheduled.next_run>new Date().toISOString());
 await db.prepare('UPDATE monitors SET enabled=0,next_run=? WHERE id=?').bind(created,id).run();assert.equal((await tick()).length,0);
 const rule=await db.prepare('SELECT next_run,last_report,error FROM monitors WHERE id=?').bind(id).first();
 const result={testedAt:new Date().toISOString(),environment:'isolated local DB; real OpenAI web research',status:report.status,sourceCount:sources.length,sourceHosts:[...new Set(sources.map(s=>new URL(s.url).host))],reportId:report.id,responseId:report.response_id,nextRun:nextScheduled.next_run,duplicateLaunches:0,pauseVerified:true,productionDataModified:false};
 fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/monitor-live-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await runtime.dispose();}
