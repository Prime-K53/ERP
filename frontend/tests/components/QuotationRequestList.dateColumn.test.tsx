/**
 * Regression: ERP request-list Date column.
 *
 * Live defect (SO-2026-000007): the row rendered "—" because the served DTO
 * carried no created_at at all (stale backend process pre-dating the
 * supabaseRepository.fromSupabaseRow fix). These tests pin the RENDERER
 * contract so the exact UI path is covered end-to-end:
 *
 *   1. order request with created_at     -> real date text, never "—"
 *   2. quotation request with created_at -> real date text, never "—"
 *   3. genuinely missing date            -> "—", never "Invalid Date"
 *   4. PostgREST microsecond format      -> still renders a real date
 *
 * Rendered with react-dom/server so no DOM-testing dependencies are required;
 * formatDate() executes for real during SSR.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ companyConfig: { currencySymbol: 'K' }, user: { role: 'Admin' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/sales-flow/requests', state: null }),
}));

import { QuotationRequestList } from '../../views/sales/components/SalesLists';

const base = {
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  customerNameMap: {} as Record<string, string>,
  viewMode: 'List' as const,
};

const ORDER_REQUEST = {
  id: 'req_1787487730348_1b64283d3acc',
  request_number: 'SO-2026-000007',
  customer_id: 'cust_acme',
  customer_name: 'Acme LTD',
  request_type: 'order',
  status: 'submitted',
  subtotal: 7000,
  items: [{ name: 'Printing', quantity: 7, unitPrice: 1000 }],
  notes: null,
  attachments: [],
  created_at: '2026-08-23T12:00:00.000Z',
};

const QUOTATION_REQUEST = {
  ...ORDER_REQUEST,
  id: 'req_qtr_1',
  request_number: 'QTR-2026-000042',
  request_type: 'quotation',
  created_at: '2026-08-21T09:30:00.000Z',
};

function renderList(rows: any[]): string {
  return renderToStaticMarkup(<QuotationRequestList {...base} data={rows as any} />);
}

describe('QuotationRequestList — Date column contract', () => {
  it('renders the order request date for SO-2026-000007 (not "—")', () => {
    const html = renderList([ORDER_REQUEST]);
    expect(html).toContain('SO-2026-000007');
    expect(html).toContain('Acme LTD');
    expect(html).toContain('>Aug 23, 2026</td>');
    expect(html).not.toContain('Invalid Date');
  });

  it('renders the quotation request date (not "—")', () => {
    const html = renderList([QUOTATION_REQUEST]);
    expect(html).toContain('QTR-2026-000042');
    expect(html).toContain('>Aug 21, 2026</td>');
    expect(html).not.toContain('Invalid Date');
  });

  it('renders "—" in the date cell for a genuinely missing date and never "Invalid Date"', () => {
    const missing = { ...ORDER_REQUEST, created_at: undefined };
    const html = renderList([missing]);
    expect(html).toContain('>—</td>');
    expect(html).not.toContain('>Aug 23, 2026</td>');
    expect(html).not.toContain('Invalid Date');
  });

  it('still renders a real date when a raw PostgREST microsecond timestamp slips through', () => {
    // Exact shape Supabase serves for timestamptz DEFAULT NOW(). Node parses
    // this lenient form; stricter engines do not — the canonical fix lives in
    // backend fromSupabaseRow (see requestDateContract.test.cjs), this pins
    // that the renderer itself tolerates whatever arrives.
    const micro = { ...ORDER_REQUEST, created_at: '2026-08-23T12:22:13.55572+00:00' };
    const html = renderList([micro]);
    expect(html).toContain('>Aug 23, 2026</td>');
    expect(html).not.toContain('Invalid Date');
  });
});
