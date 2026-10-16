import { workflowStarters, type WorkflowStep } from './collection-policy';
export type CatalogWorkflow={id:string;name:string;description:string;categories:string[];requires?:'social'|'ads';steps:WorkflowStep[]};
export const workflowCatalog:CatalogWorkflow[]=[
 {id:'brand-audit',...workflowStarters[0],name:'Brand Audit',categories:['Brand strategy','Pitch','Competitive']},
 {id:'audience-deep-dive',...workflowStarters[2],name:'Audience Deep-Dive',categories:['Audiences','Brand strategy']},
 {id:'four-cs',...workflowStarters[1],categories:['Pitch','Competitive','Audiences']},
 {id:'brand-social-sentiment',name:'Brand Social Sentiment Analysis',description:'Analyze evidenced brand mentions and sentiment across collected social posts. Requires a connected social dataset.',categories:['Social','Brand strategy'],requires:'social',steps:[]},
 {id:'topic-social-sentiment',name:'Topic Social Sentiment Analysis',description:'Examine social discussion around a topic using attributable posts and a disclosed sample. Requires a connected social dataset.',categories:['Social'],requires:'social',steps:[]},
 {id:'benchmark-campaign',name:'Benchmark Campaign Finder',description:'Find real campaign and creative examples for a brief. Requires a connected advertising dataset.',categories:['Pitch','Competitive'],requires:'ads',steps:[]},
 {id:'rfp-win-strategy',...workflowStarters[3],name:'RFP Win Strategy for Agencies',categories:['Pitch']},
 {id:'influencer',name:'Influencer',description:'Discover and assess creators using verifiable social profiles and posts. Requires a connected social dataset.',categories:['Social','Audiences'],requires:'social',steps:[]},
 {id:'employer-positioning',name:'Employer Positioning & Employee Journey',description:'Review public employer positioning, candidate experience and employee evidence, with explicit source limitations.',categories:['Employer','Brand strategy'],steps:[
  {name:'Employer evidence',template:'brand',question:'Research the employer proposition, careers messaging and publicly evidenced candidate/employee journey. Separate company claims from independent evidence; do not infer representative sentiment from anecdotes.'},
  {name:'Positioning opportunities',template:'custom',question:'Synthesize prior employer evidence into positioning opportunities and journey improvements, with uncertainties and validation questions.'}
 ]}
];
