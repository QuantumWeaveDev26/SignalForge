import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const filename=path.join(root,'.env.auth.local');
const callback='http://localhost:57431/gmail-oauth/callback';
if(process.argv.includes('--help')){
 console.log('Connect the SignalForge sender mailbox. Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and AUTH_EMAIL_FROM in ignored .env.auth.local first. Enable Gmail API in the Google Cloud project and register this OAuth redirect URI: '+callback+' . The wizard requests send-only Gmail access plus verified email identity, and never prints credentials.');
 process.exit(0);
}
try{process.loadEnvFile(filename);}catch{console.error('Create .env.auth.local from .env.auth.example and fill the Google client secret first.');process.exit(1);}
const clientId=process.env.GOOGLE_CLIENT_ID,clientSecret=process.env.GOOGLE_CLIENT_SECRET,sender=process.env.AUTH_EMAIL_FROM;
if(!clientId||!clientId.endsWith('.apps.googleusercontent.com')||!clientSecret||clientSecret.includes('REPLACE')||!sender||/[\r\n]/.test(sender)){
 console.error('Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and AUTH_EMAIL_FROM in .env.auth.local.');process.exit(1);
}
const state=crypto.randomBytes(32).toString('base64url');
const verifier=crypto.randomBytes(48).toString('base64url');
const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
const authorize=new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorize.search=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'openid email https://www.googleapis.com/auth/gmail.send',access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
let completed=false,inProgress=false;
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.headers.host!=='localhost:57431'){res.writeHead(400);res.end('Invalid callback host.');return;}
 const url=new URL(req.url||'/',callback);
 if(req.method==='GET'&&url.pathname==='/done'){res.end(completed?'Gmail authorization saved securely. You can close this tab and return to Codex.':'Authorization did not complete. Return to the setup terminal.');return;}
 if(req.method!=='GET'||url.pathname!=='/gmail-oauth/callback'){res.writeHead(404);res.end('Not found.');return;}
 const value=url.searchParams.get('state')||'';
 if(Buffer.byteLength(value)!==Buffer.byteLength(state)||!crypto.timingSafeEqual(Buffer.from(value),Buffer.from(state))||completed||inProgress){res.writeHead(400);res.end('Expired or invalid authorization request.');return;}
 if(url.searchParams.has('error')||!url.searchParams.get('code')){res.writeHead(400);res.end('Authorization was cancelled. You can restart the setup wizard.');return;}
 inProgress=true;
 try{
  const exchanged=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,client_secret:clientSecret,code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier}),signal:AbortSignal.timeout(20000)});
  const tokens=await exchanged.json();
  if(!exchanged.ok||typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string')throw new Error('Google did not return offline authorization. Revoke this app’s previous mailbox grant, then reconnect with consent.');
  const identityResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});
  const identity=await identityResponse.json();
  if(!identityResponse.ok||identity.email_verified!==true||identity.email?.toLowerCase()!==sender.toLowerCase())throw new Error('Authorize the same verified Gmail address configured in AUTH_EMAIL_FROM.');
  if(!String(tokens.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw new Error('Gmail send permission was not granted.');
  const values={GOOGLE_CLIENT_ID:clientId,GOOGLE_CLIENT_SECRET:clientSecret,AUTH_EMAIL_FROM:sender,GMAIL_REFRESH_TOKEN:tokens.refresh_token,BETTER_AUTH_SECRET:process.env.BETTER_AUTH_SECRET||crypto.randomBytes(48).toString('base64url'),AUTH_BASE_URL:process.env.AUTH_BASE_URL||'https://signalforge-research-nr.brandmintai.chatgpt.site',AUTH_ENABLED:'true'};
  let contents=fs.readFileSync(filename,'utf8');
  for(const [key,value]of Object.entries(values)){const pattern=new RegExp('^'+key+'=.*$','m');const line=key+'='+JSON.stringify(value);contents=pattern.test(contents)?contents.replace(pattern,()=>line):contents.trimEnd()+'\n'+line+'\n';}
  const temporary=filename+'.next';fs.writeFileSync(temporary,contents,{mode:0o600});fs.renameSync(temporary,filename);
  tokens.access_token=null;tokens.refresh_token=null;completed=true;
  console.log('Gmail sender verified. Authentication settings saved in ignored .env.auth.local. No credentials were printed. Hosted activation is still required.');
  res.writeHead(303,{Location:'/done'});res.end();
  clearTimeout(expiry);setTimeout(()=>server.close(),15000).unref();
 }catch(error){inProgress=false;res.writeHead(400);res.end('Gmail authorization could not be completed. Check the configured client, sender, Gmail API enablement, and consent settings.');console.error(error instanceof Error&&error.message.startsWith('Google did not return')?error.message:'Gmail authorization failed. No credentials were displayed or changed.');}
});
server.on('error',()=>{console.error('Could not start the local authorization callback on port 57431.');process.exitCode=1;});
const expiry=setTimeout(()=>{console.error('The Gmail authorization window expired. Restart the wizard when ready.');server.close();process.exitCode=1;},10*60*1000).unref();
server.listen(57431,'127.0.0.1',()=>{console.log('Use this Google authorization link to connect the configured sender mailbox. Grant only the shown identity and send-email permissions.');console.log(authorize.href);});
