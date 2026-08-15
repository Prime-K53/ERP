import React, { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

interface Props {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<Props> = ({ children }) => {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const removeToast = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const addToast = (type: ToastType, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => removeToast(id), 4000);
  };

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const iconMap = {
    success: <CheckCircle2 size={18} color="#059669" />,
    error: <XCircle size={18} color="#dc2626" />,
    info: <Info size={18} color="#2563eb" />,
    warning: <AlertTriangle size={18} color="#d99a3f" />,
  };

  const bgMap = {
    success: '#f0fdfa',
    error: '#fef2f2',
    info: '#eff6ff',
    warning: '#fffbeb',
  };

  const borderMap = {
    success: '#bbf7d0',
    error: '#fecaca',
    info: '#bfdbfe',
    warning: '#fde68a',
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 80,
        display: 'flex', flexDirection: 'column', gap: 8,
        maxWidth: 380, width: 'calc(100% - 40px)',
      }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              background: bgMap[toast.type],
              border: `1px solid ${borderMap[toast.type]}`,
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              boxShadow: '0 10px 30px rgba(0,0,0,.12)',
              animation: 'toastIn .2s ease',
              fontSize: 13,
              color: '#23282A',
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1 }}>{iconMap[toast.type]}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 2, borderRadius: 6, color: '#5c6567',
                display: 'flex', flexShrink: 0,
              }}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
