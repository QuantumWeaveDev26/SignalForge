import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,createLocalJWKSet,exportJWK} from 'jose';
import {monitorAuthorized} from '../lib/monitor-auth.ts';

test('Monitoring only accepts the configured Google identity, audience, signature and current token',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='qa';
 const keys=createLocalJWKSet({keys:[jwk]});
 const config={MONITOR_GOOGLE_SERVICE_ACCOUNT:'runner@test.iam.gserviceaccount.com',MONITOR_GOOGLE_AUDIENCE:'https://signalforge.test/api/monitor-tick'};
 const token=async(overrides={})=>new SignJWT({email:config.MONITOR_GOOGLE_SERVICE_ACCOUNT,email_verified:true,...overrides}).setProtectedHeader({alg:'RS256',kid:'qa'}).setIssuer('https://accounts.google.com').setAudience(config.MONITOR_GOOGLE_AUDIENCE).setSubject('123456').setIssuedAt().setExpirationTime('1h').sign(privateKey);
 const req=t=>new Request(config.MONITOR_GOOGLE_AUDIENCE,{headers:{Authorization:'Bearer '+t}});
 const valid=await token();
 assert.equal(await monitorAuthorized(req(valid),config,keys),true);
 assert.equal(await monitorAuthorized(req(valid),{...config,MONITOR_GOOGLE_AUDIENCE:'https://other.test'},keys),false);
 assert.equal(await monitorAuthorized(req(await token({email:'other@test.iam.gserviceaccount.com'})),config,keys),false);
 assert.equal(await monitorAuthorized(req(await token({email_verified:false})),config,keys),false);
 const expired=await new SignJWT({email:config.MONITOR_GOOGLE_SERVICE_ACCOUNT,email_verified:true}).setProtectedHeader({alg:'RS256',kid:'qa'}).setIssuer('https://accounts.google.com').setAudience(config.MONITOR_GOOGLE_AUDIENCE).setSubject('123').setIssuedAt(Math.floor(Date.now()/1000)-7200).setExpirationTime(Math.floor(Date.now()/1000)-3600).sign(privateKey);
 assert.equal(await monitorAuthorized(req(expired),config,keys),false);
 assert.equal(await monitorAuthorized(req(valid.slice(0,-10)+'invalidsig'),config,keys),false);
 assert.equal(await monitorAuthorized(req(valid),{},keys),false);
});
test('Operator bearer auth fails closed and legacy flags grant no access',async()=>{
 const request=value=>new Request('https://signalforge.test/api/monitor-tick',{headers:{Authorization:'Bearer '+value}});
 assert.equal(await monitorAuthorized(request('correct'),{MONITOR_RUNNER_SECRET:'correct'}),true);
 assert.equal(await monitorAuthorized(request('wrong'),{MONITOR_RUNNER_SECRET:'correct'}),false);
 assert.equal(await monitorAuthorized(request('anything'),{PRIVATE_MONITOR_RUNNER_ENABLED:'true'}),false);
});
