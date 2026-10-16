'use client';
import {useEffect,useState} from 'react';
import {ArrowRight,Download,RefreshCw} from 'lucide-react';
import {sourceDelta,comparisonMarkdown} from '@/lib/monitor-comparison-policy';

const date=(value:string)=>new Date(value).toLocaleString();
export function MonitorComparison({report,go}:any){
 if(!report.monitorId)return null;
 const delta=sourceDelta(report),snapshot=report.monitorComparison,baseline=snapshot?.baseline;
 function download(){const blob=new Blob([comparisonMarkdown(report,location.origin)],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='signalforge-monitor-comparison.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const explanation:Record<string,string>={historical:'Historical scan: no comparison baseline was captured when this report was launched.',unfinished:'This scan is unfinished, partial, failed or stopped. Citation differences are withheld until it completes successfully.',first:'Baseline briefing: no earlier completed scan was available when this report launched.',scope_changed:'The earlier completed scan has a different or unknown research scope. A direct comparison is withheld.',matched:'These citation lists belong to two completed briefings of the same monitoring rule and research scope.'};
 const list=(title:string,items:any[])=><details className="workflow-step"><summary>{title} ({items.length})</summary>{items.length?<ul>{items.map(s=><li key={s.identity}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul>:<p>None in the compared citation lists.</p>}</details>;
 return <section className="panel compact-form" aria-label="Monitoring comparison"><h2>What changed between briefings?</h2><p>{explanation[delta.state]||'A comparable completed baseline is unavailable.'}</p><p className="fine-print">Current scan: {date(report.created)}{report.monitorDue?` · Scheduled occurrence: ${date(report.monitorDue)}`:''}</p>
  {baseline&&<><button className="text-link" onClick={()=>go('reports',baseline.id)}>Open earlier completed briefing · {date(baseline.created)} <ArrowRight size={15}/></button><p className="fine-print">Baseline selected at launch: {date(snapshot.capturedAt)}. Earlier scans still running then are excluded.</p></>}
  {snapshot?.scopeChanges?.length>0&&<p>Changed scope fields: {snapshot.scopeChanges.join(', ')}.</p>}
  {delta.state==='matched'&&<>{list('Newly cited sources',delta.added)}{list('Cited in both reports',delta.retained)}{list('Earlier sources not cited this time',delta.earlierOnly)}</>}
  {baseline?.sourcesTruncated&&<p className="alert">The earlier source list was limited to 50. Counts compare that bounded list.</p>}
  {baseline?.excerptTruncated&&<p className="fine-print">The research model received an excerpt of the earlier report; omitted text was explicitly marked.</p>}
  <p className="fine-print">Citation changes are not a count of developments, sentiment, popularity or business performance. A source absent this time does not mean its finding stopped being true. Matching ignores URL fragments and tracking parameters. Source coverage varies; scheduled dates are not evidence-coverage guarantees. Inspect the report’s cited explanation of developments.</p>
  <div className="toolbar"><button className="text-link" onClick={()=>go('monitors',report.monitorId)}>Monitoring history <ArrowRight size={15}/></button><button className="text-link" onClick={download}><Download size={15}/>Export comparison and current briefing</button></div>
 </section>;
}

export default function MonitoringHistory({record,api,act,busy,go}:any){
 const[state,setState]=useState<any>(null),[error,setError]=useState('');
 async function reload(){const value=await api('monitors/'+record+'/history');setState(value);setError('');}
 useEffect(()=>{let active=true;api('monitors/'+record+'/history').then((value:any)=>{if(active){setState(value);setError('');}}).catch((e:any)=>active&&setError(e.message));return()=>{active=false;};},[record,api]);
 if(error)return <div className="alert" role="alert">{error}<button className="text-link" onClick={()=>act(reload)}>Retry monitoring history</button><button className="text-link" onClick={()=>go('monitors')}>All monitoring rules</button></div>;
 if(!state)return <p>Loading monitoring history…</p>;
 const m=state.monitor;
 return <>
  <div className="toolbar"><button className="text-link" onClick={()=>go('monitors')}>← All monitoring rules</button><button className="text-link" disabled={busy} onClick={()=>act(reload)}><RefreshCw size={16}/>Refresh scan history</button></div>
  <section className="panel compact-form"><h2>{m.name}</h2><p>{m.input.subject} · {m.input.market} · {m.cadence} · {m.enabled?'Enabled':'Paused'}</p><p>{m.input.question}</p><p className="fine-print">Next scheduled occurrence: {date(m.next_run)}. Each scan retains its status and the completed baseline available at launch. Open a report to inspect changes and its source trail. Viewing history does not launch research.</p>{m.error&&<p className="alert">{m.error}</p>}</section>
  <h2>Saved scans</h2><div className="monitor-list">{state.items.map((r:any)=><article className="panel monitor-card" key={r.id}><div><h3>{r.title}</h3><p>{date(r.created)} · {r.status.replaceAll('_',' ')}</p></div>{r.monitor_due&&<p className="fine-print">Scheduled occurrence: {date(r.monitor_due)}</p>}<p>{r.comparison_state==='matched'?(r.status==='completed'?'Earlier completed baseline captured · comparison available':'Earlier baseline captured · scan needs to complete'):r.comparison_state==='first'?'First briefing · no earlier completed baseline':r.comparison_state==='scope_changed'?'Research scope changed · direct comparison withheld':'Historical report · no launch-time comparison captured'}</p>{r.error&&<p className="alert">{r.error}</p>}<footer><span>Saved report</span><button className="text-link" onClick={()=>go('reports',r.id)}>Open briefing and comparison <ArrowRight size={16}/></button></footer></article>)}</div>
  {!state.items.length&&<div className="empty-state"><h3>No scans saved for this rule yet.</h3><p>Enabled due rules run through the existing scheduler, subject to your research allowance. A first successful scan establishes a baseline.</p></div>}
  {state.nextCursor&&<button className="button button-outline" disabled={busy} onClick={()=>act(async()=>{const page=await api('monitors/'+record+'/history?'+new URLSearchParams({before:state.nextCursor}));setState((old:any)=>({...page,items:[...new Map([...old.items,...page.items].map((r:any)=>[r.id,r])).values()]}));})}>Load earlier scans</button>}
 </>;
}
