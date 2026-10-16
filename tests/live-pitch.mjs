// Explicit, manual integration check: consumes one real report using the already-approved local API key.
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
const compiled=await build({stdin:{resolveDir:process.cwd(),contents:`import {GET,POST,PATCH} from './app/api/workspace/[[...path]]/route.ts';import {createTrackedAppRouteRequest} from './node_modules/vinext/dist/server/app-route-handler-runtime.js';export default {fetch(request){return ({GET,POST,PATCH})[request.method](createTrackedAppRouteRequest(request).request)}};`},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{name:'isolated-pitch-identity',setup(b){b.onResolve({filter:/application-auth$/},()=>({path:'identity',namespace:'test-only'}));b.onLoad({filter:/.*/,namespace:'test-only'},()=>({contents:`export async function getApplicationUser(){return {owner:'isolated-pitch-qa',name:'QA',email:'qa@example.invalid',authSource:'signalforge'}};`}));b.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.replace(/^@\//,'')+'.ts')}));}}]});
const runtime=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OPENAI_API_KEY:key,OPENAI_MODEL:local.OPENAI_MODEL||'gpt-5.4-mini'}});
const result={started:new Date().toISOString(),environment:'Isolated D1/R2 Worker test; actual OpenAI provider',status:'running'};
function save(){fs.writeFileSync('outputs/live-pitch-acceptance.json',JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,workflowStatus:result.workflowStatus,sourceCount:result.sourceCount}));}
async function call(endpoint,method='GET',value){const response=await runtime.dispatchFetch(origin+'/api/workspace'+endpoint,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});const json=await response.json();if(!response.ok)throw new Error(json.error||'Pitch integration request failed.');return json;}
try{
 const db=await runtime.getD1Database('DB');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const agency=await call('/agencies','POST',{name:'Fictional QA agency',credentials:'For this QA scenario only: desk research and evidence-led positioning. No customer delivery history is supplied.',proof:'None. Do not invent case studies.',constraints:'Fictional budget INR 240000; no social/ad data provider.'});
 const pitch=await call('/pitches','POST',{input:{name:'QA pitch integration',client:'Amul',market:'India',brief:'Fictional QA exercise, not a real Amul RFP. Prepare a pitch for evidence-led research on Amul dairy product positioning in India. Use official Amul pages where possible.',requirements:'Map requirements to evidence, assess agency capability gaps and give exactly three distinct angles. Cite independently sourced claims.',goals:'Demonstrate a traceable pitch workflow, without pretending to have a real client relationship.',budget:'INR 240000 (fictional test constraint)',agencyId:agency.id}});
 result.pitchId=pitch.id;const run=await call('/pitches/'+pitch.id+'/research','POST',{requestId:crypto.randomUUID()});result.runId=run.id;result.workflowStatus=run.status;save();
 let state=run;for(let i=0;i<36&&!['completed','paused','cancelled'].includes(state.status);i++){await new Promise(resolve=>setTimeout(resolve,5000));state=await call('/workflow-runs/'+run.id);if(state.status!==result.workflowStatus){result.workflowStatus=state.status;save();}}
 assert.equal(state.status,'completed',state.error||'Research did not finish within three minutes.');assert.ok(state.reports[0].sources.length>0);result.reportId=state.reports[0].id;result.sourceCount=state.reports[0].sources.length;result.characters=state.reports[0].body.length;
 const imported=await call('/pitches/'+pitch.id+'/import','POST',{runId:run.id,expectedRevision:1});assert.equal(imported.revision,2);assert.ok(imported.sources.length>0);
 const edited=await call('/pitches/'+pitch.id,'PATCH',{expectedRevision:2,body:imported.body+'\n\n## QA reviewer decision\nConditional go: validate missing agency proof before client use.'});assert.equal(edited.revision,3);
 const restored=await call('/pitches/'+pitch.id+'/restore','POST',{versionId:edited.versions.find(v=>v.revision===2).id,expectedRevision:3});assert.equal(restored.body,imported.body);assert.deepEqual(restored.sources,imported.sources);result.finalRevision=restored.revision;result.status='passed';result.completed=new Date().toISOString();save();
}catch(error){result.status='failed';result.error=error.message;save();process.exitCode=1;}finally{await runtime.dispose();}
