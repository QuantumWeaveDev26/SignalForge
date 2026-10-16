import {all,one,digest} from './server';
import {AppError,bounded,templates} from './research';
import {reference,emptyReportFilters} from './collection-policy';

// This metadata-only read path never refreshes a provider response or launches research.
export async function reportLibrary(owner:string,params:URLSearchParams){
 const filters={...emptyReportFilters,query:bounded(params.get('q'),'Search',200),favorite:false,projectId:reference(params.get('project'),'Project')||'',profileId:reference(params.get('brand'),'Brand')||'',template:bounded(params.get('type'),'Type',40),status:bounded(params.get('status'),'Status',30),label:bounded(params.get('label'),'Label',40),since:bounded(params.get('since'),'Date',10)};
 const favorite=params.get('favorite');if(favorite&&!['true','false'].includes(favorite))throw new AppError('Invalid favorites filter.');filters.favorite=favorite==='true';
 if(filters.template&&!templates.some(t=>t.id===filters.template))throw new AppError('Invalid research type.');
 if(filters.status&&!['starting','queued','in_progress','completed','incomplete','failed','cancelled'].includes(filters.status))throw new AppError('Invalid report status.');
 if(filters.since&&(!/^\d{4}-\d{2}-\d{2}$/.test(filters.since)||!Number.isFinite(Date.parse(filters.since+'T00:00:00.000Z'))||new Date(filters.since+'T00:00:00.000Z').toISOString().slice(0,10)!==filters.since))throw new AppError('Choose a valid created-since date.');
 const key=await digest(JSON.stringify(filters));let cursor:any=null;
 const before=params.get('before');if(before){try{if(before.length>400)throw new Error();cursor=JSON.parse(before);if(!cursor||typeof cursor.created!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.created)||!Number.isFinite(Date.parse(cursor.created))||typeof cursor.id!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(cursor.id)||cursor.key!==key)throw new Error();}catch{throw new AppError('Invalid library cursor. Reload the matching reports.');}}
 const where=['owner=?'],args:any[]=[owner];
 if(filters.query){where.push("instr(lower(title||' '||subject||' '||question),lower(?))>0");args.push(filters.query);}
 if(filters.favorite)where.push('favorite=1');
 for(const [column,value]of [['project_id',filters.projectId],['profile_id',filters.profileId],['template',filters.template],['status',filters.status]])if(value){where.push(column+'=?');args.push(value);}
 if(filters.label){where.push('EXISTS (SELECT 1 FROM json_each(reports.labels) WHERE value=?)');args.push(filters.label);}
 if(filters.since){where.push('created>=?');args.push(filters.since+'T00:00:00.000Z');}
 const predicate=where.join(' AND ');
 const count=await one('SELECT count(*) AS n FROM reports WHERE '+predicate,...args);
 const rows=await all(`SELECT id,title,template,subject,market,question,status,created,favorite,labels,project_id,profile_id FROM reports WHERE ${predicate} ${cursor?'AND (created<? OR (created=? AND id<?))':''} ORDER BY created DESC,id DESC LIMIT 21`,...args,...(cursor?[cursor.created,cursor.created,cursor.id]:[]));
 const items=rows.slice(0,20).map(r=>({id:r.id,title:r.title,template:r.template,subject:r.subject,market:r.market,question:r.question,status:r.status,created:r.created,favorite:!!r.favorite,labels:JSON.parse(r.labels||'[]'),projectId:r.project_id||null,profileId:r.profile_id||null})),last=items.at(-1);
 const labels=await all('SELECT DISTINCT j.value AS label FROM reports,json_each(reports.labels) AS j WHERE reports.owner=? AND j.type=\'text\' ORDER BY j.value COLLATE NOCASE,j.value',owner);
 return {items,total:Number(count.n),labels:labels.map(r=>r.label),filters,nextCursor:rows.length>20?JSON.stringify({created:last!.created,id:last!.id,key}):null};
}
