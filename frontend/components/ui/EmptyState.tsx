import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {icon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: '14px',
            backgroundColor: 'rgba(99,102,241,0.1)',
            color: '#6366f1',
            marginBottom: 16,
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: '#0f172a',
          lineHeight: 1.4,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 13,
            color: '#64748b',
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: 20,
            display: 'inline-flex',
            alignItems: 'center',
            height: 36,
            padding: '0 16px',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'Inter', system-ui, sans-serif",
            color: '#ffffff',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
