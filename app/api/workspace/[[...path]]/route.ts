import { env } from 'cloudflare:workers';
import { all, one, run, identity, owned, publicReport, launch, refresh, chat, runMonitors, syncBrandMonitors, now, id, digest, db } from '@/lib/server';
import { AppError, bounded, validateResearch } from '@/lib/research';
import { config, provider, backgroundReady } from '@/lib/provider';
import { associations } from '@/lib/server';
import { validateWorkflow, reportMetadata, reference } from '@/lib/collection-policy';
import { publicWorkflow, startWorkflow, startCatalogWorkflow, workflowState, advanceWorkflow, rerunWorkflow, setWorkflowBackground } from '@/lib/workflow-engine';
import { workflowCatalog } from '@/lib/workflow-catalog';
import { createConversation, listConversations, conversationState, sendConversation, cancelConversationTurn, conversationHistory, publicTurn } from '@/lib/conversations';
import {listContextFiles,uploadContextFile,previewContextFile,downloadContextFile,updateContextFile} from '@/lib/context-files';
import {listAgencies,saveAgency,listPitches,pitchState,createPitch,updatePitch,startPitchResearch,importPitchResearch,pitchVersion,restorePitchVersion} from '@/lib/pitches';
import {monitorHistory} from '@/lib/monitor-history';
import {reportLibrary} from '@/lib/report-library';
import {saveProfile,brandWorkspace} from '@/lib/brand-workspace';
import {saveManagerDemo} from '@/lib/manager-demo';
export const dynamic='force-dynamic';
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
async function body(req:Request,limit=60000){if(Number(req.headers.get('content-length')||0)>limit)throw new AppError('Request is too large.',413);const text=await req.text();if(text.length>limit)throw new AppError('Request is too large.',413);try{const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new AppError('Invalid request body.');}}
async function handle(req:Request){
  try {
    const method=req.method;const mutation=method!=='GET';const who=await identity(req,mutation);const owner=who.owner;
    const parts=new URL(req.url).pathname.replace(/^\/api\/workspace\/?/,'').split('/').filter(Boolean);const [area,record,action]=parts;
    if(who.api&&!['reports','profiles'].includes(area))throw new AppError('This API key can only read reports and profiles.',403);
    if(area==='demo-pack'&&method==='POST'&&!record){const value=await body(req,256);if(value.pack!=='coffee-launch-v1'||Object.keys(value).some(k=>k!=='pack'))throw new AppError('Choose the prepared coffee launch demo.');return json(await saveManagerDemo(owner));}
    if(area==='report-library'&&method==='GET'&&!record)return json(await reportLibrary(owner,new URL(req.url).searchParams));
    if(!area&&method==='GET'){
      const reports=await all('SELECT * FROM reports WHERE owner=? ORDER BY created DESC LIMIT 100',owner);
      const prefs=await one('SELECT * FROM preferences WHERE owner=?',owner);
      return json({user:{name:who.name,email:who.email,authSource:who.authSource},preferences:prefs||{name:'My workspace',market:'Global',timezone:'Asia/Kolkata'},reports:reports.map(r=>publicReport(r)),reportCounts:await one("SELECT count(*) AS total,COALESCE(sum(status='completed'),0) AS completed FROM reports WHERE owner=?",owner),catalogFavorites:(await all('SELECT preset_id FROM catalog_favorites WHERE owner=?',owner)).map(f=>f.preset_id),projects:await all('SELECT * FROM projects WHERE owner=? ORDER BY updated DESC',owner),workflows:(await all('SELECT * FROM workflows WHERE owner=? ORDER BY favorite DESC,updated DESC',owner)).map(publicWorkflow),workflowRuns:await all('SELECT id,name,project_id,profile_id,status,error,created,updated FROM workflow_runs WHERE owner=? ORDER BY created DESC LIMIT 100',owner),profiles:await all('SELECT * FROM profiles WHERE owner=? ORDER BY created DESC',owner),monitors:await all('SELECT * FROM monitors WHERE owner=? ORDER BY created DESC',owner),attachments:await listContextFiles(owner),keys:await all('SELECT id,name,prefix,created,revoked FROM api_keys WHERE owner=? ORDER BY created DESC',owner),providerReady:!!config().key,backgroundReady:backgroundReady(),model:config().model,schedulerActive:env.MONITOR_SCHEDULER_ACTIVE==='true',limits:{reportsDaily:8,concurrent:3,followupsDaily:40,chatTurnsDaily:40}});
    }
    if(area==='agencies'){
      if(method==='GET'&&!record)return json(await listAgencies(owner));
      if(method==='POST'&&!record)return json(await saveAgency(owner,await body(req)),201);
      if(method==='PATCH'&&record&&!action)return json(await saveAgency(owner,await body(req),record));
    }
    if(area==='pitches'){
      if(method==='GET'&&!record)return json(await listPitches(owner));
      if(method==='POST'&&!record)return json(await createPitch(owner,await body(req,350000)),201);
      if(record){
        if(method==='GET'&&!action)return json(await pitchState(record,owner));
        if(method==='GET'&&action==='versions')return json(await pitchVersion(record,parts[3]||'',owner));
        if(method==='PATCH'&&!action)return json(await updatePitch(record,owner,await body(req,350000)));
        if(method==='POST'&&action==='research')return json(await startPitchResearch(record,owner,await body(req,350000)),201);
        if(method==='POST'&&action==='import')return json(await importPitchResearch(record,owner,await body(req,350000)));
        if(method==='POST'&&action==='restore')return json(await restorePitchVersion(record,owner,await body(req,350000)));
      }
    }
    if(area==='conversations'){
      if(method==='GET'){if(record&&action==='turns'){const page=await conversationHistory(record,owner,new URL(req.url).searchParams.get('before'));return json({turns:page.rows.reverse().map(publicTurn),hasOlder:page.hasOlder,oldestCursor:page.oldestCursor});}return json(record?await conversationState(record,owner):await listConversations(owner,new URL(req.url).searchParams));}
      if(method==='POST'&&!record)return json(await createConversation(owner,await body(req)),201);
      if(record){
        await owned('conversations',record,owner);
        if(method==='POST'&&action==='turns')return json(await sendConversation(record,owner,await body(req)),201);
        if(method==='POST'&&action==='retry'){const v=await body(req);const turn=await owned('conversation_turns',bounded(v.turnId,'Answer',80,true),owner);if(turn.conversation_id!==record)throw new AppError('Answer not found.',404);if(!['failed','cancelled','incomplete'].includes(turn.status))throw new AppError('Only failed, stopped or partial answers can be retried.');return json(await sendConversation(record,owner,{requestId:v.requestId,question:turn.question,attachmentIds:JSON.parse(turn.attachments),mode:turn.mode||undefined}),201);}
        if(method==='POST'&&action==='cancel')return json(await cancelConversationTurn(record,owner,bounded((await body(req)).turnId,'Answer',80,true)));
        if(method==='PATCH'&&!action){const value=await body(req);if(value.favorite!==undefined){if(typeof value.favorite!=='boolean')throw new AppError('Favorite must be true or false.');await run('UPDATE conversations SET favorite=? WHERE id=? AND owner=?',value.favorite?1:0,record,owner);}if(value.title!==undefined){const title=bounded(value.title,'Conversation title',200,true);await run('UPDATE conversations SET title=?,updated=? WHERE id=? AND owner=?',title,now(),record,owner);}return json({ok:true});}
        if(method==='DELETE'&&!action){const pending=await one("SELECT id FROM conversation_turns WHERE conversation_id=? AND owner=? AND status IN ('starting','queued','in_progress')",record,owner);if(pending)throw new AppError('Stop the active answer before removing this conversation.',409);await run('DELETE FROM conversations WHERE id=? AND owner=?',record,owner);return json({ok:true});}
      }
    }
    if(area==='workflow-catalog'&&record){
      const preset=workflowCatalog.find(w=>w.id===record);if(!preset)throw new AppError('Workflow not found.',404);
      if(method==='POST'&&action==='run')return json(await startCatalogWorkflow(record,owner,await body(req)),201);
      if(method==='PATCH'&&!action){const v=await body(req);if(typeof v.favorite!=='boolean')throw new AppError('Favorite must be true or false.');const favoriteId=await digest(owner+'\n'+record);if(v.favorite)await run('INSERT OR IGNORE INTO catalog_favorites (id,owner,preset_id,created) VALUES (?,?,?,?)',favoriteId,owner,record,now());else await run('DELETE FROM catalog_favorites WHERE id=? AND owner=?',favoriteId,owner);return json({ok:true});}
    }
    if(area==='projects'){
      if(method==='GET')return json(record?await owned('projects',record,owner):await all('SELECT * FROM projects WHERE owner=? ORDER BY updated DESC',owner));
      if((method==='POST'&&!record)||(method==='PATCH'&&record)){
        const old=record?await owned('projects',record,owner):null;
        const v=await body(req);const profileId=reference(v.profileId,'Brand');if(profileId)await owned('profiles',profileId,owner);
        const projectId=record||id(),time=now(),name=bounded(v.name,'Project name',200,true),description=bounded(v.description,'Description',2000);
        if(old)await run('UPDATE projects SET name=?,description=?,profile_id=?,updated=? WHERE id=? AND owner=?',name,description,profileId,time,projectId,owner);
        else {const count=await one('SELECT count(*) AS n FROM projects WHERE owner=?',owner);if(count.n>=100)throw new AppError('This workspace supports up to 100 projects.');await run('INSERT INTO projects (id,owner,name,description,profile_id,created,updated) VALUES (?,?,?,?,?,?,?)',projectId,owner,name,description,profileId,time,time);}
        return json(await owned('projects',projectId,owner),old?200:201);
      }
      if(method==='DELETE'&&record){await owned('projects',record,owner);await db().batch([db().prepare('UPDATE attachments SET project_id=NULL WHERE project_id=? AND owner=?').bind(record,owner),db().prepare('DELETE FROM projects WHERE id=? AND owner=?').bind(record,owner)]);return json({ok:true});}
    }
    if(area==='workflows'){
      if(method==='GET')return json(record?publicWorkflow(await owned('workflows',record,owner)):(await all('SELECT * FROM workflows WHERE owner=? ORDER BY favorite DESC,updated DESC',owner)).map(publicWorkflow));
      if(method==='POST'&&record&&action==='run')return json(await startWorkflow(record,owner,await body(req)),201);
      if(method==='POST'&&!record||method==='PATCH'&&record&&!action){
        const old=record?await owned('workflows',record,owner):null;const v=await body(req);
        if(old&&Object.keys(v).length===1&&typeof v.favorite==='boolean'){await run('UPDATE workflows SET favorite=?,updated=? WHERE id=? AND owner=?',v.favorite?1:0,now(),record,owner);return json(publicWorkflow(await owned('workflows',record,owner)));}
        const validated=validateWorkflow(v);await associations(validated.input,owner);for(const attachment of validated.input.attachmentIds)await owned('attachments',attachment,owner);
        const workflowId=record||id(),time=now();
        if(old)await run('UPDATE workflows SET name=?,description=?,input=?,steps=?,updated=? WHERE id=? AND owner=?',validated.name,validated.description,JSON.stringify(validated.input),JSON.stringify(validated.steps),time,workflowId,owner);
        else{const count=await one('SELECT count(*) AS n FROM workflows WHERE owner=?',owner);if(count.n>=50)throw new AppError('This workspace supports up to 50 workflows.');await run('INSERT INTO workflows (id,owner,name,description,input,steps,created,updated) VALUES (?,?,?,?,?,?,?,?)',workflowId,owner,validated.name,validated.description,JSON.stringify(validated.input),JSON.stringify(validated.steps),time,time);}
        return json(publicWorkflow(await owned('workflows',workflowId,owner)),old?200:201);
      }
      if(method==='DELETE'&&record&&!action){await owned('workflows',record,owner);await run('DELETE FROM workflows WHERE id=? AND owner=?',record,owner);return json({ok:true});}
    }
    if(area==='workflow-runs'&&record){
      if(method==='POST'&&action==='background')return json(await setWorkflowBackground(record,owner,(await body(req)).enabled));
      if(method==='POST'&&action==='rerun')return json(await rerunWorkflow(record,owner,await body(req)),201);
      if(method==='GET')return json(await workflowState(record,owner));
      if(method==='POST'&&action==='advance'){const v=await body(req);return json(await advanceWorkflow(record,owner,v.retry===true,v.expectedStep===undefined?undefined:{step:v.expectedStep,reportId:reference(v.expectedReportId,'Report')}));}
      if(method==='POST'&&action==='stop'){await owned('workflow_runs',record,owner);const time=now();const stopped=await run("UPDATE workflow_runs SET status='cancelled',background_enabled=0,updated=? WHERE id=? AND owner=? AND (lease_until IS NULL OR lease_until<?)",time,record,owner,time);if(!stopped.meta.changes)throw new AppError('A step is starting. Wait a moment, then stop remaining steps.',409);return json({ok:true});}
    }
    if(area==='profiles'){
      if(method==='GET'&&record&&action==='workspace'){if(who.api)throw new AppError('Sign in to open the brand workspace.',403);return json(await brandWorkspace(record,owner));}
      if(method==='GET')return json(record?await owned('profiles',record,owner):await all('SELECT * FROM profiles WHERE owner=? ORDER BY created DESC',owner));
      if(method==='POST'&&!record)return json(await saveProfile(owner,await body(req)),201);
      if(method==='PATCH'&&record&&!action)return json(await saveProfile(owner,await body(req),record));
      if(method==='DELETE'&&record){await owned('profiles',record,owner);await db().batch([db().prepare('UPDATE attachments SET profile_id=NULL WHERE profile_id=? AND owner=?').bind(record,owner),db().prepare('DELETE FROM monitors WHERE managed_profile_id=? AND owner=?').bind(record,owner),db().prepare('DELETE FROM profiles WHERE id=? AND owner=?').bind(record,owner)]);return json({ok:true});}
    }
    if(area==='reports'){
      if(method==='GET'){if(!record)return json((await all('SELECT * FROM reports WHERE owner=? ORDER BY created DESC LIMIT 100',owner)).map(r=>publicReport(r)));const report=await owned('reports',record,owner);return json(publicReport(who.api?report:await refresh(report)));}
      if(method==='POST'&&!record)return json(await launch(await body(req),owner),201);
      if(record){const report=await owned('reports',record,owner);
        if(method==='PATCH'&&!action){const v=await body(req);const meta=reportMetadata(v);const links=await associations({projectId:v.projectId===undefined?report.project_id:v.projectId,profileId:v.profileId===undefined?report.profile_id:v.profileId},owner);await run('UPDATE reports SET favorite=?,labels=?,project_id=?,profile_id=?,updated=? WHERE id=? AND owner=?',meta.favorite===undefined?report.favorite:meta.favorite?1:0,meta.labels===undefined?report.labels:JSON.stringify(meta.labels),links.projectId,links.profileId,now(),record,owner);return json(publicReport(await owned('reports',record,owner)));}
        if(method==='POST'&&action==='chat')return json(await chat(report,owner,(await body(req)).question));
        if(method==='POST'&&action==='share'){if(!['completed','incomplete'].includes(report.status))throw new AppError('Only a finished report can be shared.');const token=id()+id().replaceAll('-','');await run('UPDATE reports SET share_token=? WHERE id=? AND owner=?',token,record,owner);return json({token});}
        if(method==='DELETE'&&action==='share'){await run('UPDATE reports SET share_token=NULL WHERE id=? AND owner=?',record,owner);return json({ok:true});}
        if(method==='POST'&&action==='cancel'){if(!['starting','queued','in_progress'].includes(report.status))throw new AppError('This report is no longer running.');if(report.response_id)await provider(`responses/${encodeURIComponent(report.response_id)}/cancel`,{},'POST');await run("UPDATE reports SET status='cancelled',updated=? WHERE id=? AND owner=?",now(),record,owner);return json({ok:true});}
      }
    }
    if(area==='messages'&&method==='GET'){await owned('reports',record,owner);return json((await all('SELECT id,role,body,sources,created FROM messages WHERE report_id=? AND owner=? ORDER BY created',record,owner)).map(m=>({...m,sources:JSON.parse(m.sources)})));}
    if(area==='monitors'){
      if(method==='GET'&&record&&action==='history')return json(await monitorHistory(record,owner,new URL(req.url).searchParams));
      if(method==='POST'&&record==='all-brands'){
        const v=await body(req);if(typeof v.enabled!=='boolean')throw new AppError('Provide an enabled state.');
        await run('INSERT INTO preferences (owner,monitor_all_brands) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET monitor_all_brands=excluded.monitor_all_brands',owner,v.enabled?1:0);
        await syncBrandMonitors(owner);
        await run('UPDATE monitors SET enabled=? WHERE owner=? AND managed_profile_id IS NOT NULL',v.enabled?1:0,owner);
        return json({ok:true,count:(await one('SELECT count(*) AS n FROM monitors WHERE owner=? AND managed_profile_id IS NOT NULL',owner)).n});
      }
      if(method==='POST'&&record==='run-due')return json({results:await runMonitors(owner)});
      if(method==='POST'&&!record){const v=await body(req);const input=validateResearch(v.input);const cadence=bounded(v.cadence,'Cadence',20,true);if(!['daily','weekly','monthly'].includes(cadence))throw new AppError('Select daily, weekly, or monthly.');const count=await one('SELECT count(*) AS n FROM monitors WHERE owner=?',owner);if(count.n>=10)throw new AppError('This workspace supports up to 10 monitoring rules.');const monitorId=id();await run('INSERT INTO monitors (id,owner,name,input,cadence,next_run,created) VALUES (?,?,?,?,?,?,?)',monitorId,owner,bounded(v.name,'Monitor name',200,true),JSON.stringify(input),cadence,now(),now());return json(await owned('monitors',monitorId,owner),201);}
      if(record&&method==='PATCH'){await owned('monitors',record,owner);const v=await body(req);if(typeof v.enabled!=='boolean')throw new AppError('Provide an enabled state.');await run('UPDATE monitors SET enabled=? WHERE id=? AND owner=?',v.enabled?1:0,record,owner);return json({ok:true});}
      if(record&&method==='DELETE'){const monitor=await owned('monitors',record,owner);if(monitor.managed_profile_id)throw new AppError('Pause this brand rule, or disable all-brand monitoring before removing its brand.');await run('DELETE FROM monitors WHERE id=? AND owner=?',record,owner);return json({ok:true});}
    }
    if(area==='keys'){
      if(method==='POST'){const count=await one('SELECT count(*) AS n FROM api_keys WHERE owner=? AND revoked=0',owner);if(count.n>=5)throw new AppError('Revoke a key before creating another (maximum 5).');const v=await body(req);const token='sf_'+id().replaceAll('-','')+id().replaceAll('-','');const keyId=id();await run('INSERT INTO api_keys (id,owner,name,prefix,digest,created) VALUES (?,?,?,?,?,?)',keyId,owner,bounded(v.name,'Key name',100,true),token.slice(0,11),await digest(token),now());return json({id:keyId,token},201);}
      if(method==='DELETE'&&record){await run('UPDATE api_keys SET revoked=1 WHERE id=? AND owner=?',record,owner);return json({ok:true});}
    }
    if(area==='preferences'&&method==='POST'){const v=await body(req);await run('INSERT INTO preferences (owner,name,market,timezone) VALUES (?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,market=excluded.market,timezone=excluded.timezone',owner,bounded(v.name,'Workspace name',100,true),bounded(v.market,'Market',100)||'Global',bounded(v.timezone,'Timezone',100)||'Asia/Kolkata');return json({ok:true});}
    if(area==='attachments'){
      if(method==='POST'&&!record)return json(await uploadContextFile(req,owner),201);
      if(method==='GET'&&!record)return json(await listContextFiles(owner,new URL(req.url).searchParams.get('archived')==='true'));
      if(method==='GET'&&record&&action==='download')return downloadContextFile(record,owner);
      if(method==='GET'&&record&&!action)return json(await previewContextFile(record,owner));
      if(method==='PATCH'&&record&&!action)return json(await updateContextFile(record,owner,await body(req)));
    }
    throw new AppError('Endpoint not found.',404);
  } catch(error){if(error instanceof AppError)return json({error:error.message},error.status);console.error('Workspace request failed:',error instanceof Error?error.name:'unknown');return json({error:'This action could not be completed. Please try again.'},500);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
