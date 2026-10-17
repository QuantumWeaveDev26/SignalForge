import {getApplicationUser} from './application-auth';
import {all,one,run,db,owned,id,now,digest} from './server';
import {AppError,bounded,safeUrl} from './research';

// Client identities deliberately ignore workspace-selection cookies and developer keys.
export async function portalIdentity(req:Request){
 if(req.headers.has('authorization'))throw new AppError('Sign in with your verified SignalForge account.',401);
 const user=await getApplicationUser();if(!user||user.authSource!=='signalforge'||!user.userId)throw new AppError('Sign in with your verified SignalForge account.',401);
 if(req.method!=='GET'&&(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site'))throw new AppError('Send this action from SignalForge.',403);
 return user;
}
function manager(who:any){if(who.api||who.authSource!=='signalforge'||!who.userId||who.workspaceId&&who.role!=='owner')throw new AppError('Only the workspace owner can manage external sharing.',403);}
function keys(v:any,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw new AppError('Unsupported portal setting.');}
function permissions(v:any){if(typeof v.comment!=='boolean'||typeof v.download!=='boolean')throw new AppError('Choose comment and download permissions.');return {comment:v.comment?1:0,download:v.download?1:0};}
function expiry(v:any){if(!Number.isInteger(v)||v<1||v>90)throw new AppError('Access expires in 1 to 90 days.');return new Date(Date.now()+v*86400000).toISOString();}
function email(v:any){const e=bounded(v,'Client email',254,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))throw new AppError('Enter a valid client email.');return e;}
function sources(v:string){return JSON.parse(v||'[]').slice(0,200).map((s:any)=>{const url=safeUrl(s.url)||'';return {title:url?bounded(String(s.title||'Source'),'Source title',2000):'Source unavailable (unsafe link omitted)',url,cited:url?!!s.cited:false};});}
export async function portalSnapshot(owner:string,v:any){
 if(!['report','pitch'].includes(v.kind))throw new AppError('Choose a report or pitch.');
 const record=bounded(v.sourceId,'Saved item',80,true),row=await owned(v.kind==='report'?'reports':'pitches',record,owner);
 if(v.kind==='report'){
  if(!['completed','incomplete'].includes(row.status)||!row.body.trim())throw new AppError('Publish a finished or clearly labelled partial report.');
  if(v.expectedUpdated!==row.updated)throw new AppError('The report changed. Preview it again before publishing.',409);
  return {kind:'report',sourceId:record,revision:null,title:row.title,body:row.body,sources:sources(row.sources),status:row.status,sourceUpdated:row.updated};
 }
 if(row.archived)throw new AppError('Restore the pitch before publishing it.');
 if(v.expectedRevision!==row.revision)throw new AppError('The pitch changed. Preview it again before publishing.',409);
 return {kind:'pitch',sourceId:record,revision:row.revision,title:JSON.parse(row.input).name||'Pitch playbook',body:row.body,sources:sources(row.sources),status:'draft',sourceUpdated:row.updated};
}
const grantColumns='id,email,can_comment,can_download,expires,state,revision,created';
async function portalOwned(record:string,owner:string){const row=await one('SELECT * FROM client_portals WHERE id=? AND owner=?',record,owner);if(!row)throw new AppError('Portal not found.',404);return row;}
const clientSnapshot=(r:any)=>({id:r.id,title:r.title,...JSON.parse(r.snapshot),published:r.created});
export async function managePortals(req:Request,who:any,parts:string[],v:any){
 manager(who);const owner=who.owner,[,record,action,target]=parts,method=req.method;
 if(!record&&method==='GET')return {items:await all('SELECT id,name,created FROM client_portals WHERE owner=? ORDER BY created DESC',owner)};
 if(!record&&method==='POST'){keys(v,['name']);const record=id(),name=bounded(v.name,'Portal name',100,true);const r=await run('INSERT INTO client_portals (id,owner,name,created) SELECT ?,?,?,? WHERE (SELECT count(*) FROM client_portals WHERE owner=?)<30',record,owner,name,now(),owner);if(!r.meta.changes)throw new AppError('This workspace supports 30 client portals.');return {id:record,name};}
 if(record==='preview'&&method==='POST'){keys(v,['kind','sourceId','expectedRevision','expectedUpdated']);const snapshot=await portalSnapshot(owner,v);return snapshot;}
 await portalOwned(record,owner);
 if(method==='GET'&&!action)return {portal:await portalOwned(record,owner),items:(await all('SELECT * FROM portal_items WHERE portal_id=? ORDER BY created DESC',record)).map(r=>({...clientSnapshot(r),sourceId:r.source_id,withdrawn:!!r.withdrawn})),grants:await all(`SELECT ${grantColumns} FROM portal_grants WHERE portal_id=? ORDER BY created DESC`,record)};
 if(method==='POST'&&action==='items'&&!target){
  keys(v,['kind','sourceId','expectedRevision','expectedUpdated','acknowledged']);if(v.acknowledged!==true)throw new AppError('Review the snapshot and confirm it is suitable for clients.');
  const s=await portalSnapshot(owner,v);if(s.body.length>200000)throw new AppError('Narrow this document before publishing (maximum 200,000 characters).');const item=id(),{sourceId,...snapshot}=s;
  const r=await run('INSERT INTO portal_items (id,portal_id,source_id,title,snapshot,created) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM portal_items WHERE portal_id=?)<100',item,record,sourceId,s.title,JSON.stringify(snapshot),now(),record);if(!r.meta.changes)throw new AppError('This portal supports 100 snapshots.');return {id:item};
 }
 if(method==='DELETE'&&action==='items'&&target){await run('UPDATE portal_items SET withdrawn=1 WHERE id=? AND portal_id=?',target,record);return {ok:true};}
 if(method==='POST'&&action==='grants'&&!target){
  keys(v,['email','comment','download','days']);const p=permissions(v),address=email(v.email),expires=expiry(v.days),token=id()+id(),grant=id(),time=now();
  const r=await db().batch([
   db().prepare("UPDATE portal_grants SET state='revoked',revision=revision+1 WHERE portal_id=? AND email=? AND state!='revoked'").bind(record,address),
   db().prepare("INSERT INTO portal_grants (id,portal_id,email,can_comment,can_download,digest,expires,created) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM portal_grants WHERE portal_id=? AND state!='revoked' AND expires>?)<100").bind(grant,record,address,p.comment,p.download,await digest(token),expires,time,record,time)
  ]);if(!r[1].meta.changes)throw new AppError('Revoke unused client access first (maximum 100 active invitations).');return {id:grant,token,expires};
 }
 if(method==='DELETE'&&action==='grants'&&target){await run("UPDATE portal_grants SET state='revoked',revision=revision+1 WHERE id=? AND portal_id=?",target,record);return {ok:true};}
 if(method==='PATCH'&&action==='grants'&&target){keys(v,['comment','download','days','expectedRevision']);const p=permissions(v);if(!Number.isInteger(v.expectedRevision))throw new AppError('Reload this permission.');const r=await run("UPDATE portal_grants SET can_comment=?,can_download=?,expires=?,revision=revision+1 WHERE id=? AND portal_id=? AND state!='revoked' AND expires>? AND revision=?",p.comment,p.download,expiry(v.days),target,record,now(),v.expectedRevision);if(!r.meta.changes)throw new AppError('This access changed, expired or was revoked. Reload before editing.',409);return {ok:true};}
 if(method==='GET'&&action==='comments')return {items:await all('SELECT c.id,c.item_id,c.grant_id,c.author,c.body,c.created,g.email FROM portal_comments c JOIN portal_grants g ON g.id=c.grant_id WHERE g.portal_id=? ORDER BY c.created DESC,c.id DESC LIMIT 100',record)};
 if(method==='POST'&&action==='comments'){
  keys(v,['grantId','itemId','body','requestId']);const text=bounded(v.body,'Reply',4000,true),request=bounded(v.requestId,'Request ID',80,true);
  const r=await run("INSERT OR IGNORE INTO portal_comments (id,item_id,grant_id,actor,author,body,created) SELECT ?,i.id,g.id,?,?,?,? FROM portal_grants g JOIN portal_items i ON i.portal_id=g.portal_id WHERE g.id=? AND i.id=? AND g.portal_id=? AND g.state='active' AND g.expires>? AND i.withdrawn=0 AND (SELECT count(*) FROM portal_comments WHERE grant_id=g.id AND item_id=i.id)<200",request,who.userId,'Workspace owner',text,now(),v.grantId||'',v.itemId||'',record,now());if(!r.meta.changes&&!await one('SELECT id FROM portal_comments WHERE id=? AND grant_id=? AND actor=? AND item_id=? AND body=?',request,v.grantId||'',who.userId,v.itemId||'',text))throw new AppError('This client, snapshot or conversation is unavailable.',403);return {ok:true};
 }
 throw new AppError('Portal action not found.',404);
}
// Both stable user ID and current verified email must continue matching the grant.
async function access(portal:string,user:any){const g=await one("SELECT * FROM portal_grants WHERE portal_id=? AND user_id=? AND email=? AND state='active' AND expires>?",portal,user.userId,user.email.toLowerCase(),now());if(!g)throw new AppError('Client access is unavailable, expired or revoked.',404);return g;}
export async function clientPortal(req:Request,user:any,parts:string[],v:any){
 const[record,action,target]=parts,method=req.method,address=user.email.toLowerCase();
 if(method==='POST'&&record==='accept'){
  keys(v,['token']);const token=bounded(v.token,'Invitation token',160,true);if(!/^[a-zA-Z0-9-]{40,160}$/.test(token))throw new AppError('Invalid invitation.',403);
  const hash=await digest(token),invite=await one("SELECT id,portal_id FROM portal_grants WHERE digest=? AND email=? AND state='pending' AND expires>?",hash,address,now());if(!invite)throw new AppError('This invitation is expired, revoked, already used or belongs to another verified email.',403);
  const r=await run("UPDATE portal_grants SET state='active',user_id=?,revision=revision+1 WHERE id=? AND digest=? AND email=? AND state='pending' AND expires>?",user.userId,invite.id,hash,address,now());if(!r.meta.changes)throw new AppError('This invitation changed. Ask the owner for a new link.',409);return {id:invite.portal_id};
 }
 if(method==='GET'&&!record)return {items:await all("SELECT p.id,p.name,g.can_comment,g.can_download,g.expires FROM client_portals p JOIN portal_grants g ON p.id=g.portal_id WHERE g.user_id=? AND g.email=? AND g.state='active' AND g.expires>? ORDER BY p.created DESC",user.userId,address,now())};
 const g=await access(record,user);
 if(method==='GET'&&!action){const portal=await one('SELECT id,name FROM client_portals WHERE id=?',record);return {portal,permissions:{comment:!!g.can_comment,download:!!g.can_download},expires:g.expires,items:(await all('SELECT id,title,snapshot,created FROM portal_items WHERE portal_id=? AND withdrawn=0 ORDER BY created DESC',record)).map(clientSnapshot)};}
 if(action==='items'&&target){
  const item=await one('SELECT * FROM portal_items WHERE id=? AND portal_id=? AND withdrawn=0',target,record);if(!item)throw new AppError('Snapshot unavailable.',404);
  const sub=parts[3];
  if(method==='GET'&&sub==='download'){
   if(!g.can_download)throw new AppError('Document downloads are disabled by the owner.',403);
   const snapshot=clientSnapshot(item);const text=`# ${snapshot.title}\n\nPublished snapshot: ${item.created}${snapshot.revision?' · pitch revision '+snapshot.revision:''}\nStatus: ${snapshot.status}\n\n${snapshot.body}\n\n## Sources\n${snapshot.sources.map((s:any,i:number)=>`[${i+1}] ${s.title}: ${s.url}`).join('\n')}`;
   return new Response(text,{headers:{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="SignalForge-snapshot.md"','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
  }
  if(method==='GET'&&sub==='comments')return {items:await all('SELECT id,author,body,created FROM portal_comments WHERE grant_id=? AND item_id=? ORDER BY created DESC,id DESC LIMIT 100',g.id,item.id)};
  if(method==='POST'&&sub==='comments'){
   keys(v,['body','requestId']);if(!g.can_comment)throw new AppError('Comments are disabled by the owner.',403);const text=bounded(v.body,'Comment',4000,true),request=bounded(v.requestId,'Request ID',80,true),time=now();
   const r=await run("INSERT OR IGNORE INTO portal_comments (id,item_id,grant_id,actor,author,body,created) SELECT ?,i.id,g.id,?,?,?,? FROM portal_grants g JOIN portal_items i ON i.portal_id=g.portal_id WHERE g.id=? AND g.user_id=? AND g.email=? AND g.state='active' AND g.can_comment=1 AND g.expires>? AND i.id=? AND i.withdrawn=0 AND (SELECT count(*) FROM portal_comments WHERE grant_id=g.id AND item_id=i.id)<200",request,user.userId,bounded(user.name||'Client','Name',100),text,time,g.id,user.userId,address,time,item.id);
   if(!r.meta.changes&&!await one('SELECT id FROM portal_comments WHERE id=? AND grant_id=? AND actor=? AND item_id=? AND body=?',request,g.id,user.userId,item.id,text))throw new AppError('Comment access changed or the 200-comment limit was reached.',403);return {ok:true};
  }
 }
 throw new AppError('Portal action not found.',404);
}
