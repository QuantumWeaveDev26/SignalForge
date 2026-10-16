import {env} from 'cloudflare:workers';
import {all,one,run,owned,associations,id,now} from './server';
import {AppError,bounded} from './research';
import {extractFile,MAX_FILE_BYTES} from './file-extraction';

const columns='id,name,bytes,created,format,text_chars,sections,warning,archived,project_id,profile_id';
export function listContextFiles(owner:string,archived=false){return all(`SELECT ${columns} FROM attachments WHERE owner=? ${archived?'':'AND archived=0'} ORDER BY created DESC`,owner);}
export async function contextFileMetadata(record:string,owner:string){return one(`SELECT ${columns} FROM attachments WHERE id=? AND owner=?`,record,owner);}
async function limitedForm(req:Request){
  const limit=MAX_FILE_BYTES+65536;
  if(Number(req.headers.get('content-length')||0)>limit)throw new AppError('Uploads must be under 5 MB.',413);
  if(!req.body)throw new AppError('Choose a file to upload.');
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new AppError('Uploads must be under 5 MB.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();}catch{throw new AppError('Choose a file using the upload form.');}
}
export async function uploadContextFile(req:Request,owner:string){
  if(!env.BUCKET)throw new AppError('File storage is unavailable.',503);
  const count=await one('SELECT count(*) AS total,sum(CASE WHEN archived=0 THEN 1 ELSE 0 END) AS active FROM attachments WHERE owner=?',owner);
  if(count.total>=100||count.active>=20)throw new AppError('This workspace supports 20 active files and 100 stored files. Archive an active file before uploading another.');
  const form=await limitedForm(req),file=form.get('file');if(!(file instanceof File))throw new AppError('Choose a supported file.');
  const links=await associations({projectId:form.get('projectId'),profileId:form.get('profileId')},owner);
  const parsed=await extractFile(file);const record=id(),key=`context/${owner}/${record}`,originalKey=key+'/original';
  const name=file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,200)||'Context file';
  try{
    await env.BUCKET.put(originalKey,file.stream(),{httpMetadata:{contentType:'application/octet-stream'}});
    await env.BUCKET.put(key,parsed.text,{httpMetadata:{contentType:'text/plain;charset=utf-8'}});
    const result=await run(`INSERT INTO attachments (id,owner,name,key,bytes,created,original_key,format,text_chars,sections,warning,project_id,profile_id) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM attachments WHERE owner=?)<100 AND (SELECT count(*) FROM attachments WHERE owner=? AND archived=0)<20`,record,owner,name,key,file.size,now(),originalKey,parsed.format,parsed.text.length,parsed.sections,parsed.warning,links.projectId,links.profileId,owner,owner);
    if(!result.meta.changes)throw new AppError('The file allowance was reached. Archive an active file and retry.',409);
  }catch(error){await Promise.allSettled([env.BUCKET.delete(originalKey),env.BUCKET.delete(key)]);throw error;}
  return contextFileMetadata(record,owner);
}
export async function previewContextFile(record:string,owner:string){
  const row=await owned('attachments',record,owner);const object=await env.BUCKET?.get(row.key);
  if(!object)throw new AppError('This file could not be read. Upload it again.',404);
  return {file:await contextFileMetadata(record,owner),text:await object.text()};
}
export async function downloadContextFile(record:string,owner:string){
  const row=await owned('attachments',record,owner);const object=await env.BUCKET?.get(row.original_key||row.key);
  if(!object)throw new AppError('This file could not be downloaded.',404);
  const filename=row.format==='text'||row.name.toLowerCase().endsWith('.'+row.format)?row.name:row.name+'.'+row.format;
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="context-file"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export async function updateContextFile(record:string,owner:string,value:any){
  const row=await owned('attachments',record,owner);
  if(value.archived!==undefined&&typeof value.archived!=='boolean')throw new AppError('Provide an archived state.');
  const name=value.name===undefined?row.name:bounded(value.name,'File name',200,true).replace(/[\u0000-\u001f\u007f/\\]/g,'_');
  const links=await associations({projectId:value.projectId===undefined?row.project_id:value.projectId,profileId:value.profileId===undefined?row.profile_id:value.profileId},owner);
  const archived=value.archived===undefined?row.archived:value.archived?1:0;
  const result=await run('UPDATE attachments SET name=?,project_id=?,profile_id=?,archived=? WHERE id=? AND owner=? AND (?=1 OR archived=0 OR (SELECT count(*) FROM attachments WHERE owner=? AND archived=0)<20)',name,links.projectId,links.profileId,archived,record,owner,archived,owner);
  if(!result.meta.changes)throw new AppError('Archive another active file before restoring this one.',409);
  return contextFileMetadata(record,owner);
}
