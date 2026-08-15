import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<Props> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{
          background: '#FEFDFB',
          borderRadius: 16,
          width: '100%', maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,.2)',
           border: '1px solid rgba(16,24,40,0.05)',


          animation: 'modalIn .15s ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid rgba(16,24,40,0.05)',
        }}>
          <h2 id="confirm-dialog-title" style={{ fontSize: 16, fontWeight: 700, color: '#23282A', margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 8, color: '#5c6567', display: 'flex' }}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '18px 22px', fontSize: 14, color: '#5c6567', lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid rgba(16,24,40,0.05)' }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              border: '1.4px solid rgba(16,24,40,0.05)', background: '#FFFFFF', color: '#6b7280',
              fontSize: 13, fontWeight: 600, fontFamily: "'Inter', sans-serif",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              border: '1.4px solid transparent',
              background: variant === 'danger'
                ? 'linear-gradient(155deg, #dc2626, #b91c1c)'
                : 'linear-gradient(155deg, #1f8577, #0f544c)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
