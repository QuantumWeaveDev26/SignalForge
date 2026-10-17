import {portalIdentity,clientPortal} from '@/lib/client-portal';
import {AppError} from '@/lib/research';
export const dynamic='force-dynamic';
async function handle(req:Request){
 const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
 try{const user=await portalIdentity(req);let value={};if(req.method!=='GET'){if(Number(req.headers.get('content-length')||0)>18000)throw new AppError('Request too large.',413);const text=await req.text();if(text.length>18000)throw new AppError('Request too large.',413);try{value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();}catch{throw new AppError('Invalid request body.');}}
 const parts=new URL(req.url).pathname.replace(/^\/api\/portal\/?/,'').split('/').filter(Boolean);const result=await clientPortal(req,user,parts,value);return result instanceof Response?result:Response.json(result,{headers});
 }catch(e){return Response.json({error:e instanceof AppError?e.message:'Client portal could not be loaded.'},{status:e instanceof AppError?e.status:500,headers});}
}
export {handle as GET,handle as POST};