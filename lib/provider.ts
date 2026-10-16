import { env } from 'cloudflare:workers';
import { AppError, providerError } from './research';
export const backgroundReady=()=>env.BACKGROUND_WEBHOOK_ENABLED==='true'&&!!env.OPENAI_WEBHOOK_SECRET;
export function config() { return { key: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-5.4-mini' }; }
export async function provider(path: string, payload?: unknown, method?: string) {
  const { key } = config(); if (!key) throw new AppError('Live research is not configured yet. The owner needs to activate the research provider.', 503);
  let response: Response;
  try { response = await fetch(`https://api.openai.com/v1/${path}`, { method: method || (payload ? 'POST' : 'GET'), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(25000) }); }
  catch { throw new AppError('The research provider timed out. Please retry; an in-progress report is still saved.', 503); }
  const value: any = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, value.error?.code);
  return value;
}
