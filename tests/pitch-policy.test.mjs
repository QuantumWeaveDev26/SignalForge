import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['lib/pitch-policy.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {pitchInput,agencyInput,pitchResearch,pitchExport}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const brief={name:'भारत QA pitch',client:'Amber',brief:'A supplied client brief',budget:'INR 240000',deadline:'2026-11-30',requirements:'Three evidenced angles',attachmentIds:['file-qa']};
test('Pitch research clearly separates supplied credentials and client requirements from web evidence',()=>{
 const input=pitchInput(brief),agency=agencyInput({name:'QA agency',credentials:'Strategy',proof:'Unverified supplied proof'}),research=pitchResearch(input,agency);
 assert.match(research.question,/Do not invent credentials/);assert.match(research.question,/requirement-to-evidence matrix/);assert.match(research.context,/Unverified supplied proof/);assert.deepEqual(research.attachmentIds,['file-qa']);
 assert.throws(()=>pitchInput({...brief,brief:'x'.repeat(2501)}));assert.throws(()=>agencyInput({name:'Agency',credentials:'x'.repeat(1501)}));
});
test('Pitch exports preserve the intake, saved agency snapshot, edited playbook and source trail',()=>{
 const result=pitchExport({input:pitchInput(brief),agency:{name:'Snapshot agency',credentials:'Original capabilities'},revision:3,updated:'2026-10-16T07:00:00Z',body:'## Selected angle\nRevised recommendation [1]',sources:[{title:'Original evidence',url:'https://example.com/evidence'}]});
 for(const text of ['भारत','INR 240000','2026-11-30','Original capabilities','Revised recommendation [1]','https://example.com/evidence','file-qa','User edits are not independently verified'])assert.ok(result.includes(text));
});
