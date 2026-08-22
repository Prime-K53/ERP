import { DeliveryStatus } from '../types';

export function formatDateTime(
  value?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', options || {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(
  value?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', options || {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getDeliveryStatusBadge(
  status: DeliveryStatus | string
): { label: string; bg: string; color: string; border: string } {
  const key = status.toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    delivered: { label: 'Delivered', bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
    fulfilled: { label: 'Delivered', bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
    out_for_delivery: { label: 'Out for Delivery', bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
    dispatched: { label: 'Dispatched', bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' },
    in_transit: { label: 'In Transit', bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' },
    processing: { label: 'Processing', bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
  };
  return map[key] || { label: status.replace(/_/g, ' '), bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' };
}
