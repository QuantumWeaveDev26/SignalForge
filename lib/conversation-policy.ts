import {AppError,bounded,safeUrl} from './research';
export function chatMode(value:unknown){const mode=value||'strategy';if(!['strategy','research'].includes(String(mode)))throw new AppError('Choose Strategy Agent or Research Agent.');return mode as 'strategy'|'research';}
export function personaContext(value:unknown){
 if(value==null)return {};
 if(typeof value!=='object'||Array.isArray(value))throw new AppError('Invalid persona perspective.');
 const input=value as Record<string,unknown>,name=bounded(input.name,'Persona name',100),description=bounded(input.description,'Persona description',2000);
 if(!name&&!description)return {};
 if(!name||!description)throw new AppError('Give the persona both a name and a description.');
 return {name,description};
}
export function conversationMarkdown(thread:any,turns:any[]){
 return `# ${thread.title}\n\n${thread.context?.name?'Brand: '+thread.context.name+'\n\n':''}${thread.persona?.name?'Hypothetical persona perspective: '+thread.persona.name+' (not interview or panel evidence)\n\n':''}`+turns.map(t=>`## You\n\n${t.question}\n\n## SignalForge · ${t.mode==='research'?'Research Agent':'Strategy Agent'}\n\n${t.body||''}\n\nStatus: ${t.status}${t.error?'\n\n'+t.error:''}\n\n${t.sources?.length?'### Sources\n\n'+t.sources.filter((s:any)=>safeUrl(s.url)).map((s:any,i:number)=>`${i+1}. ${s.title}: ${safeUrl(s.url)}`).join('\n'):''}`).join('\n\n---\n\n');
}
export function mergeTurns(older:any[],latest:any[]){const map=new Map(older.map(t=>[t.id,t]));for(const turn of latest)map.set(turn.id,turn);return [...map.values()];}
