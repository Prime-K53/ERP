import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  message: string;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

const ErrorBanner: React.FC<Props> = ({ message, onDismiss, style }) => {
  return (
    <div style={{
      background: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#b91c1c',
      borderRadius: 12,
      padding: '12px 16px',
      fontSize: 13,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      ...style,
    }}>
      <AlertTriangle size={18} style={{ color: '#b91c1c', flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 2, borderRadius: 6, color: '#b91c1c',
            display: 'flex', alignItems: 'center', flexShrink: 0,
          }}
          aria-label="Dismiss error"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default ErrorBanner;
