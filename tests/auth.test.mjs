import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {betterAuth} from 'better-auth/minimal';
import {drizzleAdapter} from '@better-auth/drizzle-adapter';
import {drizzle} from 'drizzle-orm/d1';
import {authOptions} from '../lib/auth-config.ts';
import {authAvailability,authOrigin,safeAuthReturn,requireAuthOrigin,newWorkspaceOwner,legacyLinkSql,previewWorkspaceSelected} from '../lib/auth-policy.ts';
import {authUser,authSession,authAccount,authVerification,authRateLimit} from '../db/schema.ts';
import {sendAccountEmail} from '../lib/account-email.ts';

const origin='https://signalforge.test';
const config={AUTH_ENABLED:'true',AUTH_BASE_URL:origin,BETTER_AUTH_SECRET:'test-only-secret-that-is-never-used-in-production-123456789',GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-client-secret',GMAIL_REFRESH_TOKEN:'test-refresh-token',AUTH_EMAIL_FROM:'sender@example.com'};
const password='A-unique-test-password-123';
const replacement='Another-unique-password-456';
let mf,db,auth,userId;
const mail=[];
const jar=new Map();
function cookies(response){for(const entry of response.headers.getSetCookie()){const pair=entry.split(';')[0];const i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}}
function cookieHeader(){return [...jar].map(([k,v])=>k+'='+v).join('; ');}
async function call(path,body,extra={}){const response=await auth.handler(new Request(origin+'/api/auth/'+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','cf-connecting-ip':'192.0.2.10',Cookie:cookieHeader(),...extra},...(body?{body:JSON.stringify(body)}:{})}));cookies(response);return response;}

before(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
 db=await mf.getD1Database('DB');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const part of fs.readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint')){if(part.trim())await db.prepare(part).run();}
 auth=betterAuth({...authOptions(config,async value=>{mail.push(value);}),database:drizzleAdapter(drizzle(db),{provider:'sqlite',transaction:false,schema:{user:authUser,session:authSession,account:authAccount,verification:authVerification,rateLimit:authRateLimit}})});
});
after(async()=>{if(mf)await mf.dispose();});

test('Cloudflare auth route forwards POST bodies after checking origin and size',async()=>{
 const {build}=await import('esbuild');
 const result=await build({stdin:{contents:'import {POST} from "./app/api/auth/[...path]/route.ts"; import {createTrackedAppRouteRequest} from "./node_modules/vinext/dist/server/app-route-handler-runtime.js"; export default {fetch(request){return POST(createTrackedAppRouteRequest(request).request);}};',resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*'],plugins:[{
  name:'auth-route-boundary-fixture',setup(build){
   build.onResolve({filter:/^@\/lib\/application-auth$/},()=>({path:'auth-fixture',namespace:'fixture'}));
   build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export function accountAuth(){return {handler:async request=>Response.json({body:await request.json(),origin:request.headers.get("origin")})};}'}));
   build.onResolve({filter:/^@\/lib\/auth-policy$/},()=>({path:fileURLToPath(new URL('../lib/auth-policy.ts',import.meta.url))}));
  }
 }]});
 const runtime=new Miniflare({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],bindings:config});
 try{
  const body={provider:'google',callbackURL:'/workspace'};
  const forwarded=await runtime.dispatchFetch(origin+'/api/auth/sign-in/social',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(forwarded.status,200,await forwarded.clone().text());
  assert.deepEqual(await forwarded.json(),{body,origin});
  assert.equal(forwarded.headers.get('cache-control'),'no-store');
  const cross=await runtime.dispatchFetch(origin+'/api/auth/sign-out',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'});assert.equal(cross.status,403);
  const large=await runtime.dispatchFetch(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin},body:'x'.repeat(16001)});assert.equal(large.status,413);
 }finally{await runtime.dispose();}
});

test('Auth configuration rejects unsafe origins and redirect destinations',()=>{
 assert.throws(()=>authOrigin({...config,AUTH_BASE_URL:'http://example.com'}));
 assert.throws(()=>authOrigin({...config,AUTH_BASE_URL:'https://u:p@example.com'}));
 assert.equal(safeAuthReturn('https://other.example'),'/workspace');
 assert.equal(safeAuthReturn('//other.example'),'/workspace');
 assert.equal(safeAuthReturn('/\\other.example'),'/workspace');
 assert.equal(safeAuthReturn('/api/auth/sign-out'),'/workspace');
 assert.equal(safeAuthReturn('/workspace/reports/report-1?view=full'),'/workspace/reports/report-1?view=full');
 assert.throws(()=>requireAuthOrigin(new Request(origin,{headers:{Origin:'https://other.example'}}),config));
 assert.equal(authAvailability({...config,AUTH_ENABLED:'false'}).ready,false);
 assert.equal(authAvailability({...config,GMAIL_REFRESH_TOKEN:undefined}).email,false);
 assert.equal(authAvailability({...config,GOOGLE_CLIENT_SECRET:undefined}).google,false);
});

test('Real D1 signup stores a password hash and blocks unverified sessions',async()=>{
 const r=await call('sign-up/email',{name:'Research test account',email:'research@example.com',password,callbackURL:'/workspace'});
 assert.equal(r.status,200,await r.clone().text());
 const v=await r.json();userId=v.user.id;assert.equal(v.user.emailVerified,false);
 const stored=await db.prepare('SELECT password FROM auth_account WHERE user_id=?').bind(userId).first();
 assert.ok(stored.password&&stored.password!==password&&stored.password.length>30);
 assert.ok(mail.some(m=>m.kind==='verify'&&m.to==='research@example.com'));
 const blocked=await call('sign-in/email',{email:'research@example.com',password});assert.equal(blocked.status,403);
 const session=await call('get-session');assert.equal(await session.json(),null);
});

test('Verification creates a secure session, and a forged session is rejected',async()=>{
 const link=mail.find(m=>m.kind==='verify').url;
 const verified=await auth.handler(new Request(link));cookies(verified);
 assert.equal(verified.status,302);
 assert.ok(verified.headers.getSetCookie().some(c=>c.includes('session_token')&&/HttpOnly/i.test(c)&&/Secure/i.test(c)&&/SameSite=Lax/i.test(c)));
 const r=await call('get-session');const session=await r.json();assert.equal(session.user.id,userId);assert.equal(session.user.emailVerified,true);
 const forged=await call('get-session',null,{Cookie:'__Secure-signalforge.session_token=forged'});assert.equal(await forged.json(),null);
});

test('Google OAuth uses the expected callback and does not request Gmail access',async()=>{
 const r=await call('sign-in/social',{provider:'google',callbackURL:'/workspace'});assert.equal(r.status,200,await r.clone().text());
 const value=await r.json(),target=new URL(value.url);
 assert.equal(target.hostname,'accounts.google.com');
 assert.equal(target.searchParams.get('redirect_uri'),origin+'/api/auth/callback/google');
 assert.equal(target.searchParams.get('client_id'),config.GOOGLE_CLIENT_ID);
 assert.ok(target.searchParams.get('state'));assert.ok(target.searchParams.get('code_challenge'));
 assert.doesNotMatch(target.searchParams.get('scope')||'',/gmail/);
 const rejected=await call('sign-in/social',{provider:'google',callbackURL:'https://other.example/steal'});assert.equal(rejected.status,403);
 const invalid=await auth.handler(new Request(origin+'/api/auth/callback/google?state=invalid&code=invalid'));assert.equal(invalid.status,302);assert.match(invalid.headers.get('location'),/error=/);
});

test('Password reset revokes old sessions and the reset token is single use',async()=>{
 const sessionBefore=await call('get-session');assert.ok((await sessionBefore.json())?.user);
 const requested=await call('request-password-reset',{email:'research@example.com',redirectTo:origin+'/reset-password'});assert.equal(requested.status,200);
 const link=mail.findLast(m=>m.kind==='reset').url;
 const returned=await auth.handler(new Request(link));
 const token=new URL(returned.headers.get('location')).searchParams.get('token');assert.ok(token);
 const reset=await call('reset-password',{newPassword:replacement,token});assert.equal(reset.status,200,await reset.clone().text());
 assert.equal(await (await call('get-session')).json(),null);
 const again=await call('reset-password',{newPassword:password,token});assert.equal(again.status,400);
 const old=await call('sign-in/email',{email:'research@example.com',password});assert.equal(old.status,401);
 const changed=await call('sign-in/email',{email:'research@example.com',password:replacement});assert.equal(changed.status,200,await changed.clone().text());
 const out=await call('sign-out',{});assert.equal(out.status,200);assert.equal(await (await call('get-session')).json(),null);
});

test('Additive migration and preview linking preserve both workspaces and prevent duplicate claims',()=>{
 const sqlite=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const time='2026-10-15T00:00:00Z';
 sqlite.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('u1','One','one@example.com',1,0,0);
 sqlite.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)').run('u2','Two','two@example.com',1,0,0);
 const report=sqlite.prepare('INSERT INTO reports(id,owner,title,template,subject,market,question,input,status,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
 report.run('old','preview-owner','Original','brand','Brand','India','Question','{}','completed',time,time);
 report.run('new',newWorkspaceOwner('u1'),'New','brand','Brand','India','Question','{}','completed',time,time);
 sqlite.prepare(legacyLinkSql).run('u1','preview-owner',time);sqlite.prepare(legacyLinkSql).run('u1','preview-owner',time);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM workspace_accounts').get().n,1);
 assert.throws(()=>sqlite.prepare(legacyLinkSql).run('u2','preview-owner',time));
 assert.equal(sqlite.prepare('SELECT owner FROM reports WHERE id=?').get('old').owner,'preview-owner');
 assert.equal(sqlite.prepare('SELECT owner FROM reports WHERE id=?').get('new').owner,'auth:u1');
 assert.equal(previewWorkspaceSelected('other=value; signalforge.workspace=preview'),true);
 assert.equal(previewWorkspaceSelected('signalforge.workspace=preview-other'),false);
 sqlite.prepare('DELETE FROM workspace_accounts WHERE user_id=?').run('u1');assert.equal(sqlite.prepare('SELECT count(*) AS n FROM reports').get().n,2);
 sqlite.close();
});

test('Gmail transport validates the mailbox and never sends an injected or external link',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'test-access-token'});if(String(url).includes('userinfo'))return Response.json({email:config.AUTH_EMAIL_FROM,email_verified:true});return Response.json({id:'test-message'});};
 try{
  await sendAccountEmail(config,{to:'recipient@example.com',url:origin+'/api/auth/verify-email?token=test',kind:'verify'});
  assert.equal(calls.length,3);assert.equal(calls[2].url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  const raw=JSON.parse(calls[2].options.body).raw;const mime=Buffer.from(raw,'base64url').toString('utf8');assert.match(mime,/To: recipient@example.com/);assert.doesNotMatch(mime,/test-refresh-token|test-client-secret/);
  await assert.rejects(()=>sendAccountEmail(config,{to:'victim@example.com\r\nBcc: attacker@example.com',url:origin+'/verify',kind:'verify'}));
  await assert.rejects(()=>sendAccountEmail(config,{to:'recipient@example.com',url:'https://other.example/verify',kind:'verify'}));
  globalThis.fetch=async url=>String(url).includes('oauth2.googleapis.com')?Response.json({access_token:'test'}):Response.json({email:'other@example.com',email_verified:true});
  await assert.rejects(()=>sendAccountEmail(config,{to:'recipient@example.com',url:origin+'/verify',kind:'verify'}),/sender does not match/);
 }finally{globalThis.fetch=original;}
});

