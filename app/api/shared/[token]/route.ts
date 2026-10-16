import { one, publicReport } from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){const token=new URL(req.url).pathname.split('/').pop()||'';if(!/^[a-zA-Z0-9-]{50,100}$/.test(token))return Response.json({error:'Report unavailable.'},{status:404});const report=await one("SELECT * FROM reports WHERE share_token=? AND status IN ('completed','incomplete')",token);return report?Response.json(publicReport(report,true),{headers:{'Cache-Control':'no-store'}}):Response.json({error:'This share link is unavailable or has been revoked.'},{status:404});}
