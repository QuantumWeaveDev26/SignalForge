export const productionOrigin = 'https://signalforge-research-nr.brandmintai.chatgpt.site';

export type AuthEnvironment = {
  AUTH_ENABLED?: string;
  AUTH_BASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  AUTH_EMAIL_FROM?: string;
};

export function authOrigin(config: AuthEnvironment) {
  const url = new URL(config.AUTH_BASE_URL || productionOrigin);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('AUTH_BASE_URL must be an origin.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Authentication requires HTTPS.');
  return url.origin;
}

export function authAvailability(config: AuthEnvironment) {
  const ready = config.AUTH_ENABLED === 'true' && !!config.BETTER_AUTH_SECRET && config.BETTER_AUTH_SECRET.length >= 32;
  return {
    ready,
    google: ready && !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET,
    email: ready && !!config.GMAIL_REFRESH_TOKEN && !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET && !!config.AUTH_EMAIL_FROM,
  };
}

export function safeAuthReturn(value: unknown, fallback = '/workspace') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, productionOrigin);
    if (url.origin !== productionOrigin || /^\/(?:api|login|signup|forgot-password|reset-password|signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(url.pathname)) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}

export function requireAuthOrigin(request: Request, config: AuthEnvironment) {
  if (request.headers.get('origin') !== authOrigin(config) || request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('This action must be sent from SignalForge.');
}

export function newWorkspaceOwner(userId: string) { return `auth:${userId}`; }

// Linking adds permission to the original workspace; it never moves records.
// Both workspaces remain available even if concurrent requests create new data.
export const legacyLinkSql = 'INSERT INTO workspace_accounts (user_id,owner,created) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING';

export function previewWorkspaceSelected(cookie: string | null) {
  return (cookie || '').split(';').some(part => part.trim() === 'signalforge.workspace=preview');
}

export function workspaceCookie(origin: string, kind: 'personal'|'preview', clear = false) {
  return `signalforge.workspace=${clear?'':kind}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:604800}${origin.startsWith('https:')?'; Secure':''}`;
}