test('Account device list redacts tokens and other accounts, and revoked sessions cannot authenticate again',async()=>{
 const {build}=await import('esbuild');const b=await build({entryPoints:['lib/account-security.ts'],bundle:true,write:false,format:'esm',platform:'browser'});const {accountDevices,revokeDevice}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
 const email='device-qa@example.com',pass='Device-QA-only-password-593!';const signup=await auth.handler(new Request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Device QA',email,password:pass})}));assert.ok(signup.ok);
 await db.prepare('UPDATE auth_user SET email_verified=1 WHERE email=?').bind(email).run();
 async function signin(){const response=await auth.handler(new Request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:pass})}));assert.ok(response.ok);return new Headers({Cookie:response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),Origin:origin});}
 const first=await signin(),second=await signin(),state=await accountDevices(auth,first);assert.equal(state.items.length,2);assert.ok(state.items.some(s=>s.current));assert.doesNotMatch(JSON.stringify(state),/token|password/);
 const other=state.items.find(s=>!s.current);await assert.rejects(()=>revokeDevice(auth,first,state.currentId),/Sign out/);await assert.rejects(()=>revokeDevice(auth,first,'another-account-session'),/not found/);assert.equal((await revokeDevice(auth,first,other.id)).ok,true);assert.equal(await auth.api.getSession({headers:second,query:{disableRefresh:true}}),null);assert.equal((await accountDevices(auth,first)).items.length,1);
});
