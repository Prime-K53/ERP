import { dbService } from './db.ts';
import { generateNextId } from '../utils/helpers';
import {
  SalesOrder,
  SalesOrderItem,
  SalesOrderPayment,
  SalesOrderStatus,
  canonicalizeStatus,
  derivePaymentStatus,
  deriveInvoiceStatus,
  legacyPaymentStatus,
  isCanonicalStatus,
  isTerminalStatus,
  isProvisionalNumber,
} from '../types/salesOrder';

export interface SalesOrderContext {
  user?: { id?: string; name?: string } | null;
  companyConfig?: any;
  notify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export interface InvoiceDraft {
  id: string;
  invoiceNumber: string;
  customerName?: string;
  customerId?: string | null;
  date: string;
  dueDate?: string | null;
  items: any[];
  totalAmount: number;
  paidAmount?: number;
  status: string;
  discount?: number;
  discountType?: string;
  discountRaw?: number;
  notes?: string;
  createdBy?: string;
  type?: string;
  paymentTerms?: any;
  referredBy?: string;
  referredByName?: string;
  conversionDetails?: any;
  materialTotal?: number;
  adjustmentTotal?: number;
  adjustmentSnapshots?: any[];
  profitMarginTotal?: number;
  roundingTotal?: number;
  roundingDifference?: number;
  roundingMethod?: string;
  sourceOrderId?: string;
  [key: string]: any;
}

export interface AdoptionDeps {
  persistLocal: (order: SalesOrder) => Promise<SalesOrder>;
  completeOrder: (requestId: string, payload: any) => Promise<any>;
  updateLocal: (order: SalesOrder) => Promise<void>;
}

export interface AdoptionResult {
  success: boolean;
  order: SalesOrder;
  officialId?: string;
  officialNumber?: string;
  adopted?: boolean;
  error?: string;
}

export interface MigrationReport {
  migrated: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  legacyRemaining: number;
  canonicalCount: number;
  migrationId: string;
}

const TERMINAL: readonly SalesOrderStatus[] = ['Fulfilled', 'Cancelled', 'Converted'];

const TRANSITION_RULES: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  Draft: ['Confirmed', 'Cancelled'],
  Confirmed: ['Processing', 'Fulfilled', 'Cancelled', 'Converted'],
  Processing: ['Fulfilled', 'Cancelled', 'Converted'],
  Fulfilled: [],
  Cancelled: [],
  Converted: [],
};

export const canTransition = (from: string | undefined | null, to: string | undefined | null): boolean => {
  const f = canonicalizeStatus(from);
  const t = canonicalizeStatus(to);
  if (f === t) return true;
  return (TRANSITION_RULES[f] || []).includes(t);
};

