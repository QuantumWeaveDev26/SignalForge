// Explicit, manual integration check: consumes two real monitoring reports using the already-approved local API key.
// The isolated test identity/database never changes production authentication, records or quotas.
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
const origin='https://signalforge.test';
const local=fs.existsSync('../.env.local')?parseEnv(fs.readFileSync('../.env.local','utf8')):{};
const key=process.env.OPENAI_API_KEY||local.OPENAI_API_KEY;
if(!key)throw new Error('Approved local research key is unavailable; no API call was made.');
const compiled=await build({stdin:{resolveDir:process.cwd(),contents:`import {GET,POST,PATCH} from './app/api/workspace/[[...path]]/route.ts';import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';export default {fetch(request){return ({GET,POST,PATCH})[request.method](createTrackedAppRouteRequest(request).request)}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'isolated-monitor-identity',setup(b){b.onResolve({filter:/application-auth$/},()=>({path:'identity',namespace:'test-only'}));b.onLoad({filter:/.*/,namespace:'test-only'},()=>({contents:`export async function getApplicationUser(){return {owner:'isolated-monitor-qa',name:'QA',email:'qa@example.invalid',authSource:'signalforge'}};`}));b.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.replace(/^@\//,'')+'.ts')}));}}]});
const runtime=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OPENAI_API_KEY:key,OPENAI_MODEL:local.OPENAI_MODEL||'gpt-5.4-mini'}});
const result={started:new Date().toISOString(),environment:'Isolated D1/R2 Worker test; actual OpenAI provider',status:'running'};
function save(){fs.writeFileSync('outputs/live-monitor-comparison-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,scanStatuses:result.scanStatuses,sourceCounts:result.sourceCounts}));}
async function call(endpoint,method='GET',value){const response=await runtime.dispatchFetch(origin+'/api/workspace'+endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});const json=await response.json();if(!response.ok)throw new Error(json.error||'Monitoring integration request failed.');return json;}
try{
 const db=await runtime.getD1Database('DB');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const input={template:'brand',subject:'Amul',market:'India',question:'Summarize Amul dairy product positioning using official Amul product pages and cite the evidence. This is a QA monitoring comparison: the two scans run minutes apart. Do not invent changes between them; explicitly distinguish verified developments from differences in search coverage.',window:'month'};
 const monitor=await call('/monitors','POST',{name:'QA real two-scan comparison',cadence:'weekly',input});result.monitorId=monitor.id;result.sourceCounts=[];result.scanStatuses=[];
 async function scan(number){
  const due=new Date(Date.now()-1000).toISOString();await db.prepare('UPDATE monitors SET next_run=?,lease_until=NULL WHERE id=?').bind(due,monitor.id).run();
  const dispatch=await call('/monitors/run-due','POST',{});assert.equal(dispatch.results.length,1);assert.ok(dispatch.results[0].reportId,JSON.stringify(dispatch));
  const id=dispatch.results[0].reportId;let report=await call('/reports/'+id);
  if(number===2){assert.equal(report.monitorComparison.state,'matched');assert.equal(report.monitorComparison.baseline.id,result.reportIds[0]);assert.equal(report.monitorComparison.baseline.body,undefined);}
  for(let i=0;i<48&&!['completed','failed','incomplete','cancelled'].includes(report.status);i++){await new Promise(resolve=>setTimeout(resolve,5000));report=await call('/reports/'+id);}
  assert.equal(report.status,'completed',report.error||'Research did not complete within four minutes.');assert.ok(report.sources.length>0);assert.ok(report.body.length>300);
  result.reportIds.push(id);result.scanStatuses.push(report.status);result.sourceCounts.push(report.sources.length);save();return report;
 }
 result.reportIds=[];const first=await scan(1);assert.equal(first.monitorComparison.state,'first');const second=await scan(2);
 assert.match(second.body,/changes since the previous briefing/i);result.comparisonState=second.monitorComparison.state;result.baselineId=second.monitorComparison.baseline.id;result.comparisonSectionPresent=true;
 const history=await call('/monitors/'+monitor.id+'/history');assert.equal(history.items.length,2);assert.deepEqual(new Set(history.items.map(r=>r.id)),new Set(result.reportIds));
 assert.equal((await call('/monitors/run-due','POST',{})).results.length,0);result.duplicateDispatchCreatedNoReports=true;result.status='passed';result.completed=new Date().toISOString();save();
}catch(error){result.status='failed';result.error=error.message;save();process.exitCode=1;}finally{await runtime.dispose();}
