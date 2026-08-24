import { API_BASE_URL } from '../config/api.js';

const PORTAL_SESSION_KEY = 'portal_session';

export interface PortalSessionData {
  access_token: string;
  refresh_token: string;
  expires_in: string;
  user: {
    id: string;
    customer_id: string;
    email: string;
    full_name?: string;
    phone?: string;
  };
}

export function getPortalSession(): PortalSessionData | null {
  try {
    const raw = sessionStorage.getItem(PORTAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    sessionStorage.removeItem(PORTAL_SESSION_KEY);
    return null;
  }
}

export function savePortalSession(session: PortalSessionData | null): void {
  if (session) {
    sessionStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(PORTAL_SESSION_KEY);
  }
}

export function clearPortalSession(): void {
  sessionStorage.removeItem(PORTAL_SESSION_KEY);
}

export function getPortalAccessToken(): string | null {
  return getPortalSession()?.access_token || null;
}

async function refreshAccessToken(): Promise<string | null> {
  const session = getPortalSession();
  if (!session?.refresh_token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/portal/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    savePortalSession({
      ...session,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}/portal${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getPortalAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !options.headers?.['X-Refresh-Attempt']) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      headers['X-Refresh-Attempt'] = 'true';
      response = await fetch(url, { ...options, headers });
    } else {
      clearPortalSession();
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: any = new Error(body.message || body.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return response.json();
}

let cachedTicket: string | null = null;
let cachedTicketExpiry: number = 0;
let pendingTicketRequest: Promise<{ ticket: string; expiresIn: number }> | null = null;

export const portalApi = {
  get<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'GET' });
  },

  post<T>(endpoint: string, body?: any): Promise<T> {
    return request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(endpoint: string, body?: any): Promise<T> {
    return request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: 'DELETE' });
  },

  rawRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return request<T>(endpoint, options);
  },
};

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  message_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  download_url?: string;
}

// ---------------------------------------------------------------------------
// Ticket Attachments
// ---------------------------------------------------------------------------

export async function uploadTicketAttachment(
  ticketId: string,
  file: File,
  messageId?: string | null
): Promise<TicketAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  if (messageId) {
    formData.append('message_id', messageId);
  }

  const token = getPortalAccessToken();
  const url = `${API_BASE_URL}/portal/support/tickets/${ticketId}/attachments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: any = new Error(body.message || body.error || `Upload failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function getTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
  return portalApi.get<TicketAttachment[]>(`/support/tickets/${ticketId}/attachments`);
}

export async function deleteTicketAttachment(ticketId: string, attachmentId: string): Promise<{ success: boolean }> {
  return portalApi.delete<{ success: boolean }>(`/support/tickets/${ticketId}/attachments/${attachmentId}`);
}

// ---------------------------------------------------------------------------
// Document lifecycle (requests, quotations, downloads, timeline, realtime)
// ---------------------------------------------------------------------------