export const assertCanTransition = (from: string | undefined | null, to: string | undefined | null): void => {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid sales order transition: ${canonicalizeStatus(from)} -> ${canonicalizeStatus(to)}`);
  }
};

export const validateOrder = (order: Partial<SalesOrder>): string[] => {
  const errors: string[] = [];
  if (!order.id) errors.push('Order id is required');
  if (!Array.isArray(order.items) || order.items.length === 0) errors.push('Order must contain at least one item');
  if (typeof order.total !== 'number' && typeof order.totalAmount !== 'number') errors.push('Order total is required');
  for (const item of order.items || []) {
    if (!item.productId) errors.push('Item is missing productId');
    if (!(item.quantity > 0)) errors.push(`Item ${item.productId || item.id} has invalid quantity`);
  }
  return errors;
};

export const normalizeTotals = (order: SalesOrder): SalesOrder => {
  const subtotal = order.items.reduce((sum, it) => sum + Number(it.lineTotal ?? it.subtotal ?? (it.quantity * it.unitPrice)), 0);
  const discount = Number(order.discount ?? order.discountRaw ?? 0);
  const tax = Number(order.tax ?? 0);
  const otherCharges = Number(order.otherCharges ?? 0);
  const total = Number(order.total ?? order.totalAmount ?? (subtotal - discount + tax + otherCharges));
  const paidAmount = Number(order.paidAmount ?? 0);
  const remainingBalance = Math.max(0, total - paidAmount);
  const items = order.items.map((it) => ({
    ...it,
    lineTotal: Number(it.lineTotal ?? it.subtotal ?? (it.quantity * it.unitPrice)),
  }));
  return { ...order, items, subtotal, discount, discountRaw: discount, tax, otherCharges, total, totalAmount: total, paidAmount, remainingBalance };
};

export const canonicalizeOrder = (raw: any): SalesOrder => {
  const base: any = raw || {};
  const legacyStatus = String(base.status || '').trim() || undefined;
  const status = canonicalizeStatus(legacyStatus);
  const paymentStatus = derivePaymentStatus(
    Number(base.paidAmount ?? 0),
    Number(base.total ?? base.totalAmount ?? 0),
    legacyStatus,
  );
  const invoiceStatus = deriveInvoiceStatus(base.invoiceId, base.invoiceNumber, legacyStatus);
  const items: SalesOrderItem[] = (base.items || []).map((it: any, i: number) => ({
    id: it.id || `item-${base.id || 'order'}-${i}`,
    productId: it.productId || it.parentId || it.id || `item-${base.id || 'order'}-${i}`,
    description: it.description || it.productName || it.name || 'Product',
    quantity: Number(it.quantity ?? it.qty ?? 0),
    unitPrice: Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0),
    discount: Number(it.discount ?? 0),
    lineTotal: Number(it.lineTotal ?? it.line_total ?? it.subtotal ?? (Number(it.quantity ?? 0) * Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0))),
    ...it,
  }));
  const normalized = normalizeTotals({ ...base, items, status, paymentStatus, invoiceStatus } as SalesOrder);
  const serverNumber = base.order_number || undefined;
  const orderNumber = serverNumber || base.orderNumber || base.id;
  return {
    ...normalized,
    orderNumber,
    orderNumberProvisional: base.orderNumberProvisional === true
      ? !serverNumber
      : isProvisionalNumber(normalized) && !serverNumber,
    legacyStatus: legacyStatus && !isCanonicalStatus(legacyStatus) ? legacyStatus : base.legacyStatus,
    date: base.date || base.orderDate,
    orderDate: base.orderDate || base.date || new Date().toISOString(),
    totalAmount: normalized.total,
    payments: Array.isArray(base.payments) ? base.payments : [],
    createdAt: base.createdAt || base.date || base.orderDate || new Date().toISOString(),
    updatedAt: base.updatedAt || new Date().toISOString(),
    companyId: base.companyId || undefined,
    version: base.version != null ? Number(base.version) : undefined,
    serverUpdatedAt: base.serverUpdatedAt || base.updated_at || undefined,
  };
};

export const isOfficialNumber = (value?: string | null): boolean => {
  return Boolean(value) && /^(ORD-|SO-|ORD\/|SO\/)/i.test(String(value));
};

export const applyOfficialNumber = (order: SalesOrder, officialId: string, officialNumber: string): SalesOrder => {
  return {
    ...order,
    id: officialId || order.id,
    orderNumber: officialNumber || order.orderNumber || order.id,
    orderNumberProvisional: false,
  };
};

export const markInvoiced = (order: SalesOrder, invoiceId: string, invoiceNumber?: string | null): SalesOrder => ({
  ...order,
  invoiceId,
  invoiceNumber: invoiceNumber || null,
  invoiceStatus: 'Invoiced',
});

export const buildInvoiceFromOrder = (order: any, ctx: SalesOrderContext = {}): InvoiceDraft => {
  const issuedDate = new Date().toISOString().split('T')[0];
  const totalAmount = Number(order.totalAmount ?? order.total ?? 0);
  const paidAmount = Number(order.paidAmount ?? 0);
  return {
    id: '',
    invoiceNumber: '',
    customerName: order.customerName,
    customerId: order.customerId,
    date: issuedDate,
    dueDate: order.deliveryDate || null,
    items: (order.items || []).map((i: any) => ({
      ...i,
      description: i.productName || i.description,
      price: i.unitPrice ?? i.price ?? 0,
      cost: i.cost ?? i.cost_price ?? 0,
      cost_price: i.cost_price ?? i.cost ?? 0,
      adjustmentSnapshots: i.adjustmentSnapshots || [],
      adjustmentTotal: i.adjustmentTotal ?? i.pricingBreakdown?.adjustmentTotal ?? 0,
      pricingBreakdown: i.pricingBreakdown,
      smartPricingSnapshot: i.smartPricingSnapshot,
      productionCostSnapshot: i.productionCostSnapshot,
    })),
    totalAmount,
    paidAmount,
    status: paidAmount >= totalAmount ? 'Paid' : 'Unpaid',
    discount: order.discount || 0,
    discountType: order.discountType || 'fixed',
    discountRaw: order.discountRaw || 0,
    notes: `Converted from [Order] #[${order.orderNumber || order.id}] on [${new Date().toLocaleString()}] as accepted by [${ctx.user?.name || 'System'}]`,
    createdBy: ctx.user?.name || 'System User',
    type: 'standard',
    referredBy: order.referredBy || '',
    referredByName: order.referredByName || '',
    conversionDetails: {
      sourceType: 'order',
      sourceNumber: order.orderNumber || order.id,
      date: new Date().toLocaleDateString(),
      acceptedBy: ctx.user?.name || 'System',
    },
    materialTotal: order.materialTotal ?? 0,
    adjustmentTotal: order.adjustmentTotal ?? 0,
    adjustmentSnapshots: order.adjustmentSnapshots || [],
    profitMarginTotal: order.profitMarginTotal ?? 0,
    roundingTotal: order.roundingTotal ?? order.roundingDifference ?? 0,
    roundingDifference: order.roundingDifference ?? order.roundingTotal ?? 0,
    roundingMethod: order.roundingMethod ?? '',
    sourceOrderId: order.id,
  };
};

