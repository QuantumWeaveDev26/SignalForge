import {one,run,now,persistResponse} from './server';
import {provider,backgroundReady} from './provider';
import {persistTurn} from './conversations';
import {advanceWorkflow,workflowState} from './workflow-engine';
import {AppError} from './research';

type Delivery={id:string;responseId:string;type:string};

export async function receiveBackgroundEvent(event:Delivery){
 const time=now();
 await run("INSERT OR IGNORE INTO background_events (id,response_id,type,state,created,updated) VALUES (?,?,?,'pending',?,?)",event.id,event.responseId,event.type,time,time);
 const saved=await one('SELECT * FROM background_events WHERE id=?',event.id);
 if(saved.response_id!==event.responseId||saved.type!==event.type)throw new AppError('Delivery ID conflict.',409);
 if(saved.state==='done')return {received:true,duplicate:true};
 const lease=new Date(Date.now()+90000).toISOString();
 const claimed=await run("UPDATE background_events SET state='processing',lease_until=?,updated=? WHERE id=? AND state<>'done' AND (lease_until IS NULL OR lease_until<?)",lease,time,event.id,time);
 if(!claimed.meta.changes)throw new AppError('Delivery is already being processed. Retry later.',503);
 try{
  const result=await synchronizeResponse(event.responseId);
  await run("UPDATE background_events SET state='done',lease_until=NULL,error='',updated=? WHERE id=? AND lease_until=?",now(),event.id,lease);
  return {received:true,...result};
 }catch(error){
  // Return a failure so OpenAI retries. Never acknowledge unfinished work.
  await run("UPDATE background_events SET state='pending',lease_until=NULL,error='Delivery processing needs retry.',updated=? WHERE id=? AND lease_until=?",now(),event.id,lease);
  throw error;
 }
}

async function synchronizeResponse(responseId:string){
 let report=await one('SELECT * FROM reports WHERE response_id=?',responseId);
 let turn=report?null:await one('SELECT * FROM conversation_turns WHERE response_id=?',responseId);
 let response:any;
 if(!report&&!turn){
  // A fast completion can arrive before the launch request saves response_id.
  response=await provider('responses/'+encodeURIComponent(responseId));
  const reportId=response.metadata?.signalforge_report_id,turnId=response.metadata?.signalforge_turn_id;
  if(typeof reportId==='string')report=await one("SELECT * FROM reports WHERE id=? AND response_id IS NULL AND status='starting'",reportId);
  if(!report&&typeof turnId==='string')turn=await one("SELECT * FROM conversation_turns WHERE id=? AND response_id IS NULL AND status='starting'",turnId);
 }
 if(!report&&!turn)return {ignored:true}; // Other apps in this API project are not ours.
 const row=report||turn;
 if(['starting','queued','in_progress'].includes(row.status)){
  response ||= await provider('responses/'+encodeURIComponent(responseId));
  if(response.id!==responseId)throw new AppError('Response reference did not match.',503);
  if(['queued','in_progress'].includes(response.status))throw new AppError('Response is not terminal yet.',503);
  if(report)await persistResponse(report.id,report.owner,response);else await persistTurn(turn,response);
 }
 if(!report?.workflow_run_id)return {synchronized:true};
 const record=await one('SELECT * FROM workflow_runs WHERE id=? AND owner=?',report.workflow_run_id,report.owner);
 if(!backgroundReady()||!record||!record.background_enabled||record.status==='cancelled')return {synchronized:true};
 if(record.lease_until&&record.lease_until>now())throw new AppError('Workflow launch is still being saved. Retry later.',503);
 const state=await workflowState(record.id,record.owner,false);
 const latest=state.reports.find(r=>r.workflowStep===report.workflow_step);
 if(latest?.id!==report.id)return {synchronized:true}; // An earlier failed attempt cannot control a retry.
 if(state.status==='paused'){
  await run('UPDATE workflow_runs SET background_enabled=0 WHERE id=? AND owner=?',record.id,record.owner);
  return {synchronized:true,paused:true};
 }
 if(state.status==='ready'&&state.nextStep===report.workflow_step+1){
  try{
   const next=await advanceWorkflow(record.id,record.owner,false,{step:state.nextStep,reportId:null,backgroundOnly:true});
   if(next.backgroundEnabled&&next.status==='ready'&&next.nextStep===state.nextStep)throw new AppError('Workflow is busy. Retry later.',503);
   return {synchronized:true,advanced:true};
  }catch(error){
   const current=await one('SELECT status FROM workflow_runs WHERE id=? AND owner=?',record.id,record.owner);
   if(current?.status!=='paused')throw error;
   await run('UPDATE workflow_runs SET background_enabled=0 WHERE id=? AND owner=?',record.id,record.owner);
   return {synchronized:true,paused:true};
  }
 }
 return {synchronized:true};
}
