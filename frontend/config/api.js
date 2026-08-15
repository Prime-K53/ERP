const e = typeof import.meta!=='undefined'?import.meta.env:{};
const SUPABASE_URL = e?.VITE_SUPABASE_URL||'';
const SUPABASE_ANON_KEY = e?.VITE_SUPABASE_ANON_KEY||'';
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL&&SUPABASE_ANON_KEY&&SUPABASE_URL!=='https://placeholder.supabase.co');
const HAS_REMOTE_BACKEND = SUPABASE_CONFIGURED;
// In development, use relative /api (Vite proxy handles forwarding to backend).
// In production, use the configured VITE_API_URL.
const isDev = Boolean(import.meta.env?.DEV);
const apiUrlFromEnv = e?.VITE_API_URL?.trim();
const API_BASE_URL = isDev
  ? '/api'
  : apiUrlFromEnv
    ? `${apiUrlFromEnv.replace(/\/+$/, '')}/api`
    : '/api';

if (!isDev && !apiUrlFromEnv) {
  console.warn(
    '[API] VITE_API_URL is not set. API requests will use relative /api paths. ' +
    'Ensure your deployment (Netlify _redirects, Vercel rewrites, or reverse proxy) ' +
    'forwards /api/* to the backend.'
  );
}
const getUrl = (p='')=>{const r=String(p).trim();if(/^(https?:\/\/|file:|blob:|data:)/i.test(r))return r;if(!SUPABASE_URL)return p;return `${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/${r.replace(/^\//,'')}`};

export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, HAS_REMOTE_BACKEND, API_BASE_URL, getUrl };
