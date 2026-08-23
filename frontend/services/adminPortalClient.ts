import { API_BASE_URL } from '../config/api.js';
import type { PortalAdImageMeta } from '../types/ads';

interface AdminUserInfo {
  id: string;
  role?: string;
  email?: string;
  isSuperAdmin?: boolean;
}

function getAdminUser(): AdminUserInfo | null {
  try {
    const raw = sessionStorage.getItem('nexus_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Read the Supabase access_token from the session stored by AuthContext. */
function getAccessToken(): string | null {
  try {
    const raw = sessionStorage.getItem('nexus_user');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session.accessToken || null;
  } catch {
    return null;
  }
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {};

  // Send the Supabase JWT so the backend verifyAdminAuth middleware can decode it.
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const user = getAdminUser();
  if (user) {
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.role || 'Admin';
    if (user.email) headers['x-user-email'] = user.email;
    if (user.isSuperAdmin) headers['x-user-is-super-admin'] = 'true';
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE_URL}/portal/admin${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error: any = new Error(body.message || body.error || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return undefined as T;
}

export const adminPortalApi = {
  get<T>(path: string): Promise<T> {
    return adminRequest<T>(path, { method: 'GET' });
  },
  post<T>(path: string, body?: any): Promise<T> {
    return adminRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  },
  put<T>(path: string, body?: any): Promise<T> {
    return adminRequest<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  },
  delete<T>(path: string): Promise<T> {
    return adminRequest<T>(path, { method: 'DELETE' });
  },
  /** POST raw (FormData) — used for binary file uploads. */
  postForm<T>(path: string, formData: FormData): Promise<T> {
    return adminRequest<T>(path, { method: 'POST', body: formData });
  },
};

/**
 * Uploads a banner image for a portal ad; returns the stable public URL plus
 * the metadata of the prepared asset (server prepares an exact 4:1 WebP).
 */
export async function uploadAdImage(file: File): Promise<{ url: string; path: string; meta: PortalAdImageMeta }> {
  const form = new FormData();
  form.append('file', file);
  return adminPortalApi.postForm<{ url: string; path: string; meta: PortalAdImageMeta }>('/ads/upload', form);
}

export interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  customer_id: string | null;
  customer_name: string | null;
  is_read: number;
  created_at: string;
}

export interface AdminRequestItem {
  id: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type AdminRequestStatus =
  | 'draft'
  | 'submitted'
  | 'assigned'
  | 'under_review'
  | 'waiting_for_customer'
  | 'ready_for_conversion'
  | 'converted'
  | 'rejected'
  | 'cancelled';

export interface AdminAttachment {
  name: string;
  url: string;
  type: string;
}

export interface AdminQuotationRequest {
  id: string;
  request_number: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  request_type: string;
  items: AdminRequestItem[];
  subtotal: number;
  notes: string | null;
  status: AdminRequestStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  quotation_id: string | null;
  quotation_number: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  reorder_of: string | null;
  reorder_of_number: string | null;
  requested_delivery_date: string | null;
  attachments: AdminAttachment[];
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  converted_at: string | null;
  converted_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  marked?: number;
  deleted_at?: string | null;
}

export interface QuotationPrefillPayload {
  id: string;
  requestNumber: string;
  requestType: string;
  customer_id: string;
  customer_name: string;
  items: AdminRequestItem[];
  subtotal: number;
  notes: string | null;
  requestedDeliveryDate: string | null;
  attachments: AdminAttachment[];
  status: string;
  assignedTo: string | null;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    billingAddress: string;
    shippingAddress: string;
    city: string | null;
    segment: string | null;
    paymentTerms: string | null;
    currency: string | null;
  } | null;
}

export interface OrderPrefillPayload {
  id: string;
  requestNumber: string;
  requestType: string;
  customer_id: string;
  customer_name: string;
  items: AdminRequestItem[];
  subtotal: number;
  notes: string | null;
  deliveryDate: string | null;
  reorderOf: string | null;
  reorderOfNumber: string | null;
  attachments: AdminAttachment[];
  status: string;
  assignedTo: string | null;
  customer: {
    id?: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    billingAddress: string;
    shippingAddress: string;
    city: string | null;
    segment: string | null;
    paymentTerms: string | null;
    currency: string | null;
  } | null;
}

export interface AdminSalesOrder {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  orderDate: string;
  deliveryDate: string | null;
  source_request_id: string | null;
  source_request_number: string | null;
  reorder_of: string | null;
  reorder_of_number: string | null;
  customer_name: string | null;
  created_at: string;
  items?: { name?: string; productName?: string; quantity?: number; totalQuantity?: number; unitPrice?: number; price?: number; lineTotal?: number }[];
}

export interface AdminQuotation {
  id: string;
  quotation_number: string;
  request_id: string | null;
  customer_id: string;
  customer_name: string;
  items: AdminRequestItem[];
  subtotal: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  delivery_fee: number;
  total: number;
  currency: string;
  payment_terms: string | null;
  valid_until: string | null;
  status: 'ready' | 'accepted' | 'rejected' | 'revision_requested' | 'converted' | 'expired';
  version: number;
  expired_at: string | null;
  accepted_by: string | null;
  accepted_by_email: string | null;
  revision_note: string | null;
  rejection_reason: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  revision_requested_at: string | null;
  converted_at: string | null;
  order_id: string | null;
  created_by: string;
  source_request_number: string | null;
  erp_quotation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminDocumentVersion {
  id: string;
  version: number;
  snapshot: {
    items?: AdminRequestItem[];
    subtotal?: number;
    discount?: number;
    taxRate?: number;
    taxAmount?: number;
    deliveryFee?: number;
    total?: number;
    currency?: string;
    paymentTerms?: string | null;
    validUntil?: string | null;
    status?: string;
  };
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface AdminDocumentSignature {
  id: string;
  decision: 'accepted' | 'rejected' | 'revision';
  signed_by: string | null;
  signer_name: string | null;
  signer_email: string | null;
  note: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AdminDocumentComment {
  id: string;
  doc_type: string;
  doc_id: string;
  author_type: 'customer' | 'admin' | 'system';
  author_id: string | null;
  author_name: string | null;
  visibility: 'customer' | 'internal';
  body: string;
  created_at: string;
}

/** SSE realtime stream with a short-lived ticket (EventSource cannot send headers). */
export async function subscribeAdminEvents(callbacks: {
  onNotification?: (n: any) => void;
  onSystemAlert?: (n: any) => void;
  onEntityChange?: (payload: any) => void;
  onError?: (err: any) => void;
}): Promise<() => void> {
  // Don't attempt ticket issuance when there is no signed-in admin session
  // (e.g. right after the company was deleted, or a session expired). The
  // app subscribes unconditionally from NotificationContext, so without this
  // guard every signed-out page load fires a guaranteed 403 from
  // /api/portal/admin/events-ticket.
  if (!getAccessToken() && !getAdminUser()) {
    return () => {};
  }
  let source: EventSource | null = null;
  try {
    const { ticket } = await adminPortalApi.get<{ ticket: string; expiresIn: number }>('/events-ticket');
    source = new EventSource(`${API_BASE_URL}/portal/admin/events?token=${encodeURIComponent(ticket)}`);
    source.addEventListener('notification', (e: MessageEvent) => {
      try {
        callbacks.onNotification?.(JSON.parse(e.data));
      } catch { /* ignore malformed payloads */ }
    });
    source.addEventListener('system_alert', (e: MessageEvent) => {
      try {
        callbacks.onSystemAlert?.(JSON.parse(e.data));
      } catch { /* ignore malformed payloads */ }
    });
    source.addEventListener('entity_changed', (e: MessageEvent) => {
      try {
        callbacks.onEntityChange?.(JSON.parse(e.data));
      } catch { /* ignore malformed payloads */ }
    });
    source.onerror = () => callbacks.onError?.(new Error('Realtime connection lost'));
  } catch {
    // Ticket issuance failed — admin will poll instead.
  }
  return () => source?.close();
}

export interface AdminUser {
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_status?: string;
  portal_user_id?: string;
  portal_email?: string;
  full_name?: string;
  portal_phone?: string;
  portal_status?: string;
  last_login_at?: string;
  portal_created_at?: string;
}

export interface PortalCredentials {
  email: string;
  password?: string | null;
  inviteCode?: string | null;
  userId?: string;
}

export interface AdminPortalAccount {
  existing?: boolean;
  user: {
    id: string;
    customer_id: string;
    email: string;
    full_name?: string;
    phone?: string;
    status?: string;
  };
  generated_password: string | null;
  invite_code?: string | null;
}

export const adminLifecycle = {
  requests: {
    list(status?: string): Promise<AdminQuotationRequest[]> {
      return adminPortalApi.get<AdminQuotationRequest[]>(`/requests${status ? `?status=${status}` : ''}`);
    },
    inbox(): Promise<AdminQuotationRequest[]> {
      return adminPortalApi.get<AdminQuotationRequest[]>('/requests/inbox');
    },
    /** Marks request-pipeline admin notifications read (clears the hub badge). */
    markInboxRead(): Promise<{ success: boolean; marked: number }> {
      return adminPortalApi.post<{ success: boolean; marked: number }>('/requests/inbox/read-all', {});
    },
    get(id: string): Promise<AdminQuotationRequest> {
      return adminPortalApi.get<AdminQuotationRequest>(`/requests/${id}`);
    },
    update(id: string, body: { items?: { name: string; quantity: number; unitPrice: number }[]; notes?: string }): Promise<AdminQuotationRequest> {
      return adminPortalApi.put<AdminQuotationRequest>(`/requests/${id}`, body);
    },
    reject(id: string, reason: string): Promise<AdminQuotationRequest> {
      return adminPortalApi.post<AdminQuotationRequest>(`/requests/${id}/reject`, { reason });
    },
    clarify(id: string, note: string): Promise<AdminQuotationRequest> {
      return adminPortalApi.post<AdminQuotationRequest>(`/requests/${id}/clarify`, { note });
    },
    open(id: string): Promise<AdminQuotationRequest> {
      return adminPortalApi.post<AdminQuotationRequest>(`/requests/${id}/open`, {});
    },
    assign(id: string, body: { assignTo?: string; assignToName?: string }): Promise<AdminQuotationRequest> {
      return adminPortalApi.post<AdminQuotationRequest>(`/requests/${id}/assign`, body);
    },
    mark(id: string): Promise<AdminQuotationRequest> {
      return adminPortalApi.post<AdminQuotationRequest>(`/requests/${id}/mark`, {});
    },
    remove(id: string): Promise<{ id: string; status: string; deleted: boolean }> {
      return adminPortalApi.delete<{ id: string; status: string; deleted: boolean }>(`/requests/${id}`);
    },
    /**
     * Starts quotation generation. Does NOT create a quotation and does NOT
     * reserve a quotation number — returns the prefill payload for the standard
     * ERP quotation editor.
     */
    startQuotation(id: string): Promise<QuotationPrefillPayload> {
      return adminPortalApi.post<QuotationPrefillPayload>(`/requests/${id}/generate-quotation`, {});
    },
    /**
     * Links the saved ERP quotation to the request (request becomes converted).
     */
    completeQuotation(id: string, body: { quotationNumber: string; erpQuotationId?: string; quotationSnapshot?: any }): Promise<AdminQuotation> {
      return adminPortalApi.post<AdminQuotation>(`/requests/${id}/complete-quotation`, body);
    },
    /**
     * Starts official sales order generation for an ORDER request. Does NOT
     * create an order and does NOT reserve an order number — returns the prefill
     * payload for the standard ERP sales order editor.
     */
    startOrder(id: string): Promise<OrderPrefillPayload> {
      return adminPortalApi.post<OrderPrefillPayload>(`/requests/${id}/generate-order`, {});
    },
    /**
     * Completes the conversion after the ERP sales order has been saved. Creates
     * the official sales order (SO-YYYY-######), links it to the request
     * (request becomes converted) and notifies the customer.
     */
    completeOrder(id: string, body: { erpOrderId?: string; orderSnapshot?: any }): Promise<{ id: string; orderNumber: string; status: string }> {
      return adminPortalApi.post<{ id: string; orderNumber: string; status: string }>(`/requests/${id}/complete-order`, body);
    },
  },
  orders: {
    list(): Promise<AdminSalesOrder[]> {
      return adminPortalApi.get<AdminSalesOrder[]>('/orders');
    },
    updateStatus(id: string, body: { status: string; note?: string }): Promise<{ id: string; status: string; orderNumber: string | null }> {
      return adminPortalApi.post<{ id: string; status: string; orderNumber: string | null }>(`/orders/${id}/status`, body);
    },
  },
  quotations: {
    list(): Promise<AdminQuotation[]> {
      return adminPortalApi.get<AdminQuotation[]>('/quotations');
    },
    get(id: string): Promise<AdminQuotation> {
      return adminPortalApi.get<AdminQuotation>(`/quotations/${id}`);
    },
    regenerate(id: string, body: any): Promise<AdminQuotation> {
      return adminPortalApi.post<AdminQuotation>(`/quotations/${id}/regenerate`, body);
    },
    convertToOrder(id: string, body: { deliveryDate?: string; notes?: string }): Promise<any> {
      return adminPortalApi.post<any>(`/quotations/${id}/convert-to-order`, body);
    },
    versions: {
      list(id: string): Promise<AdminDocumentVersion[]> {
        return adminPortalApi.get<AdminDocumentVersion[]>(`/quotations/${id}/versions`);
      },
      get(id: string, version: number): Promise<AdminDocumentVersion> {
        return adminPortalApi.get<AdminDocumentVersion>(`/quotations/${id}/versions/${version}`);
      },
    },
    signatures(id: string): Promise<AdminDocumentSignature[]> {
      return adminPortalApi.get<AdminDocumentSignature[]>(`/quotations/${id}/signatures`);
    },
  },
  comments: {
    list(docType: string, docId: string): Promise<AdminDocumentComment[]> {
      return adminPortalApi.get<AdminDocumentComment[]>(`/comments?docType=${docType}&docId=${encodeURIComponent(docId)}`);
    },
    add(docType: string, docId: string, body: string, visibility: 'customer' | 'internal'): Promise<AdminDocumentComment[]> {
      return adminPortalApi.post<AdminDocumentComment[]>('/comments', { docType, docId, body, visibility });
    },
  },
  notifications: {
    list(): Promise<AdminNotification[]> {
      return adminPortalApi.get<AdminNotification[]>('/notifications');
    },
    unreadCount(): Promise<{ count: number }> {
      return adminPortalApi.get<{ count: number }>('/notifications/unread-count');
    },
    markRead(id: string): Promise<void> {
      return adminPortalApi.put<void>(`/notifications/${id}/read`, {});
    },
    markAllRead(): Promise<void> {
      return adminPortalApi.put<void>('/notifications/read-all', {});
    },
  },
  activity: {
    list(limit = 50): Promise<any[]> {
      return adminPortalApi.get<any[]>(`/activity?limit=${limit}`);
    },
  },
  analytics: {
    get(): Promise<any> {
      return adminPortalApi.get<any>('/analytics');
    },
  },
  users: {
    list(): Promise<AdminUser[]> {
      return adminPortalApi.get<AdminUser[]>('/users');
    },
    autoCreate(payload: { customer_id: string; name?: string; email?: string; phone?: string; full_name?: string; invite?: boolean }): Promise<AdminPortalAccount> {
      return adminPortalApi.post<AdminPortalAccount>('/users/auto-create', payload);
    },
    invite(id: string): Promise<{ code: string; expires_at: string; user: AdminPortalAccount['user'] }> {
      return adminPortalApi.post<{ code: string; expires_at: string; user: AdminPortalAccount['user'] }>(`/users/${id}/invite`);
    },
    regeneratePassword(id: string, payload: { customer_id: string; name?: string; email?: string; phone?: string }): Promise<{ generated_password: string; user_id?: string }> {
      return adminPortalApi.post<{ generated_password: string; user_id?: string }>(`/users/${id}/regenerate-password`, payload);
    },
  },
  staff: {
    list(): Promise<{ id: string; username: string; email: string | null; role: string }[]> {
      return adminPortalApi.get<{ id: string; username: string; email: string | null; role: string }[]>('/staff');
    },
  },
  company: {
    async remove(): Promise<{ ok: boolean; company_id: string; detail?: string }> {
      return adminPortalApi.post<{ ok: boolean; company_id: string; detail?: string }>(
        '/company/delete',
        {}
      );
    },
    async reset(): Promise<{ ok: boolean; cleared: string[] }> {
      return adminPortalApi.post<{ ok: boolean; cleared: string[] }>('/company/reset', {});
    },
  },
};
