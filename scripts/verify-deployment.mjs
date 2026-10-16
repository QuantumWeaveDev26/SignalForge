async function readHiddenInput(){
 return new Promise((resolve,reject)=>{
  let input=''; const terminal=process.stdin.isTTY&&typeof process.stdin.setRawMode==='function';
  const finish=(error)=>{process.stdin.removeListener('data',onData);process.stdin.removeListener('end',onEnd);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(input);};
  const onData=(chunk)=>{input+=chunk;if(input.includes('\u0003'))finish(new Error('Verification cancelled'));else if(input.length>65536)finish(new Error('Input too large'));else if(/[\r\n]/.test(input))finish();};
  const onEnd=()=>finish();
  if(terminal)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',onEnd);process.stdin.resume();
 });
}
const hiddenInput=readHiddenInput();
console.log('Ready for private Site verification JSON on stdin (input is hidden).');
const config=JSON.parse(await hiddenInput);const origin=new URL(config.url).origin;const headers={'OAI-Sites-Authorization':'Bearer '+config.token,'Content-Type':'application/json'};const homepage=await fetch(origin+'/',{headers,signal:AbortSignal.timeout(30000)});const html=await homepage.text();const health=await fetch(origin+'/api/monitor-tick',{headers,signal:AbortSignal.timeout(30000)});const before=health.ok?await health.json():null;const tick=await fetch(origin+'/api/monitor-tick',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(60000)});const tickData=tick.ok?await tick.json():null;const readback=await fetch(origin+'/api/monitor-tick',{headers,signal:AbortSignal.timeout(30000)});const after=readback.ok?await readback.json():null;const result={homepageStatus:homepage.status,hasSignalForge:html.includes('signalforge'),runnerReadStatus:health.status,runnerWriteStatus:tick.status,runnerReadbackStatus:readback.status,enabledRules:after?.enabledRules,pendingReports:after?.pendingReports,writerResults:tickData?.results?.map(r=>({launched:r.results?.filter(x=>x.reportId).length||0,errors:r.results?.filter(x=>x.error).map(x=>x.error)||[]})),schedulerActive:after?.schedulerActive};console.log(JSON.stringify(result));config.token=null;if(homepage.status!==200||health.status!==200||tick.status!==200||readback.status!==200)process.exitCode=1;
