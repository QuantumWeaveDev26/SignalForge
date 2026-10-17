import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedBrand,scopeWorkspace,brandResearch,brandSearch} from '../lib/brand-view-policy.ts';
const data={profiles:[{id:'a',name:'Same name'},{id:'b',name:'Same name'}],preferences:{selected_profile_id:'a'},reports:[{id:'ra',profileId:'a'},{id:'rb',profileId:'b'},{id:'r0',profileId:null}],projects:[{id:'pa',profile_id:'a'},{id:'pb',profile_id:'b'}],attachments:[{id:'fa',profile_id:'a'},{id:'fb',profile_id:'b'}],workflows:[{id:'wa',input:{profileId:'a'}},{id:'wb',input:{profileId:'b'}},{id:'old',input:{subject:'Same name'}}],workflowRuns:[{id:'run-a',profile_id:'a'},{id:'run-b',profile_id:'b'}],monitors:[{id:'ma',managed_profile_id:'a',input:'{}'},{id:'manual-a',input:'{"profileId":"a"}'},{id:'mb',input:'{"profileId":"b"}'},{id:'broken',input:'invalid'}],reportCounts:{total:203,completed:201},reportCountsByBrand:[{profile_id:'a',total:125,completed:124},{profile_id:'b',total:77,completed:77}]};
test('Brand preference, explicit URL scope and legacy brand/project links resolve without trusting unknown IDs',()=>{
 assert.equal(selectedBrand(data,null,'chats',''),'a');assert.equal(selectedBrand(data,'b','chats',''),'b');assert.equal(selectedBrand(data,'','files','a'),'');assert.equal(selectedBrand(data,null,'files','pb'),'b');assert.equal(selectedBrand(data,null,'workflows','b'),'b');assert.equal(selectedBrand(data,'foreign','reports',''),'');assert.equal(selectedBrand({...data,profiles:[]},null,'reports',''),'');
});
test('One brand view scopes every associated list by identity, keeps legacy/unassociated content in All brands and preserves full counts',()=>{
 const snapshot=JSON.stringify(data),a=scopeWorkspace(data,'a'),b=scopeWorkspace(data,'b');
 for(const [key,ids]of Object.entries({reports:['ra'],projects:['pa'],attachments:['fa'],workflows:['wa'],workflowRuns:['run-a'],monitors:['ma','manual-a']}))assert.deepEqual(a[key].map(r=>r.id),ids,key);
 assert.equal(a.reportCounts.total,125);assert.equal(a.reportCounts.completed,124);assert.deepEqual(b.workflows.map(r=>r.id),['wb']);assert.equal(a.profiles,data.profiles);assert.equal(scopeWorkspace(data,''),data);assert.equal(JSON.stringify(data),snapshot);
});
test('New-work prefill copies current brand context without mutating saved inputs or reusing attachment arrays',()=>{
 const base={template:'custom',subject:'',question:'',market:'Global',attachmentIds:['file-old'],context:''},profile={id:'a',name:'Same name',market:'India',website:'https://example.com',context:'Supplied assumptions',audience:'Buyers',competitors:'Rival'};
 const before=JSON.stringify(base),fresh=brandResearch(base,profile);assert.equal(fresh.profileId,'a');assert.equal(fresh.market,'India');assert.match(fresh.context,/https:\/\/example.com\nSupplied assumptions/);fresh.attachmentIds.push('new');assert.equal(JSON.stringify(base),before);assert.equal(brandResearch(base).subject,'');assert.equal(brandResearch(base,{...profile,context:'x'.repeat(15000)}).context.length,12000);
});
test('Brand navigation preserves report filters/grid preferences and explicitly represents All brands for Back/reload',()=>{
 const value=new URLSearchParams(brandSearch('?q=coffee&brand=a&favorite=true&view=grid','b'));assert.equal(value.get('q'),'coffee');assert.equal(value.get('brand'),'b');assert.equal(value.get('view'),'grid');assert.equal(value.get('favorite'),'true');const all=new URLSearchParams(brandSearch(value.toString(),''));assert.equal(all.has('brand'),true);assert.equal(all.get('brand'),'');
});
