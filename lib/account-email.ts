import type { AccountEmail } from './auth-config';
import { authOrigin, type AuthEnvironment } from './auth-policy.ts';
import { Buffer } from 'node:buffer';

export async function sendAccountEmail(config: AuthEnvironment, mail: AccountEmail) {
  if (!config.GMAIL_REFRESH_TOKEN || !config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.AUTH_EMAIL_FROM) throw new Error('Account email delivery is not configured.');
  // Mail links must point to this application's fixed origin, never a client
  // supplied host. The provider key and verification URL are never logged.
  if (new URL(mail.url).origin !== authOrigin(config)) throw new Error('Invalid account email link.');
  if (/[\r\n]/.test(mail.to + config.AUTH_EMAIL_FROM) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(mail.to) || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(config.AUTH_EMAIL_FROM)) throw new Error('Invalid account email address.');
  const refreshed = await fetch('https://oauth2.googleapis.com/token', { method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:config.GMAIL_REFRESH_TOKEN,client_id:config.GOOGLE_CLIENT_ID,client_secret:config.GOOGLE_CLIENT_SECRET}),signal:AbortSignal.timeout(15000) });
  const credentials:any = await refreshed.json().catch(()=>({}));
  if(!refreshed.ok || typeof credentials.access_token!=='string')throw new Error('Account email authorization needs to be reconnected.');
  const authorization='Bearer '+credentials.access_token;
  const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:authorization},signal:AbortSignal.timeout(15000)});
  const sender:any=await identity.json().catch(()=>({}));
  if(!identity.ok||sender.email_verified!==true||sender.email?.toLowerCase()!==config.AUTH_EMAIL_FROM.toLowerCase())throw new Error('Account email sender does not match the authorized Gmail mailbox.');
  const verification = mail.kind === 'verify';
  const text=`${verification ? 'Confirm your email to finish creating your SignalForge account.' : 'You requested a SignalForge password reset.'}\n\n${mail.url}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.\n\nSignalForge`;
  const message=[`From: SignalForge <${config.AUTH_EMAIL_FROM}>`,`To: ${mail.to}`,`Subject: ${verification?'Verify your SignalForge email':'Reset your SignalForge password'}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(text,'utf8').toString('base64')].join('\r\n');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(message,'utf8').toString('base64url')}),signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error('Account email could not be sent. Please try again later.');
}
