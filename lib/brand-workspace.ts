import {all,one,run,owned,db,id,now,syncBrandMonitors,managedBrandInput} from './server';
import {AppError,bounded} from './research';
function fields(v:any){return {name:bounded(v.name,'Brand or topic name',200,true),website:bounded(v.website,'Website',500),market:bounded(v.market,'Market',100)||'Global',competitors:bounded(v.competitors,'Competitors',1000),audience:bounded(v.audience,'Audience',500),context:bounded(v.context,'Context',12000)};}
export async function saveProfile(owner:string,value:any,record?:string){
 const v=fields(value);
 if(!record){const profileId=id();await run('INSERT INTO profiles (id,owner,name,website,market,competitors,audience,context,created) VALUES (?,?,?,?,?,?,?,?,?)',profileId,owner,v.name,v.website,v.market,v.competitors,v.audience,v.context,now());await syncBrandMonitors(owner);return owned('profiles',profileId,owner);}
 await owned('profiles',record,owner);
 const expected=value.expectedRevision;if(!Number.isSafeInteger(expected)||expected<1)throw new AppError('Provide the saved brand revision. Reload its context before editing.');
 const result=await db().batch([
  db().prepare('UPDATE profiles SET name=?,website=?,market=?,competitors=?,audience=?,context=?,revision=revision+1 WHERE id=? AND owner=? AND revision=?').bind(v.name,v.website,v.market,v.competitors,v.audience,v.context,record,owner,expected),
  db().prepare('UPDATE monitors SET name=?,input=? WHERE managed_profile_id=? AND owner=? AND changes()>0').bind(v.name.slice(0,170)+' · Weekly India',JSON.stringify(managedBrandInput({...v,id:record})),record,owner)
 ]);
 if(!result[0].meta.changes)throw new AppError('This brand changed since you opened it. Copy any draft text you need, then reload the saved context before editing again.',409);
 return owned('profiles',record,owner);
}
export async function brandWorkspace(record:string,owner:string){
 const profile=await owned('profiles',record,owner);
 const [counts,reports,projects,files,automaticRule]=await Promise.all([
 one(`SELECT (SELECT count(*) FROM reports WHERE owner=? AND profile_id=?) AS reports,(SELECT count(*) FROM projects WHERE owner=? AND profile_id=?) AS projects,(SELECT count(*) FROM attachments WHERE owner=? AND profile_id=? AND archived=0) AS activeFiles,(SELECT count(*) FROM attachments WHERE owner=? AND profile_id=? AND archived=1) AS archivedFiles,(SELECT count(*) FROM workflows WHERE owner=? AND json_extract(input,'$.profileId')=?) AS workflows,(SELECT count(*) FROM conversations WHERE owner=? AND profile_id=?) AS conversations`,...Array.from({length:6},()=>[owner,record]).flat()),
 all('SELECT id,title,status,created FROM reports WHERE owner=? AND profile_id=? ORDER BY created DESC,id DESC LIMIT 10',owner,record),
 all('SELECT id,name,description FROM projects WHERE owner=? AND profile_id=? ORDER BY updated DESC,id DESC LIMIT 10',owner,record),
 all('SELECT id,name,format FROM attachments WHERE owner=? AND profile_id=? AND archived=0 ORDER BY created DESC,id DESC LIMIT 10',owner,record),
 one('SELECT id,name,enabled,next_run,error,last_report FROM monitors WHERE owner=? AND managed_profile_id=?',owner,record)
 ]);
 return {profile,counts,reports,projects,files,automaticRule};
}
