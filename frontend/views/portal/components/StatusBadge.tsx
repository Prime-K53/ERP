import React from 'react';

interface Props {
  status: string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string; icon?: React.ReactNode; pulse?: boolean }> = {
  active: { label: 'Active', bg: '#ecfdf5', text: '#059669', dot: '#059669', pulse: true },
  paid: { label: 'Paid', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  confirmed: { label: 'Confirmed', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  complete: { label: 'Complete', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  fulfilled: { label: 'Fulfilled', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  delivered: { label: 'Delivered', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  unpaid: { label: 'Unpaid', bg: '#fef2f2', text: '#b5493f', dot: '#b5493f' },
  pending: { label: 'Pending', bg: '#fffbeb', text: '#b45309', dot: '#d99a3f', pulse: true },
  draft: { label: 'Draft', bg: '#f8fafc', text: '#475569', dot: '#94a3b8' },
  overdue: { label: 'Overdue', bg: '#fef2f2', text: '#b5493f', dot: '#b5493f', pulse: true },
  cancelled: { label: 'Cancelled', bg: '#fef2f2', text: '#b5493f', dot: '#b5493f' },
  voided: { label: 'Voided', bg: '#fef2f2', text: '#b5493f', dot: '#b5493f' },
  processing: { label: 'Processing', bg: '#eff6ff', text: '#2563eb', dot: '#2563eb', pulse: true },
  inprogress: { label: 'In Progress', bg: '#eff6ff', text: '#2563eb', dot: '#2563eb', pulse: true },
  in_progress: { label: 'In Progress', bg: '#eff6ff', text: '#2563eb', dot: '#2563eb', pulse: true },
  submitted: { label: 'Submitted', bg: '#eff6ff', text: '#2563eb', dot: '#2563eb' },
  under_review: { label: 'Under Review', bg: '#fffbeb', text: '#b45309', dot: '#d99a3f', pulse: true },
  quotation_ready: { label: 'Quotation Ready', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  ready: { label: 'Ready', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  accepted: { label: 'Accepted', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  converted: { label: 'Converted', bg: '#eef7f6', text: '#1f8577', dot: '#1f8577' },
  revision_requested: { label: 'Revision Requested', bg: '#f5f3ff', text: '#7c3aed', dot: '#7c3aed', pulse: true },
  rejected: { label: 'Rejected', bg: '#fef2f2', text: '#b5493f', dot: '#b5493f' },
  expired: { label: 'Expired', bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
  waiting_for_customer: { label: 'Waiting for Customer', bg: '#f5f3ff', text: '#7c3aed', dot: '#7c3aed', pulse: true },
  approved: { label: 'Approved', bg: '#ecfdf5', text: '#059669', dot: '#059669' },
  shipped: { label: 'Shipped', bg: '#eff6ff', text: '#2563eb', dot: '#2563eb', pulse: true },
};

const StatusBadge: React.FC<Props> = ({ status, size = 'md', showIcon = true }) => {
  const key = status?.toLowerCase().replace(/\s+/g, '') || '';
  const config = statusConfig[key] || { label: status, bg: '#f8fafc', text: '#475569', dot: '#94a3b8' };
  const isSmall = size === 'sm';

  return (
    <span
      className="inline-flex items-center gap-1.5 font-bold rounded-full whitespace-nowrap shadow-2xs transition-all duration-150"
      style={{
        background: config.bg,
        color: config.text,
        fontSize: isSmall ? 10 : 11,
        padding: isSmall ? '2px 8px' : '3.5px 11px',
        lineHeight: 1.4,
        border: `1px solid ${config.text}30`,
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
