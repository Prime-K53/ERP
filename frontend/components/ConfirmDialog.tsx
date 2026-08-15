import React from 'react';
import { AlertTriangle, HelpCircle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useKeyboardContext, trapFocus } from '../core/keyboard';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from './Dialog';

export type ConfirmDialogType = 'warning' | 'danger' | 'info' | 'success' | 'question';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
  onCancel?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmDialogType;
  loading?: boolean;
  showCancel?: boolean;
}

const typeConfig = {
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700',
  },
  danger: {
    icon: XCircle,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700',
  },
  info: {
    icon: Info,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700',
  },
  success: {
    icon: CheckCircle,
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    confirmBtn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  question: {
    icon: HelpCircle,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700',
  }
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'question',
  loading = false,
  showCancel = true
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const { registerShortcut } = useKeyboardContext();

  React.useEffect(() => {
    if (!open) return;
    const unregister = registerShortcut({
      id: `confirm-escape-${Date.now()}`,
      key: 'Escape',
      handler: () => {
        onCancel?.();
        onOpenChange?.(false);
      },
      priority: 50,
      description: 'Close confirm dialog',
    });
    const container = dialogRef.current;
    if (container) {
      const release = trapFocus(container);
      return () => {
        unregister();
        release();
      };
    }
    return unregister;
  }, [open]);

  if (!open) return null;

  const config = typeConfig[type];
  const Icon = config.icon;

  const handleConfirm = () => {
    onConfirm();
    onOpenChange?.(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange?.(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div ref={dialogRef} className="w-full max-w-md animate-in zoom-in-95 duration-200" role="alertdialog" aria-modal="true" aria-label={title}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex items-center justify-between py-4 px-6">
            <DialogTitle>{title}</DialogTitle>
            <button
              onClick={handleCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors text-xl font-bold"
              type="button"
              title="Close"
              aria-label="Close"
            >
              ✕
            </button>
          </DialogHeader>

          <div className="px-6 py-5">
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center`}>
                <Icon size={20} className={config.iconColor} />
              </div>
              <p className="text-sm text-slate-600 leading-relaxed flex-1">
                {message}
              </p>
            </div>
          </div>

          <DialogFooter>
            {showCancel && (
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`px-5 py-2 text-sm font-medium text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${config.confirmBtn}`}
              type="button"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {confirmText}
            </button>
          </DialogFooter>
        </DialogContent>
      </div>
    </div>
  );
};

// Hook for easy usage with async confirmations
export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = React.useState<{
    open: boolean;
    title: string;
    message: string;
    type: ConfirmDialogType;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    showCancel?: boolean;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    title: '',
    message: '',
    type: 'question',
    resolve: null
  });

  const confirm = (options: {
    title: string;
    message: string;
    type?: ConfirmDialogType;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        open: true,
        title: options.title,
        message: options.message,
        type: options.type || 'question',
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        showCancel: options.showCancel,
        resolve
      });
    });
  };

  const handleConfirm = () => {
    dialogState.resolve?.(true);
    setDialogState(prev => ({ ...prev, open: false, resolve: null }));
  };

  const handleCancel = () => {
    dialogState.resolve?.(false);
    setDialogState(prev => ({ ...prev, open: false, resolve: null }));
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      open={dialogState.open}
      onOpenChange={(open) => !open && handleCancel()}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      title={dialogState.title}
      message={dialogState.message}
      type={dialogState.type}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      loading={dialogState.loading}
      showCancel={dialogState.showCancel}
    />
  );

  return { confirm, ConfirmDialogComponent };
};

export default ConfirmDialog;