'use client';
import {useEffect,useMemo,useState} from 'react';
import {FileText,Upload,Download,Archive,RotateCcw,X} from 'lucide-react';
import {useBrandView} from './brand-view-context';

export default function FilesLibrary({data,api,load,act,busy,initialProject='',initialBrand=''}:any){
 const[files,setFiles]=useState<any[]>(data.attachments),[query,setQuery]=useState(''),[project,setProject]=useState(initialProject),[localBrand,setLocalBrand]=useState(initialBrand),[archived,setArchived]=useState(false),[preview,setPreview]=useState<any>(null),[draft,setDraft]=useState<any>(null);
 useEffect(()=>{if(!archived)setFiles(data.attachments);},[data.attachments,archived]);
 const brandView=useBrandView(),brand=brandView?.brandId??localBrand,setBrand=brandView?.select??setLocalBrand;
 async function refresh(){const values=await api('attachments?archived=true');setFiles(values);await load();setFiles(values);}
 useEffect(()=>{if(archived)act(async()=>{setFiles(await api('attachments?archived=true'));});else setFiles(data.attachments);},[archived]);
 const visible=useMemo(()=>files.filter((f:any)=>!!f.archived===archived&&(!query||f.name.toLowerCase().includes(query.toLowerCase()))&&(!project||f.project_id===project)&&(!brand||f.profile_id===brand)),[files,query,project,brand,archived]);
 return <>
  <form className="panel compact-form" onSubmit={e=>e.preventDefault()}>
   <h2>Your briefs and research, ready to reuse.</h2><p>Upload PDF, DOCX, TXT, CSV or Markdown. Up to 5 MB and 100,000 extracted characters; PDFs up to 50 pages. Select up to three files in Chat, New research or a workflow.</p>
   <div className="form-grid"><label>Project<select value={project} onChange={e=>{setProject(e.target.value);const p=data.projects.find((p:any)=>p.id===e.target.value);if(p?.profile_id)setBrand(p.profile_id);}}><option value="">All projects / unassigned upload</option>{data.projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Brand<select value={brand} onChange={e=>setBrand(e.target.value)}><option value="">All brands / no brand</option>{data.profiles.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
   <label className="upload-button"><Upload size={17}/>Upload context file<input aria-label="Upload context file" type="file" accept=".pdf,.docx,.txt,.csv,.md" disabled={busy||archived} onChange={e=>{const file=e.target.files?.[0];if(file)act(async()=>{const form=new FormData();form.append('file',file);if(project)form.append('projectId',project);if(brand)form.append('profileId',brand);await api('attachments','POST',form);await refresh();},'File extracted and saved.');e.target.value='';}}/></label>
   <p className="fine-print">The selected project and brand are applied to new uploads. Only extracted text is used for research; OCR, image/chart interpretation, slides and XLSX files are not available yet. Up to 20 active and 100 stored files. Archived files stay available to restore.</p>
  </form>
  <div className="toolbar"><label>Search files<input aria-label="Search files" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a saved file"/></label><label className="checkbox-label"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setPreview(null);setDraft(null);}}/>Show archived files</label></div>
  <p className="fine-print">{visible.length} matching {archived?'archived':'active'} files</p>
  <div className="monitor-list">{visible.map((file:any)=><article className="panel monitor-card" key={file.id}>
   <div><FileText size={22}/><div><h3>{file.name}</h3><p>{file.format.toUpperCase()} · {(file.bytes/1000).toFixed(1)} KB · {file.text_chars?`${file.text_chars.toLocaleString()} extracted characters`:'Legacy text upload'}{file.sections?` · ${file.sections} ${file.format==='pdf'?'pages':file.format==='docx'?'paragraphs':'lines'}`:''}</p></div></div>
   <p>{data.projects.find((p:any)=>p.id===file.project_id)?.name||'No project'} · {data.profiles.find((p:any)=>p.id===file.profile_id)?.name||'No brand'}</p>
   {file.warning&&<p className="fine-print">{file.warning}</p>}
   <footer><span>{new Date(file.created).toLocaleDateString()}</span><div>
    <button className="text-link" disabled={busy} onClick={()=>act(async()=>{setPreview(await api('attachments/'+file.id));setDraft(null);})}>Preview extracted text</button>
    <a className="text-link" href={'/api/workspace/attachments/'+file.id+'/download'}><Download size={15}/>Download original</a>
    <button className="text-link" disabled={busy} onClick={()=>{setDraft({...file,projectId:file.project_id||'',profileId:file.profile_id||''});setPreview(null);}}>Organize / rename</button>
    <button className="icon-button" aria-label={(file.archived?'Restore ':'Archive ')+file.name} disabled={busy} onClick={()=>act(async()=>{await api('attachments/'+file.id,'PATCH',{archived:!file.archived});setPreview(null);setDraft(null);await refresh();},file.archived?'File restored.':'File archived. Restore it before selecting it for new research.')}>{file.archived?<RotateCcw size={17}/>:<Archive size={17}/>}</button>
   </div></footer>
  </article>)}</div>
  {!visible.length&&<div className="empty-state"><h3>{archived?'No archived files.':'Bring your own context.'}</h3><p>Saved files can be reused across chats, reports and workflows.</p></div>}
  {draft&&<form className="panel compact-form" onSubmit={e=>{e.preventDefault();act(async()=>{await api('attachments/'+draft.id,'PATCH',{name:draft.name,projectId:draft.projectId||null,profileId:draft.profileId||null});await refresh();setDraft(null);},'File organization saved.');}}><h3>Organize file</h3><label>File name<input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><div className="form-grid"><label>File project<select value={draft.projectId} onChange={e=>{const p=data.projects.find((p:any)=>p.id===e.target.value);setDraft({...draft,projectId:e.target.value,profileId:p?.profile_id||''});}}><option value="">No project</option>{data.projects.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>File brand<select value={draft.profileId} onChange={e=>setDraft({...draft,profileId:e.target.value})}><option value="">No brand</option>{data.profiles.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><div className="toolbar"><button className="button button-dark" disabled={busy}>Save file details</button><button className="text-link" type="button" onClick={()=>setDraft(null)}>Cancel</button></div></form>}
  {preview&&<section className="panel compact-form" aria-label="Extracted file preview"><div className="toolbar"><h2>{preview.file.name}</h2><button className="icon-button" aria-label="Close file preview" onClick={()=>setPreview(null)}><X size={18}/></button></div><p className="fine-print">{preview.file.warning} Research receives a bounded excerpt of up to 30,000 characters across selected files; omitted content is explicitly marked.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:500,overflowY:'auto'}}>{preview.text}</pre></section>}
 </>;
}
