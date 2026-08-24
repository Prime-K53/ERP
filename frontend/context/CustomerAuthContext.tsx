import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { portalApi, getPortalSession, savePortalSession, clearPortalSession } from '../services/portalApiClient';
import { loginWithApi } from '../services/authApiClient';

interface PortalUser {
  id: string;
  customer_id: string;
  email: string;
  full_name?: string;
  phone?: string;
}

interface CustomerAuthContextType {
  user: PortalUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  loginWithApi: (email: string, password: string, twoFactorCode?: string) => Promise<{ success: boolean; message?: string; requiresTwoFactor?: boolean; pendingToken?: string }>;
  activate: (customerId: string, code: string, password: string) => Promise<'SUCCESS' | 'INVALID' | 'ERROR'>;
  logout: () => void;
  refreshSession: () => Promise<boolean>;
}

const CustomerAuthContext = createContext<CustomerAuthContextType | null>(null);

export function useCustomerAuth(): CustomerAuthContextType {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthenticated = user !== null;

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearRefreshTimer();
    const session = getPortalSession();
    if (session?.refresh_token) {
      portalApi.post('/auth/logout', { refresh_token: session.refresh_token }).catch(() => {});
    }
    clearPortalSession();
    setUser(null);
  }, [clearRefreshTimer]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const session = getPortalSession();
      if (!session?.refresh_token) {
        logout();
        return false;
      }
      const result = await portalApi.post<{ access_token: string; refresh_token: string; expires_in: string }>('/auth/refresh', {
        refresh_token: session.refresh_token,
      });
      savePortalSession({
        ...session,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_in: result.expires_in,
      });
      setUser(getPortalSession()?.user ?? null);
      scheduleTokenRefresh(25 * 60 * 1000);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  const scheduleTokenRefresh = useCallback((delayMs: number) => {
    clearRefreshTimer();
    if (delayMs > 0) {
      refreshTimer.current = setTimeout(() => {
        refreshSession();
      }, delayMs);
    }
  }, [clearRefreshTimer, refreshSession]);

  useEffect(() => {
    const session = getPortalSession();
    if (session?.user && session?.access_token) {
      setUser(session.user);
      scheduleTokenRefresh(25 * 60 * 1000);
    }
    setLoading(false);

    return () => {
      clearRefreshTimer();
    };
  }, [clearRefreshTimer, scheduleTokenRefresh]);

  const loginWithApiCallback = useCallback(async (email: string, password: string, twoFactorCode?: string): Promise<{ success: boolean; message?: string; requiresTwoFactor?: boolean; pendingToken?: string }> => {
    try {
      const result = await loginWithApi({ email, password, portal: 'customer', two_factor_code: twoFactorCode });
      
      if (result.requires_two_factor) {
        return { success: false, requiresTwoFactor: true, pendingToken: result.pending_token };
      }
      
      savePortalSession({
        access_token: result.access_token || '',
        refresh_token: result.refresh_token || '',
        expires_in: result.expires_in || '30m',
        user: result.user as PortalUser,
      });
      setUser(result.user as PortalUser);
      scheduleTokenRefresh(25 * 60 * 1000);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.body?.message || err?.message || 'Login failed. Please try again.' };
    }
  }, [scheduleTokenRefresh]);

  const activate = useCallback(async (customerId: string, code: string, password: string): Promise<'SUCCESS' | 'INVALID' | 'ERROR'> => {
    try {
      const result = await portalApi.post<{
        message: string;
        user: PortalUser;
        access_token: string;
        refresh_token: string;
        expires_in: string;
      }>('/auth/activate', { customer_id: customerId, code, password });

      savePortalSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_in: result.expires_in,
        user: result.user,
      });

      setUser(result.user);
      scheduleTokenRefresh(25 * 60 * 1000);
      return 'SUCCESS';
    } catch (err: any) {
      if (err?.status === 400 || err?.status === 401 || err?.status === 409) return 'INVALID';
      return 'ERROR';
    }
  }, [scheduleTokenRefresh]);

  return (
    <CustomerAuthContext.Provider value={{ user, isAuthenticated, loading, loginWithApi: loginWithApiCallback, activate, logout, refreshSession }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}
