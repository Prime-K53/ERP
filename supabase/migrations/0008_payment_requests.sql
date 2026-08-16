-- ============================================================================
-- 0008_payment_requests.sql
-- Customer payment requests (bank-transfer intentions) — NON-ACCOUNTING entity.
--
-- Purpose:
--   Customers cannot pay through the portal. When a customer wants to pay an
--   invoice by bank transfer they submit a PAYMENT REQUEST — a communication /
--   workflow record only. It MUST NOT create a customer_payments row, a
--   payment allocation, an accounting entry, or modify the invoice
--   (paidAmount / status / totals). ERP staff review the request, then record
--   the REAL accounting payment later through the existing customer-payment /
--   allocation workflow, after verifying the bank receipt.
--
--   A payment request is therefore workflow data only. It carries the same
--   JSONB-envelope contract as every other portal lifecycle table
--   (0001 / 0005 / 0006 / 0007): { id TEXT PK, data JSONB, created_at,
--   updated_at, version }. Domain fields are stored inside `data` and are
--   filtered with `data->>` PostgREST predicates (backend SQL→REST shim).
--
--   Domain fields written by the backend (paymentRequestService):
--     id, request_number (PAYREQ-YYYY-######), customer_id, customer_name,
--     invoice_id, invoice_number, requested_amount, payment_method
--     ('Bank Transfer'), status (requested | under_review | confirmed |
--     rejected | cancelled), note, requested_at, created_by,
--     assigned_to, reviewed_by, reviewed_at, admin_notes, linked_payment_id.
--
-- RLS design (single-company, no tenant_id, no multi-tenancy):
--   Rows are customer-owned (customer_id on every row). The table gets a
--   customer-isolation policy using the 0001/0007 portal-table convention:
--       data->>'customer_id' = (SELECT customer_id FROM public.portal_users
--                                WHERE id = auth.uid()::text)
--   No `USING (true)` policies. Portal customers authenticate via the ERP
--   backend (HS256 JWT) and never reach PostgREST directly; the policy is
--   defense-in-depth. Backend/service-role operations (portal + admin APIs)
--   bypass RLS and remain fully functional.
--
-- No foreign keys: the ERP envelope architecture does not use DB-level FKs
-- for document relationships (invoice_id is a logical reference in JSONB).
-- ============================================================================

-- ─── 1. TABLE CREATION (idempotent, envelope contract) ─────────────────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- ─── 2. INDEXES (cover every PostgREST `data->>` filter the app sends) ─────
CREATE INDEX IF NOT EXISTS idx_payment_requests_customer ON public.payment_requests ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_payment_requests_invoice_status ON public.payment_requests ((data->>'invoice_id'), (data->>'status'));
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON public.payment_requests ((data->>'status'));

-- ─── 3. updated_at TRIGGER (mirrors 0001 section-3 pattern) ────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['payment_requests']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            t
        );
    END LOOP;
END $$;

-- ─── 4. RLS — customer isolation (customer-owned table) ────────────────────
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_requests_customer_isolation" ON public.payment_requests;
CREATE POLICY "payment_requests_customer_isolation" ON public.payment_requests
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

-- ─── 5. REALTIME PUBLICATION MEMBERSHIP (idempotent) ───────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['payment_requests']
        LOOP
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            EXCEPTION WHEN duplicate_object THEN
                NULL;
            END;
        END LOOP;
    END IF;
END $$;

-- ============================================================================
-- End of 0008
-- ============================================================================
