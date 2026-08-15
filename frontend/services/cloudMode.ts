export const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';

export const isSupabaseConfigured = () => {
  const env = import.meta.env;
  return Boolean(
    env.VITE_SUPABASE_URL &&
    env.VITE_SUPABASE_ANON_KEY &&
    env.VITE_SUPABASE_URL !== PLACEHOLDER_SUPABASE_URL
  );
};

export const isCloudOnlyMode = () => isSupabaseConfigured();

export const requireCloudSessionMessage =
  'Prime ERP is configured for cloud-only mode. Sign in to Supabase before accessing company data.';

export const cloudUnavailableMessage =
  'Prime ERP cloud data is unavailable. The operation was not saved locally.';
