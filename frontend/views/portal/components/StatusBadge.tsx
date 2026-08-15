import React from 'react';

interface Props {
  status: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string; pulse?: boolean }> = {
  active: { label: 'Active', bg: '#ECFDF5', text: '#059669', dot: '#059669', pulse: true },
  paid: { label: 'Paid', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  confirmed: { label: 'Confirmed', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  complete: { label: 'Complete', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  fulfilled: { label: 'Fulfilled', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  delivered: { label: 'Delivered', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  unpaid: { label: 'Unpaid', bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  pending: { label: 'Pending', bg: '#FFFBEB', text: '#D97706', dot: '#D97706', pulse: true },
  draft: { label: 'Draft', bg: '#F8FAFC', text: '#64748B', dot: '#94A3B8' },
  overdue: { label: 'Overdue', bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626', pulse: true },
  cancelled: { label: 'Cancelled', bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  voided: { label: 'Voided', bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  processing: { label: 'Processing', bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB', pulse: true },
  inprogress: { label: 'In Progress', bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB', pulse: true },
  in_progress: { label: 'In Progress', bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB', pulse: true },
  submitted: { label: 'Submitted', bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB' },
  under_review: { label: 'Under Review', bg: '#FFFBEB', text: '#D97706', dot: '#D97706', pulse: true },
  quotation_ready: { label: 'Quotation Ready', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  ready: { label: 'Ready', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  accepted: { label: 'Accepted', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  converted: { label: 'Converted', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  revision_requested: { label: 'Revision Requested', bg: '#F5F3FF', text: '#7C3AED', dot: '#7C3AED', pulse: true },
  rejected: { label: 'Rejected', bg: '#FEF2F2', text: '#DC2626', dot: '#DC2626' },
  expired: { label: 'Expired', bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
  waiting_for_customer: { label: 'Waiting for Customer', bg: '#F5F3FF', text: '#7C3AED', dot: '#7C3AED', pulse: true },
  approved: { label: 'Approved', bg: '#ECFDF5', text: '#059669', dot: '#059669' },
  shipped: { label: 'Shipped', bg: '#EFF6FF', text: '#2563EB', dot: '#2563EB', pulse: true },
  partially_paid: { label: 'Partially Paid', bg: '#FFFBEB', text: '#D97706', dot: '#D97706' },
};

const StatusBadge: React.FC<Props> = ({ status, size = 'md', showIcon = true }) => {
  const key = status?.toLowerCase().replace(/\s+/g, '') || '';
  const config = statusConfig[key] || { label: status, bg: '#F8FAFC', text: '#475569', dot: '#94A3B8' };
  const isSmall = size === 'sm';

  return (
    <span
      className="inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap transition-all duration-150"
      style={{
        background: config.bg,
        color: config.text,
        fontSize: isSmall ? 10 : 11,
        padding: isSmall ? '2px 8px' : '3px 10px',
        lineHeight: 1.4,
        border: `1px solid ${config.text}20`,
      }}
    >
      <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
        {config.pulse && (
          <span className="absolute inset-0 rounded-full opacity-75 animate-ping" style={{ background: config.dot }} />
        )}
        <span className="relative rounded-full" style={{ background: config.dot, width: isSmall ? 5 : 6, height: isSmall ? 5 : 6 }} />
      </span>
      {config.label}
    </span>
  );
};

export default StatusBadge;
