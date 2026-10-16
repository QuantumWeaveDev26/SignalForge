import { all, one, owned, run, now, id, launch, refresh, publicReport, associations } from './server';
import { AppError, validateResearch } from './research';
import { workflowCatalog } from './workflow-catalog';
import {reference} from './collection-policy';
import {backgroundReady} from './provider';

export function publicWorkflow(row: any) {
  return { ...row, input: JSON.parse(row.input), steps: JSON.parse(row.steps), favorite: !!row.favorite };
}
export async function startWorkflow(workflowId: string, owner: string, value: any) {
  const workflow=await owned('workflows',workflowId,owner);
  const saved=publicWorkflow(workflow);
  return startSnapshot(saved,owner,value);
}
export async function startCatalogWorkflow(presetId:string,owner:string,value:any){
  const preset=workflowCatalog.find(w=>w.id===presetId);
  if(!preset)throw new AppError('Workflow not found.',404);
  if(preset.requires)throw new AppError(`This workflow needs a connected ${preset.requires==='social'?'social-data':'advertising-data'} provider. It is not active yet.`,503);
  return startSnapshot({...preset,input:{market:'Global',context:'',audience:'',competitors:'',attachmentIds:[]}},owner,value);
}
export async function startSnapshot(saved:any,owner:string,value:any){
  const runId=reference(value.requestId,'Request ID')||id(),existing=await one('SELECT owner FROM workflow_runs WHERE id=?',runId);
  if(existing){if(existing.owner!==owner)throw new AppError('This request ID is already in use.',409);return workflowState(runId,owner);}
  if(value.background!==undefined&&typeof value.background!=='boolean')throw new AppError('Background execution must be true or false.');
  if(value.background&&!backgroundReady())throw new AppError('Background execution is not activated yet.',503);
  // Snapshot inputs and steps so editing or deleting the template cannot alter an active run.
  const links=await associations({projectId:value.projectId===undefined?saved.input.projectId:value.projectId,profileId:value.profileId===undefined?saved.input.profileId:value.profileId},owner);
  const profile=links.profileId&&!saved.snapshot?await owned('profiles',links.profileId,owner):null;
  const brief=value.input?.context;if(brief!==undefined&&typeof brief!=='string')throw new AppError('Context must be text.');
  const context=[...new Set([saved.input.context,profile?.context,brief].filter(Boolean))].join('\n\n');
  const input=validateResearch({...saved.input,...(profile?{subject:profile.name,market:profile.market,audience:profile.audience,competitors:profile.competitors}:{}),...value.input,context,template:saved.steps[0].template,question:saved.steps[0].question});
  if(input.attachmentIds.length)for(const attachment of input.attachmentIds)await owned('attachments',attachment,owner);
  const time=now();
  const inserted=await run("INSERT OR IGNORE INTO workflow_runs (id,owner,name,workflow_id,project_id,profile_id,input,steps,status,background_enabled,created,updated) SELECT ?,?,?,?,?,?,?,?,'ready',?,?,? WHERE (SELECT count(*) FROM workflow_runs WHERE owner=? AND created>=?)<8",runId,owner,saved.name,saved.id&& !workflowCatalog.some(w=>w.id===saved.id)?saved.id:null,links.projectId,links.profileId,JSON.stringify(input),JSON.stringify(saved.steps),value.background?1:0,time,time,owner,time.slice(0,10));
  if(!inserted.meta.changes){const duplicate=await one('SELECT owner FROM workflow_runs WHERE id=?',runId);if(duplicate?.owner===owner)return workflowState(runId,owner);throw new AppError('You can start up to eight workflow runs per day.',429);}
  try{return await advanceWorkflow(runId,owner,false);}catch{return workflowState(runId,owner,false);}
}
export async function rerunWorkflow(runId:string,owner:string,value:any){
 const original=await owned('workflow_runs',runId,owner);
 return startSnapshot({name:original.name,input:JSON.parse(original.input),steps:JSON.parse(original.steps),snapshot:true},owner,{...value,projectId:original.project_id,profileId:original.profile_id});
}
export async function workflowState(runId: string, owner: string, update=true) {
  const record=await owned('workflow_runs',runId,owner);
  const rows=await all('SELECT * FROM reports WHERE workflow_run_id=? AND owner=? ORDER BY rowid',runId,owner);
  const latest=new Map<number,any>();for(const row of rows)latest.set(row.workflow_step,row);
  // Fetch the current provider response only; GET never launches a billed step.
  if(update)for(const [step,row] of latest)if(['starting','queued','in_progress'].includes(row.status))latest.set(step,await refresh(row));
  const steps=JSON.parse(record.steps);
  let next=0;while(next<steps.length&&latest.get(next)?.status==='completed')next++;
  const current=latest.get(next);
  let status=next===steps.length?'completed':current?(['starting','queued','in_progress'].includes(current.status)?'running':'paused'):record.error?'paused':'ready';
  if(record.lease_until&&record.lease_until>now())status='launching';
  if(record.status==='cancelled')status='cancelled';
  const error=record.error||(status==='paused'?(current?.error||'This step needs attention. Review its report before retrying.'):'');
  await run("UPDATE workflow_runs SET status=? WHERE id=? AND owner=? AND status<>'cancelled'",status,runId,owner);
  return {id:record.id,name:record.name,workflowId:record.workflow_id,pitchId:(await one('SELECT pitch_id FROM pitch_runs WHERE id=? AND owner=?',runId,owner))?.pitch_id||null,projectId:record.project_id,profileId:record.profile_id,input:JSON.parse(record.input),steps,reports:[...latest.values()].map(r=>publicReport(r)),attempts:rows.map(r=>publicReport(r)),status,nextStep:next,error,backgroundEnabled:!!record.background_enabled,backgroundReady:backgroundReady(),created:record.created,updated:record.updated};
}
export async function advanceWorkflow(runId: string,owner: string,retry: boolean,expected?:{step:number;reportId:string|null;backgroundOnly?:boolean}) {
  if(expected&&(!Number.isInteger(expected.step)||expected.step<0||expected.step>2))throw new AppError('Invalid expected workflow step.');
  const record=await owned('workflow_runs',runId,owner);
  if(record.status==='cancelled')throw new AppError('This workflow run has been stopped. Start a new run to continue.');
  const time=now(),lease=new Date(Date.now()+120000).toISOString();
  const claimed=await run('UPDATE workflow_runs SET lease_until=?,updated=? WHERE id=? AND owner=? AND (lease_until IS NULL OR lease_until<?) AND (?=0 OR background_enabled=1)',lease,time,runId,owner,time,expected?.backgroundOnly?1:0);
  if(!claimed.meta.changes)return workflowState(runId,owner,false);
  try {
    const state=await workflowState(runId,owner);
    if(state.status==='cancelled')return state;
    const current=state.reports.find(r=>r.workflowStep===state.nextStep);
    // A delayed retry from another tab must not start a different billed step,
    // or retry a replacement report that the caller has not reviewed.
    if(expected&&(expected.step!==state.nextStep||expected.reportId!==(current?.id||null)))return state;
    if(state.nextStep>=state.steps.length||current&&['starting','queued','in_progress'].includes(current.status))return state;
    if(current&&!retry)throw new AppError('Review the failed or partial step, then choose Retry step.');
    const step=state.steps[state.nextStep];
    // Both the prior report text and its source URLs are available to the next step.
    const prior=state.reports.filter(r=>r.workflowStep<state.nextStep).map(r=>`${r.title}\n${r.body.slice(0,8500)}\nSources: ${JSON.stringify(r.sources)}`).join('\n\n');
    await launch({...state.input,template:step.template,question:step.question,projectId:state.projectId,profileId:state.profileId},owner,null,{id:runId,step:state.nextStep,prior});
    await run("UPDATE workflow_runs SET status='running',error='',updated=? WHERE id=? AND owner=? AND status<>'cancelled'",now(),runId,owner);
  } catch(error) {
    await run("UPDATE workflow_runs SET status='paused',error=?,updated=? WHERE id=? AND owner=? AND status<>'cancelled'",error instanceof AppError?error.message:'The workflow step could not be launched. Retry this step.',now(),runId,owner);
    throw error;
  } finally {
    await run('UPDATE workflow_runs SET lease_until=NULL WHERE id=? AND owner=? AND lease_until=?',runId,owner,lease);
  }
  return workflowState(runId,owner,false);
}

export async function setWorkflowBackground(runId:string,owner:string,enabled:unknown){
 if(typeof enabled!=='boolean')throw new AppError('Choose a background execution state.');
 if(enabled&&!backgroundReady())throw new AppError('Background execution is not activated yet.',503);
 const state=await workflowState(runId,owner,enabled);
 if(['completed','cancelled'].includes(state.status))throw new AppError('This run has already finished.');
 if(enabled&&state.status==='paused')throw new AppError('Review and retry the failed step before enabling background mode.');
 await run('UPDATE workflow_runs SET background_enabled=?,updated=? WHERE id=? AND owner=?',enabled?1:0,now(),runId,owner);
 if(enabled&&state.status==='ready')return advanceWorkflow(runId,owner,false,{step:state.nextStep,reportId:null,backgroundOnly:true});
 return workflowState(runId,owner,false);
}
