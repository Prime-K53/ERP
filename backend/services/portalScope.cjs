/**
 * portalScope.cjs — canonical customer-identity contract for the Customer Portal.
 *
 * The ERP is offline-first: ERP frontend stores are synced verbatim to
 * Supabase `{ id, data }` rows, so `data` carries camelCase fields
 * (`customerId`). Portal lifecycle documents (quotation_requests, generated
 * quotations/sales_orders) are written by the backend SQL→repo shim with
 * snake_case fields (`customer_id`). Tables written by BOTH sources therefore
 * contain both forms and MUST be filtered with an OR (PostgREST `or`), while
 * single-source tables use their one verified key.
 *
 * This module is the single place where that contract lives. React components
 * and portal services must never scatter `data->>customerId` / `data->>customer_id`
 * literals — they call customerFilter(table, customerId).
 */

const CUSTOMER_KEYS = {
  quotation_requests: ['customer_id'], // backend shim only (portalLifecycleService INSERT)
  sales_orders: ['customerId', 'customer_id'], // ERP frontend salesOrders store + backend shim
  customer_payments: ['customerId'], // ERP frontend customerPayments store only
  invoices: ['customerId'], // ERP frontend invoices store only
  quotations: ['customerId', 'customer_id'], // ERP frontend quotations store + backend shim
  customer_referrals: ['customer_id'], // backend referralService only
  referral_rewards: ['customer_id'], // backend referralService only
  delivery_notes: ['customerId'], // ERP frontend deliveryNotes store only
  shipments: ['customerId'], // ERP frontend shipments store only
  sales: ['customerId'], // ERP frontend sales store only
  wallet_transactions: ['customerId'], // ERP frontend walletTransactions store only
  engagement_cashback: ['customerId'], // ERP frontend engagement store only
  engagement_points: ['customerId'], // ERP frontend engagement store only
};

/**
 * Return the PostgREST filter object that scopes `table` to `customerId`.
 * Tables with two verified JSONB keys produce an `or=(...)` clause so
 * historical records written by either source are matched.
 */
function customerFilter(table, customerId) {
  const keys = CUSTOMER_KEYS[table];
  if (!keys || keys.length === 0) return {};
  if (keys.length === 1) return { [`data->>${keys[0]}`]: `eq.${customerId}` };
  return { or: `(${keys.map((k) => `data->>${k}.eq.${customerId}`).join(',')})` };
}

/**
 * Combine a customer scope with additional filters (e.g. status). Additional
 * filters keep their literal key, which PostgREST ANDs with the scope.
 */
function withCustomerScope(table, customerId, filters = {}) {
  return { ...customerFilter(table, customerId), ...filters };
}

module.exports = {
  CUSTOMER_KEYS,
  customerFilter,
  withCustomerScope,
};
