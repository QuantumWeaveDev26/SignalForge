import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { authUser, authSession, authAccount, authVerification, authRateLimit } from '@/db/schema';
import { authOptions } from './auth-config';
import { authAvailability, newWorkspaceOwner, safeAuthReturn, previewWorkspaceSelected } from './auth-policy';
import { sendAccountEmail } from './account-email';

export type ApplicationUser = { owner: string; userId: string; name: string; email: string; authSource: 'signalforge' | 'chatgpt' };

export function accountAuth() {
  if (!env.DB) throw new Error('Account storage is unavailable.');
  return betterAuth({
    ...authOptions(env, mail => sendAccountEmail(env, mail)),
    database: drizzleAdapter(drizzle(env.DB), {
      provider: 'sqlite', transaction: false,
      schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification, rateLimit: authRateLimit },
    }),
  });
}

export async function getAccountSession(requestHeaders?: Headers) {
  if (!authAvailability(env).ready) return null;
  return accountAuth().api.getSession({ headers: requestHeaders || await headers(), query: { disableRefresh: true } });
}

export async function getApplicationUser(): Promise<ApplicationUser | null> {
  if (env.AUTH_ENABLED === 'true') {
    // Once activated, a ChatGPT cookie never substitutes for a SignalForge
    // session. It is used only by the explicit preview-account linking action.
    const session = await getAccountSession();
    if (!session || !session.user.emailVerified || !env.DB) return null;
    const link = await env.DB.prepare('SELECT owner FROM workspace_accounts WHERE user_id=?').bind(session.user.id).first<{owner:string}>();
    const usePreview=!!link && previewWorkspaceSelected((await headers()).get('cookie'));
    return { owner: usePreview?link!.owner:newWorkspaceOwner(session.user.id), userId: session.user.id, name: session.user.name, email: session.user.email, authSource: 'signalforge' };
  }
  // Compatibility window: until the new credentials are configured and tested,
  // the existing deployment remains usable with its existing ownership scheme.
  const legacy = await getChatGPTUser();
  return legacy ? { owner: legacy.userId, userId: legacy.userId, name: legacy.displayName, email: legacy.email, authSource: 'chatgpt' } : null;
}

export async function requireApplicationUser(returnTo = '/workspace') {
  const user = await getApplicationUser();
  if (user) return user;
  if (env.AUTH_ENABLED === 'true') redirect('/login?returnTo=' + encodeURIComponent(safeAuthReturn(returnTo)));
  redirect('/signin-with-chatgpt?return_to=' + encodeURIComponent(safeAuthReturn(returnTo)));
}
