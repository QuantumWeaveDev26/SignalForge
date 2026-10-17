import {AppError} from './research';
export type MonitorSchedule={timezone:string;hour:number;minute:number;weekday:number;monthday:number};
export function monitorSchedule(v:any):MonitorSchedule{if(!v||typeof v!=='object'||Array.isArray(v))throw new AppError('Provide a monitoring schedule.');const timezone=v.timezone;if(typeof timezone!=='string'||timezone.length>100)throw new AppError('Choose an IANA timezone.');try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{throw new AppError('Choose a valid IANA timezone, such as Asia/Kolkata.');}for(const[k,min,max]of[['hour',0,23],['minute',0,59],['weekday',0,6],['monthday',1,31]] as const)if(!Number.isInteger(v[k])||v[k]<min||v[k]>max)throw new AppError('Invalid monitoring '+k+'.');return {timezone,hour:v.hour,minute:v.minute,weekday:v.weekday,monthday:v.monthday};}
export function scheduledRun(cadence:string,schedule:MonitorSchedule,after=new Date()):string{
 if(!['daily','weekly','monthly'].includes(cadence))throw new AppError('Invalid monitoring cadence.');
 const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const parts=(t:number)=>Object.fromEntries(fmt.formatToParts(t).filter(x=>x.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const stamp=(p:any)=>Date.UTC(p.year,p.month-1,p.day,p.hour||0,p.minute||0,p.second||0);
 const today=parts(after.getTime()),start=Date.UTC(today.year,today.month-1,today.day);
 for(let day=0;day<400;day++){
  const date=new Date(start+day*86400000),year=date.getUTCFullYear(),month=date.getUTCMonth(),d=date.getUTCDate();
  if(cadence==='weekly'&&date.getUTCDay()!==schedule.weekday)continue;
  if(cadence==='monthly'&&d!==Math.min(schedule.monthday,new Date(Date.UTC(year,month+1,0)).getUTCDate()))continue;
  const local=Date.UTC(year,month,d,schedule.hour,schedule.minute),offsets=new Set([-86400000,0,86400000].map(shift=>stamp(parts(local+shift))-(local+shift)));
  const candidates=[...offsets].map(offset=>local-offset),exact=candidates.filter(t=>stamp(parts(t))===local).sort((a,b)=>a-b);
  // Fall-back repeats run once at the first occurrence. Spring gaps move forward by the gap.
  const chosen=exact[0]??candidates.filter(t=>stamp(parts(t))>local).sort((a,b)=>stamp(parts(a))-stamp(parts(b)))[0];
  if(chosen>after.getTime())return new Date(chosen).toISOString();
 }
 throw new AppError('A future monitoring time could not be computed.');
}
