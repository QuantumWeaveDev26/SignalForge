import {extractOffice} from './office-extraction';
import {unzipSync,strFromU8} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {AppError} from './research';

export const MAX_FILE_BYTES=5_000_000;
export const MAX_TEXT_CHARS=100_000;
export type ExtractedFile={format:string;text:string;sections:number;warning:string};
function checked(text:string){
  if(text.length>MAX_TEXT_CHARS)throw new AppError('This file contains too much text. Split it into smaller documents (maximum 100,000 characters).',413);
  if(!text.trim())throw new AppError('No readable text was found. Scanned pages and images need OCR before upload.');
  return text;
}
export async function extractFile(file:File):Promise<ExtractedFile>{
  const format=file.name.split('.').pop()?.toLowerCase()||'';
  if(!['txt','csv','md','pdf','docx','pptx','xlsx'].includes(format))throw new AppError('Supported formats: PDF, DOCX, PPTX, XLSX, TXT, CSV and Markdown. Scanned images need OCR before upload.');
  if(!file.size||file.size>MAX_FILE_BYTES)throw new AppError('Choose a non-empty file up to 5 MB.',413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(['txt','csv','md'].includes(format)){
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new AppError('Save this text file as UTF-8 and upload it again.');}
    if(text.includes('\0'))throw new AppError('This file does not contain supported plain text.');
    const lines=text.split(/\r?\n/);return {format,text:checked(lines.map((line,i)=>`[Line ${i+1}] ${line}`).join('\n')),sections:lines.length,warning:'Line references describe the uploaded text. CSV content is text context, not spreadsheet calculations.'};
  }
  try{
    if(format==='pptx'||format==='xlsx')return extractOffice(bytes,format);
    if(format==='docx'){
      if(bytes[0]!==80||bytes[1]!==75)throw new AppError('This is not a valid DOCX file. Export a .docx document from Word.');
      let entries=0,totalXml=0;
      const zip=unzipSync(bytes,{filter:entry=>{
        if(++entries>2000)throw new AppError('This document contains too many embedded items.',413);
        const selected=/^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/.test(entry.name);if(selected)totalXml+=entry.originalSize;
        if(selected&&(entry.originalSize>2_000_000||totalXml>8_000_000))throw new AppError('The Word document is too complex. Split it into smaller documents.',413);
        return selected;
      }});
      if(!zip['word/document.xml'])throw new AppError('The DOCX document body could not be found.');
      const xml=strFromU8(zip['word/document.xml']);
      if(xml.length>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new AppError('The Word document contains unsupported or invalid XML.');
      const tree=new XMLParser({preserveOrder:true,removeNSPrefix:true,ignoreAttributes:true,parseTagValue:false,trimValues:false,processEntities:false}).parse(xml);
      const decode=(s:string)=>s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,(_,name:string)=>{
        const named:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(named[name])return named[name];
        const n=name[1]?.toLowerCase()==='x'?parseInt(name.slice(2),16):parseInt(name.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
      });
      const paragraphs:string[]=[];
      function inline(nodes:any[],depth=0):string{if(depth>100)throw new AppError('The Word document is too deeply nested.');return nodes.map(node=>Object.entries(node).map(([key,value])=>key==='#text'?decode(String(value)):key==='tab'?'\t':key==='br'?'\n':Array.isArray(value)?inline(value,depth+1):'').join('')).join('');}
      function visit(nodes:any[],depth=0){if(depth>100)throw new AppError('The Word document is too deeply nested.');for(const node of nodes)for(const [key,value]of Object.entries(node)){if(key==='p'){const text=inline(value as any[]);if(text.trim())paragraphs.push(text);}else if(Array.isArray(value))visit(value,depth+1);}}
      visit(tree);
      let output=paragraphs.map((p,i)=>`[Paragraph ${i+1}] ${p}`).join('\n\n'),sections=paragraphs.length;
      for(const part of Object.keys(zip).filter(n=>n!=='word/document.xml').sort()){const extra=strFromU8(zip[part]);if(/<!DOCTYPE|<!ENTITY/i.test(extra)||XMLValidator.validate(extra)!==true)throw new AppError('Unsupported secondary Word XML.');paragraphs.length=0;visit(new XMLParser({preserveOrder:true,removeNSPrefix:true,ignoreAttributes:true,parseTagValue:false,trimValues:false,processEntities:false}).parse(extra));output+='\n\n'+paragraphs.map((p,i)=>`[Part ${part}, Paragraph ${i+1}] ${p}`).join('\n\n');sections+=paragraphs.length;if(output.length>MAX_TEXT_CHARS)checked(output);}
      return {format,text:checked(output),sections,warning:'Main body plus available headers, footers, footnotes, endnotes and comments as separately labeled text parts. Secondary parts are not positioned in the body. Paragraph references are not Word page numbers. Images and visual layout are not interpreted.'};
    }
    if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('This file does not contain a valid PDF header.');
    const {getDocumentProxy}=await import('unpdf');
    const pdf=await getDocumentProxy(bytes,{useSystemFonts:false});
    try{
      if(pdf.numPages>50)throw new AppError('PDFs support up to 50 pages. Split this document into smaller parts.',413);
      const pages:string[]=[];let length=0,empty=0;
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i);const content=await page.getTextContent();
        const text=content.items.map((item:any)=>'str'in item?item.str+(item.hasEOL?'\n':' '):'').join('').trim();page.cleanup();
        if(!text)empty++;length+=text.length;if(length>MAX_TEXT_CHARS)throw new AppError('This PDF contains too much text. Split it into smaller parts.',413);
        pages.push(`[Page ${i}]\n${text||'[No extractable text on this page]'}`);
      }
      if(empty===pdf.numPages)throw new AppError('No readable PDF text was found. This may be a scanned PDF; run OCR before uploading.');
      return {format,text:checked(pages.join('\n\n')),sections:pdf.numPages,warning:`PDF text only; visual layout, charts and images are not interpreted.${empty?` ${empty} page(s) have no extractable text and may need OCR.`:''}`};
    }finally{await pdf.loadingTask.destroy();}
  }catch(error){if(error instanceof AppError)throw error;throw new AppError(format==='pdf'?'This PDF could not be read. It may be encrypted, damaged or unsupported. Export an unlocked text PDF and retry.':'This Office document could not be read. Re-save it without encryption and retry.');}
}
