import {zipSync,strToU8} from 'fflate';
export function pdfFixture(lines=['SignalForge QA brief','Project Amber','Budget INR 240000']){
 const content='BT /F1 12 Tf 72 720 Td '+lines.map((s,i)=>(i?'0 -20 Td ':'')+'('+s.replace(/[\\()]/g,'\\$&')+') Tj').join('\n')+' ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
 let out='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(out.length);out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=out.length;out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(out);
}
export function docxFixture(xml='<w:p><w:r><w:t>SignalForge QA brief</w:t></w:r></w:p><w:p><w:r><w:t>भारत Project Amber Budget INR 240000 &amp; evidence</w:t></w:r></w:p>'){
 return zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+xml+'</w:body></w:document>')});
}
