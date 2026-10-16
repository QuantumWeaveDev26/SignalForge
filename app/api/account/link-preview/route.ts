import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getAccountSession } from '@/lib/application-auth';
import { legacyLinkSql, requireAuthOrigin, authOrigin, workspaceCookie } from '@/lib/auth-policy';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  try { requireAuthOrigin(request,env); } catch { return Response.json({error:'This action must be sent from SignalForge.'},{status:403}); }
  const session=await getAccountSession(request.headers);
  const legacy=await getChatGPTUser();
  if(!session?.user.emailVerified||!legacy||!env.DB)return Response.json({error:'Sign in to both your verified SignalForge account and the original preview account to link reports.'},{status:401});
  if(session.user.email.toLowerCase()!==legacy.email.toLowerCase())return Response.json({error:'Both accounts must use the same verified email address.'},{status:403});
  if(Date.now()-new Date(session.session.createdAt).getTime()>10*60*1000)return Response.json({error:'Sign out and sign in again before linking existing reports.'},{status:403});
  const existing=await env.DB.prepare('SELECT owner FROM workspace_accounts WHERE user_id=?').bind(session.user.id).first<{owner:string}>();
  if(existing)return Response.json(existing.owner===legacy.userId?{ok:true}:{error:'This account is already linked.'},{status:existing.owner===legacy.userId?200:409,headers:existing.owner===legacy.userId?{'Set-Cookie':workspaceCookie(authOrigin(env),'preview')}:{}});
  try {
    await env.DB.prepare(legacyLinkSql).bind(session.user.id,legacy.userId,new Date().toISOString()).run();
    const saved=await env.DB.prepare('SELECT owner FROM workspace_accounts WHERE user_id=?').bind(session.user.id).first<{owner:string}>();
    if(saved?.owner!==legacy.userId)return Response.json({error:'This account is already linked.'},{status:409});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':workspaceCookie(authOrigin(env),'preview')}});
  } catch { return Response.json({error:'These preview records are already linked to another account.'},{status:409}); }
}
