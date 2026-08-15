import React from 'react';
import { logger } from '@/services/logger';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

const canRegisterServiceWorker = () => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  if (import.meta.env.VITE_ENABLE_PWA_SW !== 'true') {
    return false;
  }

  if (window.location.protocol === 'file:') {
    return false;
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocalhost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname === '::1'
    || hostname === '[::1]';

  return window.isSecureContext && !isLocalhost;
};

if (canRegisterServiceWorker()) {
  window.addEventListener('load', async () => {
    try {
      const baseUrl = String((import.meta as ImportMeta & { env?: { BASE_URL?: string } })?.env?.BASE_URL || '/').replace(/\/+$/, '');
      const serviceWorkerUrl = `${baseUrl || ''}/sw.js`;
      const scope = `${baseUrl || ''}/`;
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl, { scope });
      console.log('[PWA] SW registered', registration);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) {
          return;
        }
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[PWA] Update available');
          }
        });
      });
    } catch (error: any) {
      logger.error('[PWA] Service worker registration failed', error);
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
