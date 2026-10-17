import {unzipSync,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {AppError} from './research';
const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,parseTagValue:false,parseAttributeValue:false,trimValues:false,processEntities:true});
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
const text=(v:any):string=>typeof v==='object'&&v?String(v['#text']??''):String(v??'');
function strings(v:any):string {if(!v||typeof v!=='object')return '';return Object.entries(v).map(([k,value])=>k==='t'?array(value).map(text).join(''):k==='rPh'?'':typeof value==='object'?array(value).map(strings).join(''):'').join('');}
function descendants(v:any,name:string):any[]{if(!v||typeof v!=='object')return [];return Object.entries(v).flatMap(([k,x])=>k===name?array(x):array(x).flatMap(y=>descendants(y,name)));}
function target(base:string,path:string){if(!path||path.includes('\\')||/^[a-z]+:/i.test(path)||path.startsWith('/'))throw new AppError('Unsupported external or absolute Office relationship.');const parts=base.split('/');parts.pop();for(const p of path.split('/')){if(p==='..'){if(parts.length<2)throw new AppError('Invalid Office relationship path.');parts.pop();}else if(p!=='.')parts.push(p);}return parts.join('/');}
/** Local bounded OOXML text extraction. Never resolves external relationships or recalculates formulas. */
export function extractOffice(bytes:Uint8Array,format:'pptx'|'xlsx'){
 let count=0,total=0;
 const zip=unzipSync(bytes,{filter:e=>{if(++count>2000)throw new AppError('Too many Office package entries.',413);const selected=/^(ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/[^/]+\.xml)|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml))$/.test(e.name);if(selected){total+=e.originalSize;if(e.originalSize>2_000_000||total>8_000_000)throw new AppError('Office text exceeds the extraction limit. Split the file.',413);}return selected;}});
 function read(name:string){if(!zip[name])throw new AppError('An Office document part is missing: '+name);const raw=strFromU8(zip[name]);if(/<!DOCTYPE|<!ENTITY/i.test(raw)||XMLValidator.validate(raw)!==true)throw new AppError('Invalid or unsupported Office XML.');return parser.parse(raw);}
 const main=format==='pptx'?'ppt/presentation.xml':'xl/workbook.xml';
 const rels=array(read(format==='pptx'?'ppt/_rels/presentation.xml.rels':'xl/_rels/workbook.xml.rels').Relationships?.Relationship);
 function linked(id:string,kind:string){const r=rels.find(r=>r['@_Id']===id);if(!r||r['@_TargetMode']==='External'||!String(r['@_Type']).endsWith('/'+kind))throw new AppError('Missing or unsupported Office relationship.');return read(target(main,r['@_Target']));}
 let out='',sections=0;
 function append(s:string){out+=s;if(out.length>100000)throw new AppError('Too much extracted text. Split the file (100,000 characters maximum).',413);}
 if(format==='pptx'){
  const ids=array(read(main).presentation?.sldIdLst?.sldId);if(!ids.length||ids.length>100)throw new AppError('Presentations support 1–100 slides.');
  // removeNSPrefix merges numeric id and r:id, so preserve attributes when selecting relationship IDs.
  const raw=strFromU8(zip[main]);const relationships=[...raw.matchAll(/<(?:\w+:)?sldId\b[^>]*\b[A-Za-z_][\w.-]*:id=["']([^"']+)["'][^>]*\/?\s*>/g)].map(m=>m[1]);
  if(relationships.length!==ids.length)throw new AppError('Slide relationship identifiers could not be read.');
  let readableSlides=0;
  relationships.forEach((id,i)=>{const slide=linked(id,'slide');const paragraphs=descendants(slide,'p').map(strings).filter(t=>t.trim());readableSlides+=paragraphs.length;append(`[Slide ${i+1}]\n${paragraphs.join('\n')||'[No extractable slide text]'}\n\n`);sections++;});
  if(!readableSlides)throw new AppError('No readable slide text. Images need OCR before upload.');
  return {format,text:out.trim(),sections,warning:'Slide text in presentation order. Images, charts, speaker notes, animations and layout are not interpreted.'};
 }
 const book=read(main),sheets=array(book.workbook?.sheets?.sheet);if(!sheets.length||sheets.length>30)throw new AppError('Spreadsheets support 1–30 sheets.');
 const shared=zip['xl/sharedStrings.xml']?array(read('xl/sharedStrings.xml').sst?.si).map(strings):[];let cells=0,formulas=0,hidden=0,readable=0;
 for(const sheet of sheets){if(sheet['@_state']&&sheet['@_state']!=='visible'){hidden++;continue;}const name=String(sheet['@_name']||'Sheet');const ws=linked(sheet['@_id'],'worksheet');append(`[Sheet ${name}]\n`);sections++;
  for(const row of array(ws.worksheet?.sheetData?.row)){if(row['@_hidden']==='1'||row['@_hidden']==='true'){hidden++;continue;}for(const c of array(row.c)){if(++cells>10000)throw new AppError('Spreadsheets support up to 10,000 visible cells. Split the file.',413);const ref=c['@_r'];if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(ref||''))throw new AppError('Invalid spreadsheet cell address.');let value=text(c.v);if(c['@_t']==='s'){if(!/^\d+$/.test(value)||Number(value)>=shared.length)throw new AppError('Invalid shared string reference.');value=shared[Number(value)];}if(c['@_t']==='inlineStr')value=strings(c.is);if(c['@_t']==='b')value=value==='1'?'TRUE':'FALSE';if(c.f!==undefined){formulas++;value=value?value+' [saved formula result; not recalculated]':'[Formula has no saved result]';}if(value){append(`[Cell ${name}!${ref}] ${value}\n`);readable++;}}}append('\n');}
 if(!readable)throw new AppError('No readable visible worksheet cells were found.');
 return {format,text:out.trim(),sections,warning:`Visible worksheet cells with sheet/cell references. Numeric values are raw stored values; date serials and number formats are not interpreted. Formulas are never executed; ${formulas} saved formula result(s) may be stale. Hidden sheets/rows omitted (${hidden}); charts, images, macros and external links are not read.`};
}
