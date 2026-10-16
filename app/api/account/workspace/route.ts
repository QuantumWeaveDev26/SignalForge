import { env } from 'cloudflare:workers';
import { getAccountSession } from '@/lib/application-auth';
import { authOrigin, previewWorkspaceSelected, requireAuthOrigin, workspaceCookie } from '@/lib/auth-policy';
export const dynamic='force-dynamic';
async function handle(request:Request){
 const session=await getAccountSession(request.headers);
 if(!session?.user.emailVerified||!env.DB)return Response.json({error:'Sign in to SignalForge.'},{status:401});
 const link=await env.DB.prepare('SELECT owner FROM workspace_accounts WHERE user_id=?').bind(session.user.id).first();
 if(request.method==='GET')return Response.json({linked:!!link,workspace:link&&previewWorkspaceSelected(request.headers.get('cookie'))?'preview':'personal'},{headers:{'Cache-Control':'no-store'}});
 try{requireAuthOrigin(request,env);}catch{return Response.json({error:'This action must be sent from SignalForge.'},{status:403});}
 const value:any=await request.json().catch(()=>null);
 if(!value||!['personal','preview'].includes(value.workspace))return Response.json({error:'Select a workspace.'},{status:400});
 if(value.workspace==='preview'&&!link)return Response.json({error:'Link your original preview account first.'},{status:403});
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':workspaceCookie(authOrigin(env),value.workspace)}});
}
export const GET=handle;export const POST=handle;
