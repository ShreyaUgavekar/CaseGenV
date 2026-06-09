// Central API client — Supabase Edge Functions in prod, Vite proxy in dev

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const IS_PROD = !!SUPABASE_URL;

export function edgeFunctionUrl(name: string): string {
  if (IS_PROD) return `${SUPABASE_URL}/functions/v1/${name}`;
  return `/dev-proxy/${name}`;
}

export function edgeFunctionHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(IS_PROD && SUPABASE_ANON_KEY ? { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    ...extra,
  };
}

export const isProd = IS_PROD;
