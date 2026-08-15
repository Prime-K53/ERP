import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isFileProtocol } from '../utils/runtime';

interface PwaInstallContextValue {
  isInstallable: boolean;
  isInstalled: boolean;
  install: () => Promise<void>;
  updateAvailable: boolean;
  applyUpdate: () => void;
  dismissUpdate: () => void;
  isOnline: boolean;
}

const PwaInstallContext = createContext<PwaInstallContextValue>({
  isInstallable: false,
  isInstalled: false,
  install: async () => {},
  updateAvailable: false,
  applyUpdate: () => {},
  dismissUpdate: () => {},
  isOnline: true,
});

export const usePwaInstall = () => useContext(PwaInstallContext);

export const PwaInstallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fileProtocol = isFileProtocol();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(fileProtocol);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateRegistration, setUpdateRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (fileProtocol) {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setUpdateAvailable(false);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true);
                setUpdateRegistration(registration);
              }
            });
          }
        });
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [fileProtocol]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const applyUpdate = useCallback(() => {
    if (updateRegistration?.waiting) {
      updateRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
    setUpdateAvailable(false);
  }, [updateRegistration]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return (
    <PwaInstallContext.Provider
      value={{
        isInstallable: !!deferredPrompt,
        isInstalled,
        install,
        updateAvailable,
        applyUpdate,
        dismissUpdate,
        isOnline,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
};
