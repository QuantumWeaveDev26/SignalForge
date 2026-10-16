import fs from 'node:fs';
const base='http://127.0.0.1:5173';
const auth=await fetch(base+'/signin-with-chatgpt?return_to=/workspace',{redirect:'manual'});
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
const headers={'Content-Type':'application/json',Origin:base,Cookie:cookie};
const saved='outputs/live-research.json';
fs.mkdirSync('outputs',{recursive:true});
const previous=fs.existsSync(saved)?JSON.parse(fs.readFileSync(saved,'utf8')):null;
let response;
if(previous?.reportId){response=await fetch(base+'/api/workspace/reports/'+previous.reportId,{headers});}
else if(previous?.error){console.log(JSON.stringify(previous));process.exit(1);}
else response=await fetch(base+'/api/workspace/reports',{method:'POST',headers,body:JSON.stringify({template:'custom',subject:'Research platform validation',question:'Using official OpenAI documentation, explain what web search in the Responses API returns, how users can inspect citations, and what limitations a research application should disclose. Focus on practical product implications.',market:'Global',window:'Current landscape'})});
const report=await response.json();
const result=response.ok?{reportId:report.id,status:report.status,sourceCount:report.sources.length,characters:report.body.length,error:report.error||null}: {status:'blocked',error:report.error};
fs.writeFileSync(saved,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!response.ok||report.status==='failed')process.exitCode=1;
