import React from 'react';

export const portalTheme = {
  teal: {
    50: '#EFF3F9', 100: '#D6E1F0', 200: '#ADC3E0', 300: '#7A9CCB',
    400: '#4A76B5', 500: '#0F2C59', 600: '#0D254D', 700: '#0A1F42',
    800: '#071836', 900: '#04102B'
  },
  amber: {
    100: '#FEF3C7', 300: '#FCD34D', 500: '#D97706', 600: '#B45309'
  },
  paper: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#0F2C59',
  inkSoft: '#475569',
  inkMuted: '#94A3B8',
  hairline: 'rgba(15,23,42,0.04)',
  border: '#E2E8F0',
  background: '#F8FAFC',
  backgroundGradient: 'linear-gradient(180deg, #F8FAFC, #F1F5F9)',
  danger: '#DC2626',
  success: '#059669',
  info: '#2563EB',
} as const;

export const portalShadows = {
  sm: '0 1px 2px rgba(15,23,42,0.04)',
  md: '0 4px 6px -1px rgba(15,23,42,0.07), 0 2px 4px -2px rgba(15,23,42,0.05)',
  lg: '0 10px 15px -3px rgba(15,23,42,0.08), 0 4px 6px -4px rgba(15,23,42,0.04)',
  teal: '0 4px 10px -3px rgba(15,44,89,0.5)',
} as const;

export const portalRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const REQUEST_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: 'Draft', color: '#64748B', bg: '#F1F5F9', dot: '#64748B' },
  submitted: { label: 'Submitted', color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  assigned: { label: 'Assigned', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  under_review: { label: 'Under Review', color: '#D97706', bg: '#FFFBEB', dot: '#D97706' },
  waiting_for_customer: { label: 'Waiting for You', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
  ready_for_conversion: { label: 'Ready for Conversion', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  converted: { label: 'Converted', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
  cancelled: { label: 'Cancelled', color: '#64748B', bg: '#F1F5F9', dot: '#64748B' },
};

export const QUOTATION_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ready: { label: 'Ready', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  accepted: { label: 'Accepted', color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  rejected: { label: 'Rejected', color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
  revision_requested: { label: 'Revision Requested', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
  converted: { label: 'Converted', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
};

export const ORDER_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: 'Draft', color: '#64748B', bg: '#F1F5F9', dot: '#64748B' },
  confirmed: { label: 'Confirmed', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  processing: { label: 'Processing', color: '#D97706', bg: '#FFFBEB', dot: '#D97706' },
  pending: { label: 'Pending', color: '#D97706', bg: '#FFFBEB', dot: '#D97706' },
  delivered: { label: 'Delivered', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  fulfilled: { label: 'Fulfilled', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  shipped: { label: 'Shipped', color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
};

export const SHIPMENT_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ...ORDER_STATUS_META,
  in_transit: { label: 'In Transit', color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  out_for_delivery: { label: 'Out for Delivery', color: '#7C3AED', bg: '#F5F3FF', dot: '#7C3AED' },
};

export const REFERRAL_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  converted: { label: 'Converted', color: '#2563EB', bg: '#EFF6FF', dot: '#2563EB' },
  expired: { label: 'Expired', color: '#64748B', bg: '#F1F5F9', dot: '#64748B' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
};

export const REWARD_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: 'Pending', color: '#D97706', bg: '#FFFBEB', dot: '#D97706' },
  approved: { label: 'Approved', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  paid: { label: 'Paid', color: '#059669', bg: '#ECFDF5', dot: '#059669' },
  cancelled: { label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2', dot: '#DC2626' },
};

export const FRIENDLY_STATUS_MAP: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assigned: 'Assigned',
  under_review: 'Under Review',
  waiting_for_customer: 'Waiting for You',
  ready_for_conversion: 'Ready for Conversion',
  converted: 'Converted',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  ready: 'Ready',
  accepted: 'Accepted',
  revision_requested: 'Revision Requested',
  confirmed: 'Confirmed',
  processing: 'Processing',
  pending: 'Pending',
  delivered: 'Delivered',
  fulfilled: 'Fulfilled',
  shipped: 'Shipped',
  active: 'Active',
  expired: 'Expired',
  approved: 'Approved',
  paid: 'Paid',
};

export const PAGE_TITLES: Record<string, string> = {
  '/portal/dashboard': 'Dashboard',
  '/portal/requests': 'Requests',
  '/portal/requests/:id': 'Request Details',
  '/portal/orders': 'Product Orders',
  '/portal/orders/:id': 'Order Details',
  '/portal/deliveries': 'Deliveries & Tracking',
  '/portal/deliveries/:id': 'Delivery Details',
  '/portal/quotations': 'Quotations',
  '/portal/quotations/:id': 'Quotation Details',
  '/portal/invoices': 'Invoices',
  '/portal/invoices/:id': 'Invoice Details',
  '/portal/payments': 'Payments',
  '/portal/payments/:id': 'Payment Details',
  '/portal/account-statements': 'Account Statements',
  '/portal/wallet': 'Wallet',
  '/portal/referrals': 'Referrals',
  '/portal/support': 'Support',
  '/portal/profile': 'Profile',
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const formatK = (value: number | string | undefined | null, decimals = 2) => {
  const num = typeof value === 'number' ? value : Number(value || 0);
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = Number(intPart).toLocaleString('en-US');
  return `K ${formattedInt}.${decPart}`;
};
