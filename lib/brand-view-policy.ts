import type {ResearchInput} from './research';

export function selectedBrand(data:any,override:string|null,view:string,record:string){
 const profiles=data?.profiles||[];
 const linked=['workflows','files'].includes(view)&&profiles.some((p:any)=>p.id===record)?record:view==='files'?data?.projects?.find((p:any)=>p.id===record)?.profile_id:null;
 const candidate=override??linked??data?.preferences?.selected_profile_id;
 return profiles.some((p:any)=>p.id===candidate)?candidate:'';
}
export function brandResearch(base:ResearchInput,profile?:any):ResearchInput{
 return profile?{...base,attachmentIds:[...base.attachmentIds],profileId:profile.id,subject:profile.name,market:profile.market,audience:profile.audience,competitors:profile.competitors,context:[profile.website,profile.context].filter(Boolean).join('\n').slice(0,12000)}:{...base,attachmentIds:[...base.attachmentIds]};
}
export function brandSearch(search:string,brand:string){const p=new URLSearchParams(search);p.set('brand',brand);return '?'+p.toString();}
export function scopeWorkspace(data:any,brand:string){
 if(!data||!brand)return data;
 const input=(row:any)=>{try{return typeof row.input==='string'?JSON.parse(row.input):row.input||{};}catch{return {};}};
 const associated=(row:any)=>row.profileId===brand||row.profile_id===brand;
 const counts=data.reportCountsByBrand?.find((r:any)=>r.profile_id===brand);
 return {...data,reports:data.reports.filter(associated),projects:data.projects.filter(associated),attachments:data.attachments.filter(associated),workflows:data.workflows.filter((r:any)=>input(r).profileId===brand),workflowRuns:data.workflowRuns.filter(associated),monitors:data.monitors.filter((r:any)=>r.managed_profile_id===brand||input(r).profileId===brand),reportCounts:{total:counts?.total||0,completed:counts?.completed||0}};
}
