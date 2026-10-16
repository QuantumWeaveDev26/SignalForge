import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {unzipSync,strFromU8} from 'fflate';
import {XMLValidator,XMLParser} from 'fast-xml-parser';
const bundled=await build({entryPoints:['lib/word-export.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
const {wordDocument,reportWord,pitchWord,wordFilename,wordMime}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const unzip=bytes=>Object.fromEntries(Object.entries(unzipSync(bytes)).map(([k,v])=>[k,strFromU8(v)]));
const sources=[{title:'Evidence & limitations',url:'https://example.com/evidence?a=1&b=2',cited:true}];
const report={title:'India research & evidence',status:'completed',subject:'QA',market:'India',question:'What is supported?',body:'## Findings\n**Evidence** supports a qualified conclusion [1].\nUnresolved citation [99].',sources,created:'2026-10-16T10:00:00Z',owner:'SECRET_OWNER',response_id:'SECRET_PROVIDER',monitorComparison:{baseline:{body:'SECRET_BASELINE'}}};
test('Word report is a valid editable OOXML package with all internal relationship targets present',()=>{
 const zip=unzip(reportWord(report));assert.equal(Object.keys(zip).length,7);
 for(const [name,value] of Object.entries(zip))assert.equal(XMLValidator.validate(value),true,name);
 const parse=new XMLParser({ignoreAttributes:false});
 for(const name of ['_rels/.rels','word/_rels/document.xml.rels']){
  const rows=parse.parse(zip[name]).Relationships.Relationship;
  for(const row of Array.isArray(rows)?rows:[rows])if(row['@_TargetMode']!=='External')assert.ok(zip[(name.startsWith('word/')?'word/':'')+row['@_Target']],row['@_Target']);
 }
 assert.match(zip['[Content_Types].xml'],/wordprocessingml.document.main\+xml/);assert.equal(wordMime,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
test('Report export preserves question, source numbering, qualifications and safe clickable evidence while excluding unrelated private fields',()=>{
 const zip=unzip(reportWord(report)),text=Object.values(zip).join('\n');
 for(const value of ['What is supported?','qualified conclusion','[1]','[99]','Research limitations','not follow-up chat','Evidence &amp; limitations'])assert.ok(text.includes(value),value);
 assert.match(zip['word/document.xml'],/<w:b\/>/);assert.match(zip['word/document.xml'],/w:val="Heading1"/);
 assert.match(zip['word/_rels/document.xml.rels'],/https:\/\/example.com\/evidence\?a=1&amp;b=2/);
 assert.doesNotMatch(text,/SECRET_OWNER|SECRET_PROVIDER|SECRET_BASELINE|vbaProject|attachedTemplate|altChunk/);
});
test('Partial exports disclose status/error and unfinished or empty reports cannot masquerade as completed work',()=>{
 const xml=unzip(reportWord({...report,status:'incomplete',error:'Output limit reached'}))['word/document.xml'];assert.match(xml,/Partial — research did not finish/);assert.match(xml,/Output limit reached/);
 for(const status of ['queued','in_progress','failed','cancelled'])assert.throws(()=>reportWord({...report,status}),/saved text/);
 assert.throws(()=>reportWord({...report,body:' '}),/saved text/);
});
test('Untrusted text cannot inject XML, relationships, active content or executable hyperlinks',()=>{
 const zip=unzip(wordDocument('# QA\n<script>alert(1)</script>\u0000\ud800\n[unsafe](javascript:alert)\n[1]\n[raw](https://user:pass@example.com)\n![tracking](https://example.com/image.png)','QA',[{title:'x',url:'javascript:alert(1)'}]));
 for(const value of Object.values(zip))assert.equal(XMLValidator.validate(value),true);
 assert.match(zip['word/document.xml'],/&lt;script&gt;/);assert.doesNotMatch(zip['word/_rels/document.xml.rels'],/javascript:|user:pass|\/image\.png/);
});
test('Lists, Unicode, code, long tables and narrow tables retain content without embedded network assets',()=>{
 const xml=unzip(wordDocument('# भारत QA\n- Evidence\n1. Decide\n> Uncertain\n`code`\n| A | B |\n|---|---|\n| **One** | ₹1,499 |\n```\n<untrusted>\n```\n|A|B|C|D|E|F|G|\n|---|---|---|---|---|---|---|\n|1|2|3|4|5|6|7|','भारत'))['word/document.xml'];
 for(const value of ['भारत','₹1,499','<w:numPr>','<w:tbl>','<w:tblHeader/>','&lt;untrusted&gt;','G: 7'])assert.ok(xml.includes(value),value);
 assert.throws(()=>wordDocument('x'.repeat(1_000_001),'QA'),/too large/);assert.equal(wordFilename('भारत QA: brief / draft'), 'भारत QA- brief - draft.docx');assert.equal(wordFilename('...'),'SignalForge.docx');
});
test('Saved pitch exports include the exact revision, intake, supplied agency proof, edited body and numbered source trail',()=>{
 const pitch={input:{name:'QA pitch',client:'QA client',market:'India',brief:'Supplied brief',requirements:'Evidence required',budget:'INR 240000',deadline:'2026-11-30',goals:'Qualified decision',audience:'Buyers',competitors:'QA rival',attachmentIds:['file-qa']},agency:{name:'QA agency',credentials:'Strategy',proof:'Unverified supplied proof',constraints:'QA limits'},body:'## Recommendation\nEdited recommendation [1]',revision:3,updated:'2026-10-16T10:00:00Z',sources,owner:'SECRET_OWNER'};
 const before=JSON.stringify(pitch),zip=unzip(pitchWord(pitch)),xml=zip['word/document.xml'];
 for(const value of ['Revision 3','Supplied brief','Evidence required','INR 240000','2026-11-30','Unverified supplied proof','Edited recommendation','file-qa','not independently verified'])assert.ok(xml.includes(value),value);
 assert.equal(JSON.stringify(pitch),before);assert.doesNotMatch(Object.values(zip).join(''),/SECRET_OWNER/);
});