export const assertTenantSafe = (order: SalesOrder, companyConfig?: any): void => {
  const expected = companyConfig?.id || companyConfig?.companyId;
  if (expected && order.companyId && order.companyId !== expected) {
    throw new Error(`Sales order ${order.id} belongs to another tenant (companyId mismatch)`);
  }
};

export const adoptQuotationRequestAsSalesOrder = async (
  prefill: { id: string; requestNumber?: string },
  order: SalesOrder,
  deps: AdoptionDeps,
): Promise<AdoptionResult> => {
  const persisted = await deps.persistLocal(order);
  try {
    const res = await deps.completeOrder(prefill.id, {
      erpOrderId: persisted.id,
      orderSnapshot: {
        items: persisted.items || [],
        subtotal: persisted.subtotal || 0,
        discounts: persisted.discounts ?? persisted.discount ?? 0,
        tax: persisted.tax || 0,
        otherCharges: persisted.otherCharges || 0,
        total: persisted.total || persisted.totalAmount || 0,
        notes: typeof persisted.notes === 'string' ? persisted.notes : (Array.isArray(persisted.notes) ? persisted.notes.join('\n') : null),
        deliveryDate: persisted.deliveryDate || null,
        customerId: persisted.customerId || null,
        customerName: persisted.customerName || null,
      },
    });
    if (res?.id || res?.orderNumber) {
      const adopted = applyOfficialNumber(persisted, res.id || persisted.id, res.orderNumber || '');
      await deps.updateLocal({
        ...adopted,
        sourceRequestId: prefill.id,
        sourceRequestNumber: prefill.requestNumber,
        status: 'Confirmed',
      });
      return { success: true, order: adopted, officialId: adopted.id, officialNumber: adopted.orderNumber, adopted: true };
    }
    return { success: false, order: persisted, error: 'Backend did not return an official sales order' };
  } catch (err: any) {
    return { success: false, order: persisted, error: err?.message || String(err) };
  }
};

