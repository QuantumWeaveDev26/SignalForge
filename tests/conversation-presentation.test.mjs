import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const bundled=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './lib/conversation-policy.ts';export {default as Markdown} from './components/markdown.tsx';export {WorkflowLaunch,WorkflowEditor} from './components/workflow-forms.tsx';export {default as ConversationWorkspace} from './components/conversation-workspace.tsx';export {default as WorkflowCatalog} from './components/workflow-catalog.tsx';`},bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom/*','lucide-react']});
fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/conversation-presentation.mjs',bundled.outputFiles[0].text);
const {Markdown,conversationMarkdown,mergeTurns,WorkflowLaunch,WorkflowEditor,ConversationWorkspace,WorkflowCatalog}=await import('../outputs/conversation-presentation.mjs');
const data={user:{name:'Researcher'},preferences:{market:'India'},providerReady:true,profiles:[{id:'brand-fixture',name:'Fixture Brand',market:'India',audience:'Commuters',competitors:'Fixture Rival'}],projects:[{id:'project-fixture',name:'Fixture Project',profile_id:'brand-fixture'}],attachments:[{id:'file-fixture',name:'Brief.txt'}],catalogFavorites:[],workflows:[],workflowRuns:[]};
const workflow={id:'workflow',name:'Brand Investigation',description:'Two passes',input:{subject:'Fixture Brand',market:'India',profileId:'brand-fixture',projectId:'project-fixture',context:'Saved brief',audience:'Commuters',competitors:'Fixture Rival',window:'Last 30 days',attachmentIds:['file-fixture']},steps:[{name:'Discover',template:'brand',question:'What is the positioning?'},{name:'Synthesize',template:'custom',question:'What opportunity follows?'}]};
test('Chat export retains all loaded turns, agent labels and source links, and identifies simulated personas',()=>{
 const latest=[{id:'latest',question:'What next?',body:'New evidence',mode:'research',status:'completed',sources:[{title:'Source',url:'https://example.com/evidence'},{title:'Unsafe',url:'javascript:alert(1)'}]}];
 const older=[{id:'earlier',question:'What matters?',body:'Earlier evidence',mode:'strategy',status:'completed',sources:[]}];
 const text=conversationMarkdown({title:'Saved conversation',context:{name:'Fixture Brand'},persona:{name:'Commuter'}},mergeTurns(older,latest));
 assert.match(text,/Earlier evidence/);assert.match(text,/New evidence/);assert.match(text,/Research Agent/);assert.match(text,/Strategy Agent/);assert.match(text,/not interview or panel evidence/);assert.match(text,/https:\/\/example.com\/evidence/);assert.doesNotMatch(text,/javascript:/);
});
test('Polling updates an answer without dropping previously loaded earlier messages',()=>{
 const original=[{id:'old',body:'Earlier'},{id:'new',body:''}];const merged=mergeTurns(original,[{id:'new',body:'Finished'},{id:'next',body:'Next answer'}]);
 assert.deepEqual(merged.map(t=>t.id),['old','new','next']);assert.equal(merged[1].body,'Finished');
});
test('Workflow launch renders saved defaults, selected files and an explicit execution choice',()=>{
 const html=renderToStaticMarkup(React.createElement(WorkflowLaunch,{workflow,data,busy:false,onStart:async()=>{}}));
 assert.match(html,/Saved brief/);assert.match(html,/Fixture Project/);assert.match(html,/value="brand-fixture" selected/);assert.match(html,/Brief.txt/);assert.match(html,/checked=""/);assert.match(html,/Start 2-step workflow/);assert.match(html,/Review after each step/);assert.match(html,/Continue while this run page is open/);assert.match(html,/Closing or leaving/);
});
test('Workflow editor exposes reorder, duplicate, remove and owned context controls',()=>{
 const html=renderToStaticMarkup(React.createElement(WorkflowEditor,{draft:workflow,setDraft:()=>{},data,busy:false,onSave:()=>{}}));
 assert.match(html,/Move step 1 down/);assert.match(html,/Duplicate step 1/);assert.match(html,/Default brand/);assert.match(html,/Default project/);assert.match(html,/Default context files/);assert.match(html,/Saved brief/);
});
test('Chat has active research shortcuts and workflow cards offer customization without enabling unavailable data',()=>{
 const props={data,busy:false,api:async()=>({}),act:async()=>{},load:async()=>data,go:()=>{}};
 const chat=renderToStaticMarkup(React.createElement(ConversationWorkspace,{...props,record:''}));assert.match(chat,/Explore trends/);assert.match(chat,/Compare competitors/);assert.match(chat,/Persona/);assert.match(chat,/Favorites only/);assert.match(chat,/No project/);
 const catalog=renderToStaticMarkup(React.createElement(WorkflowCatalog,props));assert.match(catalog,/Customize Brand Audit/);assert.match(catalog,/Social data not connected/);assert.match(catalog,/Advertising data not connected/);
 assert.doesNotMatch(chat,/<button[^>]*disabled[^>]*>Explore trends/);
});

test('Bold web links render as safe clickable links and retain citation anchors',()=>{
 const html=renderToStaticMarkup(React.createElement(Markdown,{text:'**[Amul](https://www.amul.com)** [1] **[unsafe](javascript:alert)**',sources:[{url:'https://www.amul.com',title:'Official'}],anchor:'qa'}));
 assert.ok(html.includes('<strong><a href="https://www.amul.com/"'));assert.match(html,/id="qa-ref-1"/);assert.doesNotMatch(html,/href="javascript:/);assert.doesNotMatch(html,/\*\*\[Amul\]/);
});
