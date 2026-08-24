import React from 'react';

export const portalTheme = {
  teal: {
    50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
    400: '#4ed3c7', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
    800: '#0b3e39', 900: '#082e2a'
  },
  amber: {
    100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b'
  },
  paper: '#FFFFFF',
  surface: '#FFFFFF',
  ink: '#0b3e39',
  inkSoft: '#6b7280',
  inkMuted: '#94a3b8',
  hairline: 'rgba(16,24,40,0.05)',
  border: 'rgba(16,24,40,0.06)',
  background: '#f8fafc',
  backgroundGradient: 'linear-gradient(180deg, #f8fafc, #f1f5f9)',
  danger: '#b5493f',
  success: '#059669',
  info: '#2563eb',
} as const;

export const portalShadows = {
  sm: '0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 12px -4px rgba(15,84,76,.4)',
  lg: '0 20px 60px rgba(0,0,0,.2)',
  teal: '0 4px 10px -3px rgba(15,84,76,.6)',
} as const;

export const portalRadius = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 16,
  full: 999,
} as const;

export const REQUEST_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9', dot: '#64748b' },
  submitted: { label: 'Submitted', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  assigned: { label: 'Assigned', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
  under_review: { label: 'Under Review', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  waiting_for_customer: { label: 'Waiting for You', color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
  ready_for_conversion: { label: 'Ready for Conversion', color: '#047857', bg: '#ecfdf5', dot: '#059669' },
  converted: { label: 'Converted', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
  rejected: { label: 'Rejected', color: '#b91c1c', bg: '#fef2f2', dot: '#dc2626' },
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#f1f5f9', dot: '#64748b' },
};

export const QUOTATION_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ready: { label: 'Ready', color: '#047857', bg: '#ecfdf5', dot: '#059669' },
  accepted: { label: 'Accepted', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  rejected: { label: 'Rejected', color: '#b91c1c', bg: '#fef2f2', dot: '#dc2626' },
  revision_requested: { label: 'Revision Requested', color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
  converted: { label: 'Converted', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
};

export const ORDER_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  draft: { label: 'Draft', color: '#64748b', bg: '#f1f5f9', dot: '#64748b' },
  confirmed: { label: 'Confirmed', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
  processing: { label: 'Processing', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  pending: { label: 'Pending', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  delivered: { label: 'Delivered', color: '#047857', bg: '#ecfdf5', dot: '#059669' },
  fulfilled: { label: 'Fulfilled', color: '#047857', bg: '#ecfdf5', dot: '#059669' },
  shipped: { label: 'Shipped', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2', dot: '#dc2626' },
};

export const SHIPMENT_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  ...ORDER_STATUS_META,
  in_transit: { label: 'In Transit', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  out_for_delivery: { label: 'Out for Delivery', color: '#7c3aed', bg: '#f5f3ff', dot: '#8b5cf6' },
};

export const REFERRAL_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Active', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
  converted: { label: 'Converted', color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  expired: { label: 'Expired', color: '#64748b', bg: '#f1f5f9', dot: '#64748b' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2', dot: '#dc2626' },
};

export const REWARD_STATUS_META: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending: { label: 'Pending', color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  approved: { label: 'Approved', color: '#0f766e', bg: '#f0fdfa', dot: '#0f766e' },
  paid: { label: 'Paid', color: '#047857', bg: '#ecfdf5', dot: '#059669' },
  cancelled: { label: 'Cancelled', color: '#b91c1c', bg: '#fef2f2', dot: '#dc2626' },
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
  '/portal/orders': 'Orders',
  '/portal/orders/:id': 'Order Details',
  '/portal/shipments': 'Shipments & Tracking',
  '/portal/shipments/:id': 'Shipment Details',
  '/portal/quotations': 'Quotations',
  '/portal/quotations/:id': 'Quotation Details',
  '/portal/invoices': 'Invoices',
  '/portal/invoices/:id': 'Invoice Details',
  '/portal/payments': 'Payments',
  '/portal/payments/:id': 'Payment Details',
   '/portal/statements': 'Statements',
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
