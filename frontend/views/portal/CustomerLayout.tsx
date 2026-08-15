import React, { useState, useEffect, useCallback, Component, ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCustomerAuth } from '../../context/CustomerAuthContext';
import { portalLifecycle } from '../../services/portalApiClient';
import PortalSidebar from './components/PortalSidebar';
import { ToastProvider } from './components/Toast';
import CommandPalette from './components/CommandPalette';
import MobileBottomNav from './components/MobileBottomNav';
import { ThemeProvider } from './context/ThemeContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PortalErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  props: { children: ReactNode };
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[PortalErrorBoundary] Caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.state = { hasError: false, error: null };
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, margin: '0 auto 10px', borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={24} style={{ color: '#DC2626' }} />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0F2C59', margin: '0 0 6px' }}>Something went wrong</h2>
            <p style={{ fontSize: 12.5, color: '#475569', margin: '0 0 16px', lineHeight: 1.4 }}>An unexpected error occurred.</p>
            <button onClick={this.handleRetry} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', background: '#0F2C59', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={12} /> Try Again
            </button>
            {this.state.error && (
              <details style={{ marginTop: 20, textAlign: 'left' }}>
                <summary style={{ fontSize: 11, color: '#94A3B8', cursor: 'pointer' }}>Error details</summary>
                <pre style={{
                  marginTop: 8, padding: 12, background: '#F8FAFC', borderRadius: 10,
                  fontSize: 11, color: '#94A3B8', overflow: 'auto', maxHeight: 180,
                }}>
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const pageTitles: Record<string, string> = {
  '/portal/dashboard': 'Dashboard',
  '/portal/requests': 'Requests',
  '/portal/orders': 'Product Orders',
  '/portal/quotations': 'Quotations',
  '/portal/invoices': 'Invoices',
  '/portal/payments': 'Receipt',
  '/portal/payment-options': 'Payment Options',
  '/portal/referrals': 'Referrals',
  '/portal/wallet': 'Wallet',
  '/portal/shipments': 'Deliveries & Tracking',
  '/portal/deliveries': 'Deliveries & Tracking',
  '/portal/support': 'Support',
  '/portal/profile': 'Profile',
};

const SF = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const CustomerLayout: React.FC = () => {
  const { isAuthenticated, loading } = useCustomerAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const currentTitle = pageTitles[location.pathname] || 'Customer Portal';

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Tab identity: the portal is PrimePORTAL, never "Prime ERP System".
  useEffect(() => {
    document.title = currentTitle && currentTitle !== 'Customer Portal'
      ? `PrimePORTAL · ${currentTitle}`
      : 'PrimePORTAL';
  }, [currentTitle]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleToggle = () => setSidebarOpen((v) => !v);
    window.addEventListener('toggle-portal-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-portal-sidebar', handleToggle);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '2.5px solid #E2E8F0', borderTopColor: '#0F2C59', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/portal/login" replace />;
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <div style={{
          minHeight: '100vh', background: '#F8FAFC',
          fontFamily: SF, color: '#1E293B',
          position: 'relative', overflow: 'hidden',
        }}>
          {sidebarOpen && (
            <div
              onClick={closeSidebar}
              style={{
                position: 'fixed', inset: 0, zIndex: 40,
                background: 'rgba(16,27,61,0.4)',
              }}
            />
          )}
          <PortalSidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} moduleName={location.pathname === '/portal/dashboard' ? undefined : currentTitle} />
          <main
            id="main-content"
            style={{
              // NOTE: no z-index here on purpose. Giving <main> a z-index would
              // create a stacking context that traps module modals (z-index 90+)
              // BELOW the fixed MobileBottomNav (z-index 50) — hiding modal
              // footer buttons behind the nav bar.
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              overflowX: 'auto', overflowY: 'auto',
            }}
          >
            <div className="portal-module" style={{ padding: '10px 12px 16px' }}>
              <PortalErrorBoundary>
                <Outlet />
              </PortalErrorBoundary>
            </div>
          </main>
          <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
          <MobileBottomNav />
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default CustomerLayout;
