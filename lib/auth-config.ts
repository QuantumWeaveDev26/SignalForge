import type { BetterAuthOptions } from 'better-auth';
import { authAvailability, authOrigin, type AuthEnvironment } from './auth-policy.ts';

export type AccountEmail = { to: string; url: string; kind: 'verify' | 'reset' };

export function authOptions(config: AuthEnvironment, send: (mail: AccountEmail) => Promise<void>): BetterAuthOptions {
  const available = authAvailability(config);
  if (!available.ready) throw new Error('SignalForge account authentication is not activated.');
  const origin = authOrigin(config);
  return {
    appName: 'SignalForge', baseURL: origin, basePath: '/api/auth',
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [origin],
    advanced: { cookiePrefix: 'signalforge', useSecureCookies: origin.startsWith('https:'), defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' }, ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false } },
    socialProviders: available.google ? { google: { clientId: config.GOOGLE_CLIENT_ID!, clientSecret: config.GOOGLE_CLIENT_SECRET!, prompt: 'select_account', requireEmailVerification: true } } : {},
    emailAndPassword: {
      enabled: available.email, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user,url}) => send({to:user.email,url,kind:'reset'}),
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: true, expiresIn: 3600,
      sendVerificationEmail: async ({user,url}) => send({to:user.email,url,kind:'verify'}),
    },
    rateLimit: {
      enabled: true, storage: 'database', modelName: 'rateLimit', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 3 }, '/request-password-reset': { window: 300, max: 3 }, '/send-verification-email': { window: 300, max: 3 } },
    },
    logger: { disabled: true },
  };
}
