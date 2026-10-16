import { env } from 'cloudflare:workers';
import { accountAuth } from '@/lib/application-auth';
import { authAvailability, requireAuthOrigin } from '@/lib/auth-policy';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  const available = authAvailability(env);
  const path = new URL(request.url).pathname;
  if (path === '/api/auth/config' && request.method === 'GET') return Response.json(available, {headers:{'Cache-Control':'no-store'}});
  if (!available.ready) return Response.json({error:'SignalForge account setup is awaiting activation.'}, {status:503,headers:{'Cache-Control':'no-store'}});
  if (request.method === 'POST') {
    try { requireAuthOrigin(request, env); } catch { return Response.json({error:'This action must be sent from SignalForge.'},{status:403}); }
    if (Number(request.headers.get('content-length') || 0) > 16000) return Response.json({error:'Request too large.'},{status:413});
    const body = await request.text();
    if (body.length > 16000) return Response.json({error:'Request too large.'},{status:413});
    // Vinext wraps requests in a Proxy, which Workers cannot use as Request input.
    request = new Request(request.url, {method: request.method, headers: request.headers, body, redirect: request.redirect});
  }
  try {
    const response = await accountAuth().handler(request);
    const result = new Response(response.body, response);
    result.headers.set('Cache-Control','no-store');
    result.headers.set('Referrer-Policy','no-referrer');
    return result;
  } catch {
    return Response.json({error:'Account service is unavailable. Please try again later.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
export const GET=handle;
export const POST=handle;
