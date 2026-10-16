import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['lib/monitor-comparison-policy.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {captureMonitorComparison,publicMonitorComparison,monitorComparisonPrompt,sourceDelta,comparisonMarkdown}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const input={template:'brand',subject:'Example',question:'What developments have evidence?',market:'India',attachmentIds:[]};
const old={id:'prior',title:'Earlier briefing',created:'2026-10-01T00:00:00.000Z',updated:'2026-10-01T01:00:00.000Z',input:JSON.stringify(input),body:'Earlier evidence',sources:JSON.stringify([{url:'https://example.com/shared?utm_source=old#section',title:'Shared evidence'},{url:'https://example.com/earlier',title:'Earlier only'},{url:'javascript:alert(1)',title:'Invalid'}])};
const report={id:'current',title:'Current briefing',status:'completed',created:'2026-10-08T00:00:00.000Z',body:'Current evidence [1]',sources:[{url:'https://example.com/shared',title:'Shared'},{url:'https://example.com/new',title:'New evidence'}],monitorComparison:publicMonitorComparison(captureMonitorComparison(input,old,'2026-10-08T00:00:00.000Z'))};
test('Citation differences normalize tracking without equating absent sources with ceased developments',()=>{
 const delta=sourceDelta(report);assert.equal(delta.state,'matched');assert.deepEqual(delta.added.map(s=>s.title),['New evidence']);assert.equal(delta.retained.length,1);assert.deepEqual(delta.earlierOnly.map(s=>s.title),['Earlier only']);assert.equal(report.monitorComparison.baseline.body,undefined);
 const output=comparisonMarkdown(report,'https://signalforge.test');for(const text of ['Earlier sources not cited this time','do not measure events','Report links require workspace access','https://example.com/new']){assert.ok(output.includes(text));}assert.match(monitorComparisonPrompt(captureMonitorComparison(input,old,'date')),/not proof of a changed event/);
});
test('First, historical, unfinished and changed-scope reports never claim zero measured changes',()=>{
 assert.equal(sourceDelta({...report,monitorComparison:null}).state,'historical');
 assert.equal(sourceDelta({...report,status:'incomplete'}).state,'unfinished');
 assert.equal(sourceDelta({...report,monitorComparison:captureMonitorComparison(input,null,'date')}).state,'first');
 const changed=captureMonitorComparison({...input,market:'US'},old,'date');assert.equal(changed.state,'scope_changed');assert.deepEqual(changed.scopeChanges,['Market']);assert.equal(sourceDelta({...report,monitorComparison:changed}).state,'scope_changed');assert.doesNotMatch(monitorComparisonPrompt(changed),/Earlier evidence/);
});
test('Bounded baseline excerpts and source lists disclose omissions without leaking prior report text to the UI',()=>{
 const snap=captureMonitorComparison(input,{...old,body:'x'.repeat(12000),sources:JSON.stringify(Array.from({length:55},(_,i)=>({url:'https://example.com/'+i,title:String(i)})))},'date');
 assert.equal(snap.baseline.body.length,10000);assert.equal(snap.baseline.excerptTruncated,true);assert.equal(snap.baseline.sources.length,50);assert.equal(snap.baseline.sourcesTruncated,true);assert.equal(snap.baseline.sourceCount,55);assert.equal(publicMonitorComparison(JSON.stringify(snap)).baseline.body,undefined);assert.match(comparisonMarkdown({...report,monitorComparison:publicMonitorComparison(snap)},'https://signalforge.test'),/limited to 50/);
});
