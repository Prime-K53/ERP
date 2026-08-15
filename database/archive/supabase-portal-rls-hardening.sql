-- ============================================================================
-- Portal RLS Hardening — Prime ERP
-- Run AFTER supabase-payment-allocation-tables.sql and supabase-portal-tables.sql
--
-- Adds customer-scoped RLS policies to:
--   - payment_allocations, payment_allocation_lines (NO RLS was defined)
--   - portal_tickets, portal_ticket_messages, ticket_attachments (permissive USING(true))
--   - portal_notifications (missing from original hardening)
--
-- Defense in depth: backend authorization + Supabase RLS
--
-- NOTES for this codebase's current schema:
--   * profiles.company_id no longer exists (dropped by the single-company
--     migration _FIX_SYNC_ISSUES), so tenant checks are expressed as
--     "the caller has an own profile row" (profiles.user_id = auth.uid()::text).
--   * profiles.id is a uuid5-derived profile id, NOT the auth uid — the
--     correct join is profiles.user_id.
--   * auth.uid() is uuid; all entity id columns here are TEXT, so every
--     uid comparison uses auth.uid()::text.
--   * portal_tickets / portal_ticket_messages / ticket_attachments /
--     portal_notifications mirror backend/db.cjs (SQLite) so the cloud
--     backend (supabaseRepository.cjs / portalService.cjs) can use them.
-- ============================================================================

-- ─── 0. Ensure referenced tables exist (mirror of backend/db.cjs) ───────────
CREATE TABLE IF NOT EXISTS public.portal_tickets (
    id TEXT PRIMARY KEY,
    portal_user_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_tickets_user FOREIGN KEY (portal_user_id) REFERENCES public.portal_users (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_tickets_user ON public.portal_tickets (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_tickets_status ON public.portal_tickets (status);

CREATE TABLE IF NOT EXISTS public.portal_ticket_messages (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES public.portal_tickets (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_ticket_messages_ticket ON public.portal_ticket_messages (ticket_id);

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    message_id TEXT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES public.portal_tickets (id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_attachments_message FOREIGN KEY (message_id) REFERENCES public.portal_ticket_messages (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_message ON public.ticket_attachments (message_id);

CREATE TABLE IF NOT EXISTS public.portal_notifications (
    id TEXT PRIMARY KEY,
    portal_user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_notifications_user FOREIGN KEY (portal_user_id) REFERENCES public.portal_users (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_user ON public.portal_notifications (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_read ON public.portal_notifications (portal_user_id, is_read);

-- ─── payment_allocations ─────────────────────────────────────────────────────
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_allocations_tenant_isolation" ON public.payment_allocations;
CREATE POLICY "payment_allocations_tenant_isolation"
    ON public.payment_allocations
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text)
    );

-- ─── payment_allocation_lines ────────────────────────────────────────────────
ALTER TABLE public.payment_allocation_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_allocation_lines_tenant_isolation" ON public.payment_allocation_lines;
CREATE POLICY "payment_allocation_lines_tenant_isolation"
    ON public.payment_allocation_lines
    FOR ALL
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()::text)
    );

-- ─── portal_tickets ──────────────────────────────────────────────────────────
-- Replace permissive USING(true) with customer-scoped policy
ALTER TABLE public.portal_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Portal auth: manage portal_users" ON public.portal_tickets;
DROP POLICY IF EXISTS "portal_tickets_customer_isolation" ON public.portal_tickets;
CREATE POLICY "portal_tickets_customer_isolation"
    ON public.portal_tickets
    FOR ALL
    TO authenticated
    USING (
        customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
    )
    WITH CHECK (
        customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
    );

-- ─── portal_ticket_messages ──────────────────────────────────────────────────
ALTER TABLE public.portal_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_ticket_messages_customer_isolation" ON public.portal_ticket_messages;
CREATE POLICY "portal_ticket_messages_customer_isolation"
    ON public.portal_ticket_messages
    FOR ALL
    TO authenticated
    USING (
        ticket_id IN (
            SELECT id FROM public.portal_tickets
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    )
    WITH CHECK (
        ticket_id IN (
            SELECT id FROM public.portal_tickets
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    );

-- ─── ticket_attachments ──────────────────────────────────────────────────────
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ticket_attachments_customer_isolation" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments_customer_isolation"
    ON public.ticket_attachments
    FOR ALL
    TO authenticated
    USING (
        ticket_id IN (
            SELECT id FROM public.portal_tickets
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    )
    WITH CHECK (
        ticket_id IN (
            SELECT id FROM public.portal_tickets
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    );

-- ─── portal_notifications ────────────────────────────────────────────────────
ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_notifications_customer_isolation" ON public.portal_notifications;
CREATE POLICY "portal_notifications_customer_isolation"
    ON public.portal_notifications
    FOR ALL
    TO authenticated
    USING (
        portal_user_id IN (
            SELECT id FROM public.portal_users
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    )
    WITH CHECK (
        portal_user_id IN (
            SELECT id FROM public.portal_users
            WHERE customer_id = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text)
        )
    );

-- ============================================================================
-- End of migration
-- ============================================================================
