import {all,owned} from './server';
import {AppError} from './research';
export async function monitorHistory(record:string,owner:string,params:URLSearchParams){
 const monitor=await owned('monitors',record,owner);let cursor:any=null;
 const before=params.get('before');
 if(before){try{if(before.length>250)throw new Error();cursor=JSON.parse(before);if(!cursor||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.created)||!Number.isFinite(Date.parse(cursor.created))||typeof cursor.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(cursor.id))throw new Error();}catch{throw new AppError('Invalid history cursor. Reload the monitoring history.');}}
 const rows=await all(`SELECT id,title,status,error,created,updated,monitor_due,json_extract(monitor_comparison,'$.state') AS comparison_state FROM reports WHERE owner=? AND monitor_id=? ${cursor?'AND (created<? OR (created=? AND id<?))':''} ORDER BY created DESC,id DESC LIMIT 21`,owner,record,...(cursor?[cursor.created,cursor.created,cursor.id]:[]));
 const items=rows.slice(0,20),last=items.at(-1);
 return {monitor:{...monitor,input:JSON.parse(monitor.input)},items,nextCursor:rows.length>20?JSON.stringify({created:last.created,id:last.id}):null};
}