export const migrateLegacyOrders = async (): Promise<MigrationReport> => {
  const migrationId = `orders-migration-${new Date().toISOString().split('T')[0]}`;
  const legacyRows = (await dbService.getAll<any>('orders')) || [];
  const canonical = (await dbService.getAll<SalesOrder>('salesOrders')) || [];
  const canonicalIds = new Set(canonical.map((o) => o.id));

  let migrated = 0;
  let duplicatesSkipped = 0;
  let invalidSkipped = 0;

  for (const row of legacyRows) {
    if (!row?.id) {
      invalidSkipped += 1;
      continue;
    }
    if (canonicalIds.has(row.id)) {
      duplicatesSkipped += 1;
      continue;
    }
    const canonicalized = canonicalizeOrder({ ...row, source: row.source || 'legacy-orders' });
    canonicalized.legacyStatus = row.status;
    await dbService.put('salesOrders', canonicalized);
    canonicalIds.add(row.id);
    migrated += 1;
  }

  const finalCanonical = (await dbService.getAll<SalesOrder>('salesOrders')) || [];
  return {
    migrated,
    duplicatesSkipped,
    invalidSkipped,
    legacyRemaining: legacyRows.length,
    canonicalCount: finalCanonical.length,
    migrationId,
  };
};

export const generateProvisionalOrderId = (existing: any[], prefix = 'SO'): string => {
  return generateNextId(prefix, existing);
};

export const salesOrderService = {
  async create(order: SalesOrder) {
    const canonical = canonicalizeOrder(order);
    const errors = validateOrder(canonical);
    if (errors.length > 0) throw new Error(errors.join('; '));
    await dbService.put('salesOrders', canonical);
    return canonical;
  },

  async update(id: string, patch: Partial<SalesOrder>) {
    const existing = await dbService.get<SalesOrder>('salesOrders', id);
    if (!existing) throw new Error('Not found');

    // Terminal status protection: prevent modifications to Fulfilled/Cancelled/Converted
    // unless the patch itself is a valid transition (e.g. status change through assertCanTransition).
    const existingCanonical = canonicalizeStatus(existing.status);
    const patchStatus = patch.status != null ? canonicalizeStatus(patch.status) : null;
    const isTerminalModification = isTerminalStatus(existingCanonical) && patchStatus === null;
    if (isTerminalModification) {
      throw new Error(`Cannot modify sales order in terminal status: ${existingCanonical}`);
    }

    // Transition guard: if the patch changes status, validate the transition
    if (patchStatus != null && patchStatus !== existingCanonical) {
      assertCanTransition(existingCanonical, patchStatus);
    }

    const updated = canonicalizeOrder({ ...existing, ...patch });
    // Preserve the version from the existing record so the sync layer can carry
    // it as the OCC precondition for the cloud write.
    if (existing.version != null && updated.version == null) {
      updated.version = existing.version;
    }
    await dbService.put('salesOrders', updated);
    return updated;
  },

  async getAll() {
    return (await dbService.getAll<SalesOrder>('salesOrders')) || [];
  },

  async getById(id: string) {
    return await dbService.get<SalesOrder>('salesOrders', id);
  },

  async delete(id: string) {
    await dbService.delete('salesOrders', id);
  },

  async recordPayment(orderId: string, payment: SalesOrderPayment) {
    const existing = await dbService.get<SalesOrder>('salesOrders', orderId);
    if (!existing) throw new Error('Order not found');

    // Terminal status protection: cannot record payment on a Cancelled order
    const existingCanonical = canonicalizeStatus(existing.status);
    if (existingCanonical === 'Cancelled') {
      throw new Error('Cannot record payment on a cancelled sales order');
    }

    const payments = [...(existing.payments || []), payment];
    const paidAmount = Number(existing.paidAmount ?? 0) + Number(payment.amountPaid ?? payment.amount ?? 0);
    const updated = canonicalizeOrder({
      ...existing,
      payments,
      paidAmount,
    });
    // Preserve the version from the existing record for OCC.
    if (existing.version != null && updated.version == null) {
      updated.version = existing.version;
    }
    await dbService.put('salesOrders', updated);
    return updated;
  },

  canTransition,
  assertCanTransition,
  canonicalizeStatus,
  validateOrder,
  normalizeTotals,
  canonicalizeOrder,
  isOfficialNumber,
  applyOfficialNumber,
  markInvoiced,
  buildInvoiceFromOrder,
  assertTenantSafe,
  adoptQuotationRequestAsSalesOrder,
  migrateLegacyOrders,
  generateProvisionalOrderId,
  legacyPaymentStatus,
  isTerminalStatus,
  isCanonicalStatus,
  isProvisionalNumber,
  TERMINAL,
};