export interface RequestLineItem {
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PortalCatalogItem {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  price?: number;
  quantity?: number;
  category?: string;
  status?: string;
}

export interface PortalAttachment {
  name: string;
  url: string;
  type: string;
}

export type PortalRequestStatus =
  | 'draft'
  | 'submitted'
  | 'assigned'
  | 'under_review'
  | 'waiting_for_customer'
  | 'ready_for_conversion'
  | 'converted'
  | 'rejected'
  | 'cancelled';

export interface QuotationRequestRecord {
  id: string;
  request_number: string;
  customer_id: string;
  customer_name: string;
  request_type: string;
  items: RequestLineItem[];
  subtotal: number;
  notes: string | null;
  status: PortalRequestStatus;
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
  attachments: PortalAttachment[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type SalesOrderStatus = 'Draft' | 'Confirmed' | 'Processing' | 'Pending' | 'Delivered' | 'Fulfilled' | 'Shipped' | 'Cancelled';

export interface SalesOrderRecord {
  id: string;
  order_number: string | null;
  orderDate: string;
  deliveryDate: string | null;
  customerName: string;
  totalAmount: number;
  status: SalesOrderStatus;
  items: RequestLineItem[];
  notes: string | null;
  quotation_id: string | null;
  source_request_id: string | null;
  source_request_number: string | null;
  reorder_of: string | null;
  reorder_of_number: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PortalShipmentRecord {
  id: string;
  order_number: string | null;
  orderDate: string;
  customerName: string;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  driver_name: string | null;
  vehicle_no: string | null;
  estimated_delivery: string | null;
  actual_arrival: string | null;
  current_location: string | null;
  proof_of_delivery: string | null;
  shipping_address: string | null;
  items: RequestLineItem[];
}

export interface DocumentChainEntry {
  docType: 'request' | 'quotation' | 'order';
  docId: string;
  docNumber: string;
  status: string;
  title: string;
  createdAt: string;
}

export interface DocumentChainResult {
  chain: DocumentChainEntry[];
  originOrder: DocumentChainEntry | null;
  request: any | null;
  quotation: any | null;
  order: any | null;
}

export interface QuotationRecord {
  id: string;
  quotation_number: string;
  request_id: string | null;
  customer_id: string;
  customer_name: string;
  items: RequestLineItem[];
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
  source_request_number: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersionRecord {
  id: string;
  version: number;
  snapshot: {
    items?: RequestLineItem[];
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

export interface DocumentSignatureRecord {
  id: string;
  decision: 'accepted' | 'rejected' | 'revision';
  signed_by: string | null;
  signer_name: string | null;
  signer_email: string | null;
  note: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface DocumentCommentRecord {
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

export interface TimelineEvent {
  id: string;
  doc_type: string;
  doc_id: string;
  event_type: string;
  title: string;
  description: string | null;
  actor_type: string;
  actor_name: string | null;
  created_at: string;
}

export interface DownloadGateResult {
  allowed: boolean;
  docType: string;
  docId: string;
  docNumber: string;
  downloadId: string;
}

export interface CreateRequestPayload {
  requestType?: string;
  items: { name: string; productId?: string | null; quantity: number; unitPrice: number }[];
  notes?: string;
  requestedDeliveryDate?: string | null;
  attachments?: PortalAttachment[];
  reorderOf?: string | null;
  reorderOfNumber?: string | null;
}

export interface ReorderResult {
  id: string;
  requestNumber: string;
  status: string;
  reorderOf: string;
  reorderOfNumber: string;
}

export interface QuotationDecisionPayload {
  acceptedBy?: string;
  reason?: string;
  comments?: string;
}

export interface PortalNotification {
  id: string;
  portal_user_id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export interface PortalReferral {
  id: string;
  referredCustomerId: string;
  referredCustomerName: string;
  referredCustomerEmail: string | null;
  status: string;
  pendingInvoiceId: string | null;
  pendingInvoiceAmount: number;
  convertedInvoiceId: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalReferralReward {
  id: string;
  referralId: string;
  referralCode: string;
  referredCustomerId: string;
  referredCustomerName: string;
  invoiceId: string;
  invoiceAmount: number;
  amount: number;
  status: string;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  walletTransactionId: string | null;
  createdAt: string;
}

export interface PortalReferralSettings {
  enabled: boolean;
  rewardType: string;
  rewardValue: number;
  rewardPercentage: number;
  minimumPurchase: number;
  maxRewardAmount: number;
  expiryDays: number;
  requireApproval: boolean;
  shareMessage: string;
}

export interface PortalReferralTimelineEntry {
  id: string;
  referralId: string;
  eventType: string;
  title: string;
  description: string;
  amount: number | null;
  actorId: string | null;
  actorName: string | null;
  metadata: string | null;
  timestamp: string;
}

export interface PortalCustomerSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export const portalLifecycle = {
  requests: {
    list(): Promise<QuotationRequestRecord[]> {
      return portalApi.get<QuotationRequestRecord[]>('/requests');
    },
    get(id: string): Promise<QuotationRequestRecord> {
      return portalApi.get<QuotationRequestRecord>(`/requests/${id}`);
    },
    create(payload: CreateRequestPayload): Promise<QuotationRequestRecord> {
      return portalApi.post<QuotationRequestRecord>('/requests', payload);
    },
    cancel(id: string): Promise<QuotationRequestRecord> {
      return portalApi.post<QuotationRequestRecord>(`/requests/${id}/cancel`);
    },
  },

  quotations: {
    list(): Promise<QuotationRecord[]> {
      return portalApi.get<QuotationRecord[]>('/quotations');
    },
    get(id: string): Promise<QuotationRecord> {
      return portalApi.get<QuotationRecord>(`/quotations/${id}`);
    },
    accept(id: string, payload?: QuotationDecisionPayload): Promise<QuotationRecord> {
      return portalApi.post<QuotationRecord>(`/quotations/${id}/accept`, payload);
    },
    reject(id: string, payload?: QuotationDecisionPayload): Promise<QuotationRecord> {
      return portalApi.post<QuotationRecord>(`/quotations/${id}/reject`, payload);
    },
    requestRevision(id: string, payload?: QuotationDecisionPayload): Promise<QuotationRecord> {
      return portalApi.post<QuotationRecord>(`/quotations/${id}/revision`, payload);
    },
    versions: {
      list(id: string): Promise<DocumentVersionRecord[]> {
        return portalApi.get<DocumentVersionRecord[]>(`/quotations/${id}/versions`);
      },
      get(id: string, version: number): Promise<DocumentVersionRecord> {
        return portalApi.get<DocumentVersionRecord>(`/quotations/${id}/versions/${version}`);
      },
    },
    signatures(id: string): Promise<DocumentSignatureRecord[]> {
      return portalApi.get<DocumentSignatureRecord[]>(`/quotations/${id}/signatures`);
    },
  },

  catalog: {
    list(): Promise<PortalCatalogItem[]> {
      return portalApi.get<PortalCatalogItem[]>('/catalog');
    },
  },

  orders: {
    list(): Promise<SalesOrderRecord[]> {
      return portalApi.get<SalesOrderRecord[]>('/orders');
    },
    get(id: string): Promise<SalesOrderRecord> {
      return portalApi.get<SalesOrderRecord>(`/orders/${id}`);
    },
    reorder(id: string): Promise<ReorderResult> {
      return portalApi.post<ReorderResult>(`/orders/${id}/reorder`);
    },
  },

  shipments: {
    list(): Promise<PortalShipmentRecord[]> {
      return portalApi.get<PortalShipmentRecord[]>('/shipments');
    },
    get(id: string): Promise<PortalShipmentRecord> {
      return portalApi.get<PortalShipmentRecord>(`/shipments/${id}`);
    },
  },

  documentChain: {
    get(docType: 'request' | 'quotation' | 'order', docId: string): Promise<DocumentChainResult> {
      return portalApi.get<DocumentChainResult>(
        `/document-chain?docType=${docType}&docId=${encodeURIComponent(docId)}`
      );
    },
  },

  downloads: {
    record(docType: 'quotation' | 'order', docId: string): Promise<DownloadGateResult> {
      return portalApi.post<DownloadGateResult>('/downloads', { docType, docId });
    },
  },

  timeline: {
    get(docType: 'request' | 'quotation' | 'order', docId: string): Promise<TimelineEvent[]> {
      return portalApi.get<TimelineEvent[]>(`/timeline?docType=${docType}&docId=${encodeURIComponent(docId)}`);
    },
  },

  comments: {
    list(docType: 'request' | 'quotation' | 'order', docId: string): Promise<DocumentCommentRecord[]> {
      return portalApi.get<DocumentCommentRecord[]>(`/comments?docType=${docType}&docId=${encodeURIComponent(docId)}`);
    },
    add(docType: 'request' | 'quotation' | 'order', docId: string, body: string): Promise<DocumentCommentRecord[]> {
      return portalApi.post<DocumentCommentRecord[]>('/comments', { docType, docId, body });
    },
  },

  notifications: {
    list(): Promise<PortalNotification[]> {
      return portalApi.get<PortalNotification[]>('/notifications');
    },
    unreadCount(): Promise<{ count: number }> {
      return portalApi.get<{ count: number }>('/notifications/unread-count');
    },
    markRead(id: string): Promise<void> {
      return portalApi.put<void>(`/notifications/${id}/read`, {});
    },
    markAllRead(): Promise<void> {
      return portalApi.put<void>('/notifications/read-all', {});
    },
  },

  loyalty: {
    get(): Promise<{ points: number; cashback: number; tier: string; pointsHistory: { date: string; description: string; points: number; balance: number }[] }> {
      return portalApi.get('/loyalty');
    },
  },

  referrals: {
    list(params?: { page?: number; pageSize?: number; status?: string; search?: string; sort?: string }): Promise<{ referrals: PortalReferral[]; total: number; page: number; pageSize: number; totalPages: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.status) qs.set('status', params.status);
      if (params?.search) qs.set('search', params.search);
      if (params?.sort) qs.set('sort', params.sort);
      const q = qs.toString();
      return portalApi.get(q ? `/referrals?${q}` : '/referrals');
    },
    get(id: string): Promise<PortalReferral | null> {
      return portalApi.get<PortalReferral | null>(`/referrals/${id}`);
    },
    timeline(referralId: string): Promise<PortalReferralTimelineEntry[]> {
      return portalApi.get<PortalReferralTimelineEntry[]>(`/referrals/${referralId}/timeline`);
    },
    rewards(params?: { page?: number; pageSize?: number; status?: string }): Promise<{ rewards: PortalReferralReward[]; total: number; page: number; pageSize: number; totalPages: number }> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.status) qs.set('status', params.status);
      const q = qs.toString();
      return portalApi.get(q ? `/referrals/rewards?${q}` : '/referrals/rewards');
    },
    settings(): Promise<PortalReferralSettings> {
      return portalApi.get<PortalReferralSettings>('/referrals/settings');
    },
    create(payload: { referredCustomerId: string; notes?: string }): Promise<any> {
      return portalApi.post('/referrals', payload);
    },
    searchCustomers(query: string): Promise<PortalCustomerSearchResult[]> {
      return portalApi.get<PortalCustomerSearchResult[]>(`/referrals/customers/search?q=${encodeURIComponent(query)}`);
    },
    stats(): Promise<{
      total: number;
      signedUp: number;
      qualified: number;
      rewardApproved: number;
      paid: number;
      pendingRewardAmount: number;
      totalEarned: number;
      conversionRate: number;
    }> {
      return portalApi.get('/referrals/stats');
    },
  },

  invoices: {
    list(params?: { page?: number; pageSize?: number; search?: string; status?: string }): Promise<any> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      const q = qs.toString();
      return portalApi.get(q ? `/invoices?${q}` : '/invoices');
    },
    get(id: string): Promise<any> {
      return portalApi.get(`/invoices/${id}`);
    },
  },

  payments: {
    list(params?: { page?: number; pageSize?: number; search?: string }): Promise<any> {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params?.search) qs.set('search', params.search);
      const q = qs.toString();
      return portalApi.get(q ? `/payments?${q}` : '/payments');
    },
    get(id: string): Promise<any> {
      return portalApi.get(`/payments/${id}`);
    },
    /** Create a Stripe PaymentIntent (or mock client secret) for an invoice */
    createIntent(invoiceId: string, amount: number, currency?: string): Promise<{ clientSecret: string; mode: string }> {
      return portalApi.post('/payments/intent', { invoiceId, amount, currency });
    },
    /** Record a completed payment against an invoice */
    recordPayment(invoiceId: string, amount: number, options?: {
      currency?: string;
      paymentMethod?: string;
      reference?: string;
      transactionId?: string;
    }): Promise<{ success: boolean; paymentId: string; status: string }> {
      return portalApi.post('/payments', {
        invoiceId,
        amount,
        currency: options?.currency || 'USD',
        paymentMethod: options?.paymentMethod || 'Card',
        reference: options?.reference,
        transactionId: options?.transactionId,
      });
    },
  },

  statements: {
    list(params?: { startDate?: string; endDate?: string }): Promise<any> {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      const q = qs.toString();
      return portalApi.get(q ? `/statements?${q}` : '/statements');
    },
  },

  documents: {
    list(): Promise<any> {
      return portalApi.get('/documents');
    },
  },

  wallet: {
    get(): Promise<any> {
      return portalApi.get('/wallet');
    },
  },

  profile: {
    get(): Promise<any> {
      return portalApi.get('/profile');
    },
    update(payload: any): Promise<any> {
      return portalApi.put('/profile', payload);
    },
    changePassword(payload: { currentPassword: string; newPassword: string }): Promise<any> {
      return portalApi.put('/profile/password', payload);
    },
    listSessions(): Promise<any[]> {
      return portalApi.get('/auth/sessions');
    },
  },

  twoFactor: {
    status(): Promise<{ enabled: boolean; confirmed: boolean }> {
      return portalApi.get('/auth/two-factor/status');
    },
    setup(): Promise<{ secret: string; otpauth_uri: string }> {
      return portalApi.post('/auth/two-factor/setup', {});
    },
    enable(code: string): Promise<{ message: string }> {
      return portalApi.post('/auth/two-factor/enable', { code });
    },
    disable(code: string): Promise<{ message: string }> {
      return portalApi.post('/auth/two-factor/disable', { code });
    },
  },

  /** SSE realtime stream with a short-lived ticket (EventSource cannot send headers). */
  async subscribe(callbacks: { onEvent?: (type: string, payload: any) => void; onError?: (err: any) => void }): Promise<() => void> {
    let source: EventSource | null = null;
    try {
      const now = Date.now();
      if (!cachedTicket || cachedTicketExpiry <= now) {
        if (!pendingTicketRequest) {
          pendingTicketRequest = portalApi.post<{ ticket: string; expiresIn: number }>('/events-ticket', { purpose: 'portal-realtime' })
            .finally(() => { pendingTicketRequest = null; });
        }
        const { ticket, expiresIn } = await pendingTicketRequest;
        cachedTicket = ticket;
        cachedTicketExpiry = Date.now() + expiresIn * 1000;
      }
      source = new EventSource(`${API_BASE_URL}/portal/events?token=${encodeURIComponent(cachedTicket!)}`);
      source.addEventListener('entity_changed', (e: MessageEvent) => {
        try {
          callbacks.onEvent?.('entity_changed', JSON.parse(e.data));
        } catch { /* ignore malformed payloads */ }
      });
      source.addEventListener('notification', (e: MessageEvent) => {
        try {
          callbacks.onEvent?.('notification', JSON.parse(e.data));
        } catch { /* ignore malformed payloads */ }
      });
      source.onerror = () => callbacks.onError?.(new Error('Realtime connection lost'));
    } catch {
      callbacks.onError?.(new Error('Failed to establish realtime connection'));
    }
    return () => source?.close();
  },
};
