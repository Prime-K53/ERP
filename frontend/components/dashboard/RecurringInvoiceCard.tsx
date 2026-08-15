/**
 * Recurring Invoice Card component
 * Shows ONE subscription at a time with Next/Prev navigation
 * Clean, minimal design with proper information hierarchy
 */
import React, { memo, useMemo, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { SEMANTIC_COLORS, SHADOWS, RADIUS } from '../../styles/designTokens';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
export interface RecurringInvoice {
  id: string;
  customerName: string;
  amount: number;
  description: string;
  nextBillingDate: Date | string;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  status: 'active' | 'paused' | 'cancelled';
}

export interface RecurringInvoiceCardProps {
  invoices: RecurringInvoice[];
  currency?: string;
  onNavigate?: (index: number) => void;
}

// ============================================================
// STABLE STYLE OBJECTS - Defined outside component
// ============================================================
const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: RADIUS.lg,
  boxShadow: SHADOWS.card,
  padding: '24px',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '20px',
};

const HEADER_TITLE_STYLE: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  letterSpacing: '-0.01em',
};

const CONTENT_STYLE: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '12px',
  padding: '16px',
  backgroundColor: '#F8FAFC',
  borderRadius: RADIUS.md,
};

const CUSTOMER_STYLE: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  letterSpacing: '-0.01em',
};

const DESCRIPTION_STYLE: React.CSSProperties = {
  fontSize: '13px',
  color: SEMANTIC_COLORS.textSecondary,
  margin: 0,
  lineHeight: 1.5,
};

const AMOUNT_STYLE: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 700,
  color: SEMANTIC_COLORS.textPrimary,
  margin: 0,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
};

const DETAIL_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 0',
  borderTop: `1px solid ${SEMANTIC_COLORS.borderLighter}`,
};

const DETAIL_LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: SEMANTIC_COLORS.textMuted,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const DETAIL_VALUE_STYLE: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: SEMANTIC_COLORS.textPrimary,
};

const NAVIGATION_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: `1px solid ${SEMANTIC_COLORS.borderLighter}`,
};

const NAV_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  borderRadius: RADIUS.md,
  border: `1px solid ${SEMANTIC_COLORS.borderLight}`,
  backgroundColor: '#FFFFFF',
  cursor: 'pointer',
  color: SEMANTIC_COLORS.textSecondary,
  transition: 'all 0.15s ease',
};

const NAV_BUTTON_HOVER_STYLE: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderColor: '#CBD5E1',
};

const PAGINATION_STYLE: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  color: SEMANTIC_COLORS.textSecondary,
};

const STATUS_BADGE_STYLE: (status: string) => React.CSSProperties = (status: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: '#DCFCE7', text: '#15803D' },
    paused: { bg: '#FEF3C7', text: '#92400E' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  };
  const { bg, text } = colors[status] || colors.active;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: RADIUS.full,
    backgroundColor: bg,
    color: text,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
};

const AVATAR_STYLE: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: RADIUS.full,
  backgroundColor: '#EEF2FF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  fontWeight: 600,
  color: '#4F46E5',
};

const EMPTY_STATE_STYLE: React.CSSProperties = {
  padding: '40px 16px',
  textAlign: 'center',
  color: SEMANTIC_COLORS.textMuted,
};

// ============================================================
// HELPER FUNCTIONS - Stable references
// ============================================================
const formatCurrency = (amount: number, currency: string): string => {
  return `${currency}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// ============================================================
// MAIN COMPONENT - Memoized for performance
// ============================================================
const RecurringInvoiceCardComponent: React.FC<RecurringInvoiceCardProps> = memo(({
  invoices,
  currency = '',
  onNavigate,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Memoize current invoice
  const currentInvoice = useMemo(() => {
    if (!invoices || invoices.length === 0) return null;
    return invoices[currentIndex % invoices.length];
  }, [invoices, currentIndex]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = prev <= 0 ? (invoices?.length || 1) - 1 : prev - 1;
      onNavigate?.(newIndex);
      return newIndex;
    });
  }, [invoices?.length, onNavigate]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = prev >= (invoices?.length || 1) - 1 ? 0 : prev + 1;
      onNavigate?.(newIndex);
      return newIndex;
    });
  }, [invoices?.length, onNavigate]);

  // Empty state
  if (!invoices || invoices.length === 0) {
    return (
      <div style={CARD_STYLE}>
        <div style={EMPTY_STATE_STYLE}>
          <RefreshCw size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 500 }}>
            No recurring invoices
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: SEMANTIC_COLORS.textMuted }}>
            Recurring subscriptions will appear here
          </p>
        </div>
      </div>
    );
  }

  if (!currentInvoice) return null;

  return (
    <div style={CARD_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <h3 style={HEADER_TITLE_STYLE}>Active Subscriptions</h3>
        <span style={STATUS_BADGE_STYLE(currentInvoice.status)}>
          {currentInvoice.status}
        </span>
      </div>

      {/* Main Content */}
      <div style={CONTENT_STYLE}>
        {/* Customer Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={AVATAR_STYLE}>
            {getInitials(currentInvoice.customerName)}
          </div>
          <div>
            <p style={CUSTOMER_STYLE}>{currentInvoice.customerName}</p>
            <p style={DESCRIPTION_STYLE}>{currentInvoice.description || 'No description'}</p>
          </div>
        </div>

        {/* Amount */}
        <p style={AMOUNT_STYLE}>
          {formatCurrency(currentInvoice.amount, currency)}
          <span style={{ fontSize: '14px', fontWeight: 400, color: SEMANTIC_COLORS.textMuted }}>
            /{currentInvoice.frequency === 'monthly' ? 'mo' : currentInvoice.frequency === 'yearly' ? 'yr' : currentInvoice.frequency}
          </span>
        </p>
      </div>

      {/* Details */}
      <div style={DETAIL_ROW_STYLE}>
        <span style={DETAIL_LABEL_STYLE}>Frequency</span>
        <span style={DETAIL_VALUE_STYLE}>{capitalizeFirst(currentInvoice.frequency)}</span>
      </div>
      <div style={{ ...DETAIL_ROW_STYLE, borderTop: 'none' }}>
        <span style={DETAIL_LABEL_STYLE}>Next billing</span>
        <span style={DETAIL_VALUE_STYLE}>{formatDate(currentInvoice.nextBillingDate)}</span>
      </div>

      {/* Navigation */}
      {invoices.length > 1 && (
        <div style={NAVIGATION_STYLE}>
          <button
            type="button"
            onClick={handlePrev}
            style={NAV_BUTTON_STYLE}
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, NAV_BUTTON_HOVER_STYLE);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = SEMANTIC_COLORS.borderLight;
            }}
            aria-label="Previous invoice"
          >
            <ChevronLeft size={18} />
          </button>
          <span style={PAGINATION_STYLE}>
            {currentIndex + 1} of {invoices.length}
          </span>
          <button
            type="button"
            onClick={handleNext}
            style={NAV_BUTTON_STYLE}
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, NAV_BUTTON_HOVER_STYLE);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = SEMANTIC_COLORS.borderLight;
            }}
            aria-label="Next invoice"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
});

RecurringInvoiceCardComponent.displayName = 'RecurringInvoiceCard';

export default RecurringInvoiceCardComponent;