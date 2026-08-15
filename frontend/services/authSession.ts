import { supabase } from './supabaseClient';

const AUTH_INVALID_EVENT = 'primeerp:auth-invalid';

export const getStoredUserSession = <T extends Record<string, any> = Record<string, any>>(): T | null => {
  const raw = sessionStorage.getItem('nexus_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    sessionStorage.removeItem('nexus_user');
    return null;
  }
};

export const persistUserSession = <T extends Record<string, any>>(user: T | null): T | null => {
  if (!user) {
    sessionStorage.removeItem('nexus_user');
    return null;
  }
  sessionStorage.setItem('nexus_user', JSON.stringify(user));
  return user;
};

export const clearStoredUserSession = () => {
  sessionStorage.removeItem('nexus_user');
};

export const isSessionExpired = (user?: Record<string, any> | null): boolean => {
  const expiry = String(user?.tokenExpiry || user?.expiresAt || '').trim();
  if (!expiry) return false;
  const expiresAt = new Date(expiry).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
};

export const ensureSessionAuthState = () => {
  const SUPABASE_ENABLED = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  if (SUPABASE_ENABLED) {
    // The app stores the active session in nexus_user (set by AuthContext after signIn)
    // and Supabase JS persists it under storageKey 'prime-erp-supabase-auth'.
    // Check nexus_user first as it contains the processed access token.
    const nexusRaw = sessionStorage.getItem('nexus_user');
    if (nexusRaw) {
      try {
        const parsed = JSON.parse(nexusRaw);
        if (parsed?.accessToken) {
          return {
            userId: parsed?.id || null,
            role: parsed?.role || null,
            isSuperAdmin: parsed?.isSuperAdmin === true,
            accessToken: parsed.accessToken,
            refreshToken: parsed?.refreshToken || null,
            expiresAt: parsed?.tokenExpiry || null,
            authMode: 'supabase' as const,
            isAuthenticated: !isSessionExpired(parsed)
          };
        }
      } catch {
        // fall through to supabase-js storage
      }
    }
    // Fallback: read directly from supabase-js localStorage (key = prime-erp-supabase-auth)
    const supabaseKey = 'prime-erp-supabase-auth';
    const sbRaw = localStorage.getItem(supabaseKey);
    if (sbRaw) {
      try {
        const parsed = JSON.parse(sbRaw);
        const session = parsed?.currentSession || parsed;
        if (session?.access_token) {
          return {
            userId: session?.user?.id || null,
            role: session?.user?.user_metadata?.role || null,
            isSuperAdmin: session?.user?.user_metadata?.is_super_admin === true,
            accessToken: session.access_token,
            refreshToken: session?.refresh_token || null,
            expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
            authMode: 'supabase' as const,
            isAuthenticated: Boolean(session?.access_token)
          };
        }
      } catch {
        // fall through
      }
    }
  }

  const stored = getStoredUserSession();
  if (!stored) {
    return {
      userId: null,
      role: null,
      isSuperAdmin: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      authMode: 'anonymous' as const,
      isAuthenticated: false
    };
  }

  return {
    userId: stored.id ? String(stored.id) : null,
    role: stored.role ? String(stored.role) : null,
    isSuperAdmin: stored.isSuperAdmin === true,
    accessToken: stored.accessToken ? String(stored.accessToken) : null,
    refreshToken: stored.refreshToken ? String(stored.refreshToken) : null,
    expiresAt: stored.tokenExpiry ? String(stored.tokenExpiry) : null,
    authMode: (SUPABASE_ENABLED ? 'supabase' : 'anonymous') as 'supabase' | 'anonymous',
    isAuthenticated: !isSessionExpired(stored)
  };
};

export const refreshLocalAccessToken = () => {
  return null;
};

export const dispatchAuthInvalid = (reason = 'Your session is not authorized. Please sign in again.') => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT, {
    detail: { reason, at: new Date().toISOString() }
  }));
};

export const getAuthInvalidEventName = () => AUTH_INVALID_EVENT;
