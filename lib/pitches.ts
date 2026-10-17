import {all,one,run,db,owned,now,id,associations,attachmentContext} from './server';
import {AppError,bounded} from './research';
import {reference} from './collection-policy';
import {agencyInput,pitchInput,initialPlaybook,pitchResearch} from './pitch-policy';
import {startSnapshot,workflowState} from './workflow-engine';

const agencyView=(r:any)=>({id:r.id,...JSON.parse(r.data),archived:!!r.archived,revision:r.revision,updated:r.updated});
const pitchView=(r:any)=>({id:r.id,input:JSON.parse(r.input),agency:JSON.parse(r.agency),body:r.body,sources:JSON.parse(r.sources),revision:r.revision,archived:!!r.archived,projectId:r.project_id,profileId:r.profile_id,created:r.created,updated:r.updated});
function expected(value:any){if(!Number.isInteger(value)||value<1)throw new AppError('A saved revision is required. Reload this record.');return value;}
export async function listAgencies(owner:string){return (await all('SELECT * FROM agencies WHERE owner=? ORDER BY updated DESC',owner)).map(agencyView);}
export async function saveAgency(owner:string,value:any,record?:string){
 const data=agencyInput(value),time=now();
 if(record){const row=await owned('agencies',record,owner);if(value.archived!==undefined&&typeof value.archived!=='boolean')throw new AppError('Choose an archive state.');const result=await run('UPDATE agencies SET data=?,archived=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?',JSON.stringify(data),value.archived===undefined?row.archived:value.archived?1:0,time,record,owner,expected(value.expectedRevision));if(!result.meta.changes)throw new AppError('These credentials changed in another tab. Reload before saving.',409);}
 else{record=id();const inserted=await run('INSERT INTO agencies (id,owner,data,created,updated) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM agencies WHERE owner=?)<30',record,owner,JSON.stringify(data),time,time,owner);if(!inserted.meta.changes)throw new AppError('This workspace supports 30 saved agency profiles.');}
 return agencyView(await owned('agencies',record,owner));
}
async function snapshotAgency(agencyId:string|null,owner:string){if(!agencyId)return null;const row=await owned('agencies',agencyId,owner);if(row.archived)throw new AppError('Restore these agency credentials before using them in a new snapshot.');return JSON.parse(row.data);}
async function validateFiles(input:any,owner:string){await attachmentContext(input,owner);}
export async function listPitches(owner:string){return (await all('SELECT id,input,revision,archived,project_id,profile_id,created,updated FROM pitches WHERE owner=? ORDER BY updated DESC',owner)).map(r=>({...r,input:JSON.parse(r.input)}));}
export async function pitchState(record:string,owner:string){
 const row=await owned('pitches',record,owner);
 const runs=await all('SELECT p.id,p.created,w.status,w.error FROM pitch_runs p LEFT JOIN workflow_runs w ON w.id=p.id AND w.owner=p.owner WHERE p.pitch_id=? AND p.owner=? ORDER BY p.created DESC LIMIT 50',record,owner);
 return {...pitchView(row),runs,versions:await all('SELECT id,revision,label,created FROM pitch_versions WHERE pitch_id=? AND owner=? ORDER BY revision DESC LIMIT 100',record,owner)};
}
export async function createPitch(owner:string,value:any){
 const record=reference(value.requestId,'Request ID')||id(),duplicate=await one('SELECT owner FROM pitches WHERE id=?',record);
 if(duplicate){if(duplicate.owner!==owner)throw new AppError('This request ID is already in use.',409);return pitchState(record,owner);}
 const input=pitchInput(value.input),agency=await snapshotAgency(input.agencyId,owner),links=await associations(value,owner);await validateFiles(input,owner);
 const time=now(),body=initialPlaybook(input);
 const result=await db().batch([
  db().prepare('INSERT OR IGNORE INTO pitches (id,owner,input,agency,body,project_id,profile_id,created,updated) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM pitches WHERE owner=?)<100').bind(record,owner,JSON.stringify(input),JSON.stringify(agency),body,links.projectId,links.profileId,time,time,owner),
  db().prepare("INSERT OR IGNORE INTO pitch_versions (id,owner,pitch_id,revision,body,sources,context_snapshot,label,created) SELECT ?,owner,id,1,body,sources,json_object('input',json(input),'agency',json(agency),'projectId',project_id,'profileId',profile_id),'Initial manual draft',created FROM pitches WHERE id=? AND owner=?").bind(id(),record,owner)
 ]);
 if(!result[0].meta.changes&&!await one('SELECT id FROM pitches WHERE id=? AND owner=?',record,owner))throw new AppError('This workspace supports 100 saved pitches.');
 return pitchState(record,owner);
}
async function revise(row:any,owner:string,value:any,label:string,override?:{body:string;sources:any[];agency?:any}){
 const revision=expected(value.expectedRevision);
 if(value.archived!==undefined&&typeof value.archived!=='boolean')throw new AppError('Choose an archive state.');
 if(value.refreshAgency!==undefined&&typeof value.refreshAgency!=='boolean')throw new AppError('Choose whether to refresh agency credentials.');
 const previous=JSON.parse(row.input),input=value.input===undefined?previous:pitchInput(value.input);
 if(value.input!==undefined)await validateFiles(input,owner);
 const links=await associations({projectId:value.projectId===undefined?row.project_id:value.projectId,profileId:value.profileId===undefined?row.profile_id:value.profileId},owner);
 const agency=override&&Object.hasOwn(override,"agency")?override.agency:input.agencyId!==previous.agencyId||value.refreshAgency?await snapshotAgency(input.agencyId,owner):JSON.parse(row.agency);
 const body=override?.body??(value.body===undefined?row.body:bounded(value.body,'Playbook',50000,true)),sources=override?.sources??JSON.parse(row.sources),time=now();
 if(body.length>50000)throw new AppError('The playbook is too long (maximum 50,000 characters).');
 const results=await db().batch([
  db().prepare('UPDATE pitches SET input=?,agency=?,body=?,sources=?,project_id=?,profile_id=?,archived=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(input),JSON.stringify(agency),body,JSON.stringify(sources),links.projectId,links.profileId,value.archived===undefined?row.archived:value.archived?1:0,time,row.id,owner,revision),
  db().prepare("INSERT OR IGNORE INTO pitch_versions (id,owner,pitch_id,revision,body,sources,context_snapshot,label,created) SELECT ?,owner,id,revision,body,sources,json_object('input',json(input),'agency',json(agency),'projectId',project_id,'profileId',profile_id),?,updated FROM pitches WHERE id=? AND owner=? AND revision=?").bind(id(),label,row.id,owner,revision+1)
 ]);
 if(!results[0].meta.changes)throw new AppError('This pitch changed in another tab. Your edits were not saved. Reload the latest revision and merge your changes.',409);
 return pitchState(row.id,owner);
}
export async function updatePitch(record:string,owner:string,value:any){return revise(await owned('pitches',record,owner),owner,value,'Manual edit / intake update');}
export async function startPitchResearch(record:string,owner:string,value:any){
 const row=await owned('pitches',record,owner);if(row.archived)throw new AppError('Restore this pitch before starting research.');
 const runId=reference(value.requestId,'Request ID');if(!runId)throw new AppError('A research request ID is required.');
 let saved=await one('SELECT * FROM pitch_runs WHERE id=?',runId);
 if(saved&&(saved.owner!==owner||saved.pitch_id!==record))throw new AppError('This request ID is already in use.',409);
 if(!saved){const input=pitchResearch(JSON.parse(row.input),JSON.parse(row.agency)),snapshot={snapshot:true,name:JSON.parse(row.input).name+' · Pitch research',input,steps:[{name:'Brief, fit and pitch angles',template:'pitch',question:input.question}],projectId:row.project_id,profileId:row.profile_id};
  await run('INSERT OR IGNORE INTO pitch_runs (id,owner,pitch_id,snapshot,created) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM pitch_runs WHERE pitch_id=? AND owner=?)<50',runId,owner,record,JSON.stringify(snapshot),now(),record,owner);
  saved=await one('SELECT * FROM pitch_runs WHERE id=?',runId);if(!saved)throw new AppError('This pitch supports 50 research attempts.');
  if(saved.owner!==owner||saved.pitch_id!==record)throw new AppError('This request ID is already in use.',409);
 }
 const snapshot=JSON.parse(saved.snapshot);
 return startSnapshot(snapshot,owner,{requestId:runId,projectId:snapshot.projectId,profileId:snapshot.profileId});
}
export async function importPitchResearch(record:string,owner:string,value:any){
 const pitch=await owned('pitches',record,owner),runId=reference(value.runId,'Research run');const link=runId?await owned('pitch_runs',runId,owner):null;
 if(!link||link.pitch_id!==record)throw new AppError('Choose research belonging to this pitch.',404);
 const state=await workflowState(runId!,owner);const report=state.reports[0];
 if(state.status!=='completed'||report?.status!=='completed')throw new AppError('Finish the cited research successfully before importing it. Your existing playbook is unchanged.',409);
 return revise(pitch,owner,value,'Imported research '+report.id,{body:report.body,sources:report.sources});
}
export async function pitchVersion(record:string,version:string,owner:string){const row=await owned('pitch_versions',version,owner);if(row.pitch_id!==record)throw new AppError('Revision not found.',404);return {...row,sources:JSON.parse(row.sources)};}
export async function restorePitchVersion(record:string,owner:string,value:any){const row=await owned('pitches',record,owner),version=await pitchVersion(record,reference(value.versionId,'Revision')||'',owner);if(value.allContext===true){if(!version.context_snapshot)throw new AppError('This legacy revision has no saved brief/agency snapshot. Restore the playbook only.');const saved=JSON.parse(version.context_snapshot);return revise(row,owner,{...value,input:saved.input,projectId:saved.projectId,profileId:saved.profileId},'Restored complete revision '+version.revision,{body:version.body,sources:version.sources,agency:saved.agency});}return revise(row,owner,value,'Restored playbook revision '+version.revision,{body:version.body,sources:version.sources});}
