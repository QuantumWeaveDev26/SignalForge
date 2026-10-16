import {zipSync,strToU8} from 'fflate';
import {safeUrl,type Source} from './research';
import {pitchExport} from './pitch-policy';

export const wordMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// XML 1.0 excludes controls and unpaired surrogates. Keep valid Unicode, including Indic text.
function xml(value:string){return value.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));}
export function wordFilename(title:string){return (title.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,100)||'SignalForge')+'.docx';}

/** Offline OOXML generation. Only explicitly supplied text and sources enter the package. */
export function wordDocument(markdown:string,title:string,sources:Source[]=[]):Uint8Array{
 if(markdown.length>1_000_000)throw new Error('This document is too large to export to Word. Use Markdown export instead.');
 const links:string[]=[];
 function run(text:string,bold=false,italic=false,code=false){return `<w:r><w:rPr>${bold?'<w:b/>':''}${italic?'<w:i/>':''}${code?'<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>':''}</w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;}
 function link(label:string,url:string,bold=false){const safe=safeUrl(url);if(!safe)return run(label,bold);links.push(safe);return `<w:hyperlink r:id="link${links.length}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/>${bold?'<w:b/>':''}</w:rPr><w:t xml:space="preserve">${xml(label)}</w:t></w:r></w:hyperlink>`;}
 function inline(text:string,bold=false):string{return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|!?\[[^\]]+\]\([^\s)]+\)|\[\d+\]|https?:\/\/[^\s<>]+)/g).map(part=>{
  if(part.startsWith('**')&&part.endsWith('**')&&part.length>4)return inline(part.slice(2,-2),true);
  if(part.startsWith('*')&&part.endsWith('*')&&part.length>2)return run(part.slice(1,-1),bold,true);
  if(part.startsWith('`')&&part.endsWith('`'))return run(part.slice(1,-1),bold,false,true);
  if(part.startsWith('!['))return run(part,bold);
  const m=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);if(m)return safeUrl(m[2])?link(m[1],m[2],bold):run(part,bold);
  const cite=part.match(/^\[(\d+)\]$/);if(cite){const s=sources[Number(cite[1])-1];return s&&safeUrl(s.url)?link(part,s.url,bold):run(part,bold);}
  return /^https?:\/\//.test(part)?link(part,part,bold):run(part,bold);
 }).join('');}
 function paragraph(text:string,style='Normal',extra=''){return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inline(text)}</w:p>`;}
 const lines=markdown.replace(/\r\n?/g,'\n').split('\n'),body:string[]=[];let code=false,titleSeen=false;
 const cells=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(c=>c.trim().replace(/\\\|/g,'|'));
 const divider=(line:string)=>line.includes('|')&&cells(line).every(c=>/^:?-{3,}:?$/.test(c));
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/^\s*```/.test(line)){code=!code;continue;}
  if(code){body.push(`<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>${run(line,false,false,true)}</w:p>`);continue;}
  if(i+1<lines.length&&line.includes('|')&&divider(lines[i+1])){
   const rows=[cells(line)];i++;while(i+1<lines.length&&lines[i+1].trim()&&lines[i+1].includes('|'))rows.push(cells(lines[++i]));
   const columns=Math.max(...rows.map(r=>r.length));
   // Avoid tiny unreadable columns: preserve wide tables as labeled records.
   if(columns>6){body.push(paragraph('Columns: '+rows[0].join(' · ')));for(const row of rows.slice(1))body.push(paragraph(row.map((c,n)=>`${rows[0][n]||'Column '+(n+1)}: ${c}`).join(' · ')));continue;}
   const width=Math.floor(9360/columns);body.push(`<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(x=>`<w:${x} w:val="single" w:sz="4" w:color="D9D9D9"/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({length:columns},()=>`<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.map((row,n)=>`<w:tr>${n===0?'<w:trPr><w:tblHeader/></w:trPr>':''}${Array.from({length:columns},(_,c)=>`<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${n===0?'<w:shd w:fill="F2F2F2"/>':''}</w:tcPr>${paragraph(row[c]||'','Normal')}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`);continue;
  }
  if(!line.trim()){continue;}
  const heading=line.match(/^(#{1,6})\s+(.*)$/);if(heading){const first=heading[1].length===1&&!titleSeen;titleSeen=true;body.push(paragraph(heading[2],first?'Title':'Heading'+Math.max(1,Math.min(3,heading[1].length-1))));continue;}
  if(/^\s*[-*]\s+/.test(line)){body.push(paragraph(line.replace(/^\s*[-*]\s+/,''),'Normal','<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'));continue;}
  if(/^\s*\d+[.)]\s+/.test(line)){body.push(paragraph(line,'Normal','<w:ind w:left="360" w:hanging="360"/>'));continue;}
  if(/^\s*>\s?/.test(line)){body.push(paragraph(line.replace(/^\s*>\s?/,''),'Quote'));continue;}
  if(/^\s*---+\s*$/.test(line)){body.push(paragraph(''));continue;}
  body.push(paragraph(line));
 }
 const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const files:Record<string,string>={
  '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[['document','document.main'],['styles','styles'],['numbering','numbering']].map(([name,type])=>`<Override PartName="/word/${name}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  '_rels/.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="${rel}/officeDocument" Target="word/document.xml"/><Relationship Id="core" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  'docProps/core.xml':`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>SignalForge</dc:creator></cp:coreProperties>`,
  'word/document.xml':`<w:document xmlns:w="${ns}" xmlns:r="${rel}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1440" w:bottom="1080" w:left="1440" w:header="720" w:footer="720"/></w:sectPr></w:body></w:document>`,
  'word/_rels/document.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="numbering" Type="${rel}/numbering" Target="numbering.xml"/>${links.map((url,i)=>`<Relationship Id="link${i+1}" Type="${rel}/hyperlink" Target="${xml(url)}" TargetMode="External"/>`).join('')}</Relationships>`,
  'word/styles.xml':`<w:styles xmlns:w="${ns}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Nirmala UI"/><w:sz w:val="22"/><w:color w:val="000000"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[['Title',36],['Heading1',30],['Heading2',27],['Heading3',24]].map(([id,size],i)=>`<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="${i?240:0}" w:after="160"/>${i?`<w:outlineLvl w:val="${i-1}"/>`:''}</w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:color w:val="000000"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="Quote"><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`,
  'word/numbering.xml':`<w:numbering xmlns:w="${ns}"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([name,value])=>[name,strToU8(declaration+value)])),{level:6});
}

