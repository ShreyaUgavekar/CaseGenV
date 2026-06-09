// Central API client — Supabase Edge Functions in prod, Vite proxy in dev

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

// Use Vite's built-in flag — true only when `vite build` was run, not in `vite dev`
const IS_PROD = import.meta.env.PROD;

export function edgeFunctionUrl(name: string): string {
  if (IS_PROD && SUPABASE_URL) return `${SUPABASE_URL}/functions/v1/${name}`;
  return `/dev-proxy/${name}`;
}

export function edgeFunctionHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(IS_PROD && SUPABASE_ANON_KEY ? { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } : {}),
    ...extra,
  };
}

export const isProd = IS_PROD;
