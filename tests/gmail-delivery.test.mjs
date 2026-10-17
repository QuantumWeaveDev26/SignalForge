import test from 'node:test';
import assert from 'node:assert/strict';
import {sendGmail,authorizeGmail,MailDeliveryError} from '../lib/gmail-delivery.ts';
const config={GOOGLE_CLIENT_ID:'fixture.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'fixture-secret',GMAIL_REFRESH_TOKEN:'fixture-refresh',AUTH_EMAIL_FROM:'sender@example.com'};
const mail={to:'recipient@example.com',subject:'SignalForge — Bengaluru',text:'A private link only.',messageId:'qa-email-1'};

test('Safe pre-send requests recover from transient token failures and encode MIME without leaking credentials',async()=>{
 const previous=globalThis.fetch;let tokens=0,sends=0,mime;
 globalThis.fetch=async(url,options)=>{if(String(url).includes('oauth2.googleapis.com'))return ++tokens===1?new Response('',{status:503}):Response.json({access_token:'fixture-access'});if(String(url).includes('userinfo'))return Response.json({email:config.AUTH_EMAIL_FROM,email_verified:true});sends++;mime=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();return Response.json({id:'accepted'});};
 try{assert.equal((await sendGmail(config,mail)).id,'accepted');assert.equal(tokens,2);assert.equal(sends,1);assert.match(mime,/Subject: =\?UTF-8\?B\?/);assert.match(mime,/Message-ID: <qa-email-1@signalforge.invalid>/);assert.doesNotMatch(mime,/fixture-secret|fixture-refresh|fixture-access/);}finally{globalThis.fetch=previous;}
});
test('Network failure or broken Gmail success acknowledgement is uncertain and never blindly retried',async()=>{
 const previous=globalThis.fetch;
 try{for(const mode of ['network','broken','null','server']){
 let sends=0;globalThis.fetch=async url=>{if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'fixture-access'});if(String(url).includes('userinfo'))return Response.json({email:config.AUTH_EMAIL_FROM,email_verified:true});sends++;if(mode==='network')throw Error('Do not expose this provider detail');if(mode==='server')return new Response('internal',{status:503});return Response.json(mode==='null'?null:{});};
 await assert.rejects(()=>sendGmail(config,mail),e=>e instanceof MailDeliveryError&&e.disposition==='uncertain'&&!e.message.includes('provider detail'));assert.equal(sends,1);
 }}finally{globalThis.fetch=previous;}
});
test('Permanent authorization errors and mismatched senders never reach Gmail send',async()=>{
 const previous=globalThis.fetch;let sends=0;
 try{for(const mode of ['revoked','mismatch']){
 globalThis.fetch=async url=>{if(String(url).includes('oauth2.googleapis.com'))return mode==='revoked'?Response.json({error:'invalid_grant',error_description:'SECRET DETAIL'},{status:400}):Response.json({access_token:'fixture-access'});if(String(url).includes('userinfo'))return Response.json({email:'wrong@example.com',email_verified:true});sends++;return Response.json({id:'unexpected'});};
 await assert.rejects(()=>sendGmail(config,mail),e=>e.disposition==='blocked'&&!e.message.includes('SECRET DETAIL'));
 }assert.equal(sends,0);}finally{globalThis.fetch=previous;}
});
test('Header injection and malformed senders are rejected before external requests',async()=>{
 const previous=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error();};
 try{await assert.rejects(()=>sendGmail(config,{...mail,to:'recipient@example.com\r\nBcc: victim@example.com'}));await assert.rejects(()=>sendGmail(config,{...mail,subject:'hello\r\nBcc: victim@example.com'}));await assert.rejects(()=>sendGmail(config,{...mail,messageId:'bad\r\nheader'}));await assert.rejects(()=>authorizeGmail({...config,AUTH_EMAIL_FROM:'sender@example.com\r\nBcc: x'}));assert.equal(calls,0);}finally{globalThis.fetch=previous;}
});