export function reportWord(report:any){
 if(!['completed','incomplete'].includes(report.status)||!report.body?.trim())throw new Error('Wait for a report with saved text before exporting to Word.');
 const sources:Source[]=report.sources||[];
 const markdown=`# ${report.title}\n\nSignalForge research\nStatus: ${report.status==='incomplete'?'Partial — research did not finish':'Completed'}\nMarket: ${report.market}\nCreated: ${report.created}\n\n## Research question\n${report.question}\n\n${report.body}\n\n${report.error?'## Run limitation\n'+report.error+'\n\n':''}## Sources\n${sources.map((s,i)=>`[${i+1}] ${s.title}\n${s.url}`).join('\n\n')||'No web sources saved.'}\n\n## Research limitations\nAI-assisted open-web research. Citations enable inspection, not a guarantee of correctness. Validate findings before making decisions. This export contains the saved report and sources, not follow-up chat or the separate monitoring comparison panel.`;
 return wordDocument(markdown,report.title,sources);
}
export function pitchWord(pitch:any){return wordDocument(pitchExport(pitch),pitch.input.name,pitch.sources||[]);}
export function downloadWord(bytes:Uint8Array,title:string){const blob=new Blob([new Uint8Array(bytes)],{type:wordMime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=wordFilename(title);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
