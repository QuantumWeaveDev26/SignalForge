import {db,digest,one,now,managedBrandInput} from './server';
import {AppError,validateResearch} from './research';
import {pitchInput} from './pitch-policy';
import {managerDemo} from './manager-demo-data';

/** Save this fixed prepared pack only. Authentication/CSRF are enforced by the workspace route. */
export async function saveManagerDemo(owner:string){
 const suffix=await digest(owner),keys=Object.fromEntries(['brand','project','report','pitch','monitor','version'].map(kind=>[kind,'demo1-'+kind+'-'+suffix]));
 // Protect even a hypothetical ID collision; retries never overwrite saved edits.
 for(const [kind,table] of [['brand','profiles'],['project','projects'],['report','reports'],['pitch','pitches'],['monitor','monitors'],['version','pitch_versions']]){
  const row=await one(`SELECT owner FROM ${table} WHERE id=?`,keys[kind]);if(row&&row.owner!==owner)throw new AppError('This demo record is unavailable.',409);
 }
 if(!await one('SELECT id FROM pitches WHERE id=? AND owner=?',keys.pitch,owner)&&(await one('SELECT count(*) AS n FROM pitches WHERE owner=?',owner)).n>=100)throw new AppError('This workspace supports 100 saved pitches.');
 const time=now(),brand={...managerDemo.brand,id:keys.brand},sources=JSON.stringify(managerDemo.sources);
 const input={...validateResearch({template:'custom',subject:brand.name,market:brand.market,audience:brand.audience,competitors:brand.competitors,context:brand.context,window:'Current landscape',question:'How could a fictional new coffee brand introduce an at-home offer to Bengaluru office workers while differentiating from Blue Tokai, Sleepy Owl and Third Wave Coffee?'}),origin:'prepared_demo',reviewedOn:managerDemo.reviewedOn};
 const pitch=pitchInput({...managerDemo.pitchInput,attachmentIds:[]});
 await db().batch([
  db().prepare('INSERT OR IGNORE INTO profiles (id,owner,name,website,market,competitors,audience,context,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(keys.brand,owner,brand.name,brand.website,brand.market,brand.competitors,brand.audience,brand.context,time),
  db().prepare('INSERT OR IGNORE INTO projects (id,owner,name,description,profile_id,created,updated) VALUES (?,?,?,?,?,?,?)').bind(keys.project,owner,'DEMO Coffee Launch','Fictional manager demonstration: prepared research and pitch playbook. No new AI run.',keys.brand,time,time),
  db().prepare("INSERT OR IGNORE INTO reports (id,owner,title,template,subject,market,question,input,status,body,sources,usage,project_id,profile_id,favorite,labels,created,updated) VALUES (?,?,?,?,?,?,?,?,'completed',?,?,?,?,?,1,?,?,?)").bind(keys.report,owner,'DEMO Coffee Launch — Prepared Research','custom',brand.name,brand.market,input.question,JSON.stringify(input),managerDemo.reportBody,sources,JSON.stringify({origin:'prepared_demo',providerCalls:0,reviewedOn:managerDemo.reviewedOn}),keys.project,keys.brand,JSON.stringify(['Prepared demo','Manager demo']),time,time),
  db().prepare('INSERT OR IGNORE INTO pitches (id,owner,input,agency,body,sources,project_id,profile_id,created,updated) VALUES (?,?,?,\'null\',?,?,?,?,?,?)').bind(keys.pitch,owner,JSON.stringify(pitch),managerDemo.pitchBody.replaceAll('REPORT_PATH','/workspace/reports/'+keys.report),sources,keys.project,keys.brand,time,time),
  db().prepare("INSERT OR IGNORE INTO pitch_versions (id,owner,pitch_id,revision,body,sources,label,created) SELECT ?,owner,id,1,body,sources,'Prepared demo import — not a live research run',created FROM pitches WHERE id=? AND owner=? AND revision=1").bind(keys.version,keys.pitch,owner),
  // Insert paused in the SAME transaction as the brand, before any dispatcher can see it.
  db().prepare('INSERT OR IGNORE INTO monitors (id,owner,name,input,cadence,enabled,next_run,created,managed_profile_id) VALUES (?,?,?,?,\'weekly\',0,?,?,?)').bind(keys.monitor,owner,brand.name+' · Weekly India',JSON.stringify(managedBrandInput(brand)),time,time,keys.brand)
 ]);
 return {pack:managerDemo.pack,reportId:keys.report,pitchId:keys.pitch,profileId:keys.brand,projectId:keys.project,prepared:true};
}
