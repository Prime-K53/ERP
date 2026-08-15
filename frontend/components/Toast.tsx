import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, XCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type ToastLevel = 'success' | 'error' | 'info';
type ToastMessage = {
  type: ToastLevel;
  message: string;
};

const TOAST_EVENT = 'prime-erp-toast';

const emitToast = (type: ToastLevel, message: string) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, { detail: { type, message } }));
  }
};

export const toast = {
  success: (message: string) => emitToast('success', message),
  error: (message: string) => emitToast('error', message),
  info: (message: string) => emitToast('info', message),
};

const Toast: React.FC = () => {
  const { notification, clearNotification } = useAuth();
  const [eventNotification, setEventNotification] = useState<ToastMessage | null>(null);

  useEffect(() => {
    const onToastEvent = (event: Event) => {
      const custom = event as CustomEvent<ToastMessage>;
      if (custom.detail?.message) {
        setEventNotification(custom.detail);
      }
    };

    window.addEventListener(TOAST_EVENT, onToastEvent as EventListener);
    return () => window.removeEventListener(TOAST_EVENT, onToastEvent as EventListener);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        clearNotification();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification, clearNotification]);

  useEffect(() => {
    if (eventNotification) {
      const timer = setTimeout(() => {
        setEventNotification(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [eventNotification]);

  const activeNotification = eventNotification || notification;
  if (!activeNotification) return null;

  const getIcon = () => {
    switch (activeNotification.type) {
      case 'success': return <CheckCircle size={20} className="text-emerald-500" />;
      case 'error': return <XCircle size={20} className="text-red-500" />;
      case 'info': return <AlertCircle size={20} className="text-blue-500" />;
      default: return <AlertCircle size={20} className="text-slate-500" />;
    }
  };

  const getBorderColor = () => {
    switch (activeNotification.type) {
      case 'success': return 'border-emerald-500';
      case 'error': return 'border-red-500';
      case 'info': return 'border-blue-500';
      default: return 'border-slate-500';
    }
  };

  const clearActiveNotification = () => {
    if (eventNotification) {
      setEventNotification(null);
      return;
    }
    clearNotification();
  };

  return (
    <div className={`fixed bottom-8 right-8 z-[100] bg-white border-l-4 ${getBorderColor()} shadow-premium rounded-xl p-5 flex items-start gap-4 min-w-[340px] animate-toast-in`}>
      <div className="mt-0.5 bg-slate-50 p-2 rounded-lg">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <h4 className="font-black text-slate-900 text-xs uppercase tracking-widest mb-1">{activeNotification.type}</h4>
        <p className="text-sm text-slate-600 font-medium leading-relaxed">{activeNotification.message}</p>
      </div>
      <button 
        onClick={clearActiveNotification}
        className="p-1 hover:bg-slate-100 rounded-full text-slate-300 hover:text-slate-500 transition-colors"
        title="Dismiss"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
