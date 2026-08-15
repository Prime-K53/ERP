-- ============================================================================
-- 0007_portal_lifecycle_tables.sql
-- Portal document-lifecycle tables (schema drift repair).
--
-- Purpose (derived from docs/SASA_PHASE_5_DATABASE_READINESS.md):
--   The application references five lifecycle tables that exist in the
--   backend SQLite schema (backend/db.cjs L2217–L2294) but are missing from
--   the migration chain AND from the live database (read-only probes:
--   HTTP 404 for all five). Writes currently fail silently; reads return [].
--
--   All five are written and read exclusively through the backend SQL→REST
--   shim (portalLifecycleService runQuery/getAll, workflowEngine), which
--   stores every domain field inside the `data` JSONB envelope and filters
--   with `data->>` PostgREST predicates (shimFilter in
--   portalLifecycleService.cjs; the tables are NOT in FLAT_SHIM_TABLES).
--   The row contract is therefore exactly:
--     { id TEXT PK, data JSONB, created_at, updated_at, version }
--   consistent with 0001 / 0005 / 0006.
--
-- RLS design (single-company, no tenant_id, no multi-tenancy):
--   All five tables carry customer_id in every row written by the backend
--   (addTimeline/recordDownload/createVersionSnapshot/recordSignature/
--   addComment all persist `customer_id`). They are customer-owned, so each
--   gets a customer-isolation policy using the 0001 portal-table convention:
--       data->>'customer_id' = (SELECT customer_id FROM public.portal_users
--                                WHERE id = auth.uid()::text)
--   No `USING (true)` policies. Portal customers authenticate via the ERP
--   backend (HS256 JWT) and never reach PostgREST directly; the policy is
--   defense-in-depth that scopes any Supabase-authenticated identity to its
--   own customer_id. Backend/service-role operations bypass RLS and remain
--   fully functional (ERP staff, admin portal endpoints).
--
-- No foreign keys: the ERP envelope architecture does not use DB-level FKs
-- for document relationships (doc_type/doc_id are logical references stored
-- in JSONB). See docs/SASA_PHASE_6_DATABASE_MIGRATIONS.md §9.
-- ============================================================================

-- ─── 1. TABLE CREATION (idempotent, envelope contract) ─────────────────────

-- portal_timeline_events — merged chronological timeline per document.
-- Fields written (addTimeline): customer_id, doc_type, doc_id, event_type,
-- title, description, actor_type, actor_id, actor_name, metadata (JSONB).
CREATE TABLE IF NOT EXISTS public.portal_timeline_events (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- portal_downloads — download audit trail + analytics counters.
-- Fields written (recordDownload): customer_id, portal_user_id, doc_type,
-- doc_id, doc_number, ip_address, user_agent.
CREATE TABLE IF NOT EXISTS public.portal_downloads (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- document_versions — immutable point-in-time snapshots.
-- Fields written (workflowEngine.createVersionSnapshot): customer_id,
-- doc_type, doc_id, version, snapshot (JSON string), reason, created_by,
-- created_by_name.
CREATE TABLE IF NOT EXISTS public.document_versions (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- document_signatures — decision trail (accepted / rejected / revision).
-- Fields written (recordSignature): customer_id, doc_type, doc_id, decision,
-- signed_by, signer_name, signer_email, note, ip_address, user_agent.
CREATE TABLE IF NOT EXISTS public.document_signatures (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- document_comments — threaded discussions (customer/internal visibility).
-- Fields written (addComment): customer_id, doc_type, doc_id, author_type,
-- author_id, author_name, visibility ('customer'|'internal'), body.
CREATE TABLE IF NOT EXISTS public.document_comments (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

-- ─── 2. INDEXES (cover every PostgREST `data->>` filter the app sends) ─────

CREATE INDEX IF NOT EXISTS idx_timeline_doc      ON public.portal_timeline_events ((data->>'doc_type'), (data->>'doc_id'));
CREATE INDEX IF NOT EXISTS idx_timeline_customer ON public.portal_timeline_events ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_timeline_event    ON public.portal_timeline_events ((data->>'event_type'));
CREATE INDEX IF NOT EXISTS idx_timeline_created  ON public.portal_timeline_events (created_at);

CREATE INDEX IF NOT EXISTS idx_portal_downloads_doc      ON public.portal_downloads ((data->>'doc_type'), (data->>'doc_id'));
CREATE INDEX IF NOT EXISTS idx_portal_downloads_customer ON public.portal_downloads ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_portal_downloads_created  ON public.portal_downloads (created_at);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc      ON public.document_versions ((data->>'doc_type'), (data->>'doc_id'), (data->>'version'));
CREATE INDEX IF NOT EXISTS idx_document_versions_customer ON public.document_versions ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_document_versions_created  ON public.document_versions (created_at);

CREATE INDEX IF NOT EXISTS idx_document_signatures_doc      ON public.document_signatures ((data->>'doc_type'), (data->>'doc_id'));
CREATE INDEX IF NOT EXISTS idx_document_signatures_customer ON public.document_signatures ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_document_signatures_created  ON public.document_signatures (created_at);

CREATE INDEX IF NOT EXISTS idx_document_comments_doc      ON public.document_comments ((data->>'doc_type'), (data->>'doc_id'));
CREATE INDEX IF NOT EXISTS idx_document_comments_customer ON public.document_comments ((data->>'customer_id'));
CREATE INDEX IF NOT EXISTS idx_document_comments_visibility ON public.document_comments ((data->>'visibility'));
CREATE INDEX IF NOT EXISTS idx_document_comments_created  ON public.document_comments (created_at);

-- ─── 3. updated_at TRIGGERS (mirrors 0001 section-3 pattern) ───────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'portal_timeline_events','portal_downloads','document_versions',
        'document_signatures','document_comments'
    ]
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON public.%I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
            t
        );
    END LOOP;
END $$;

-- ─── 4. RLS — customer isolation (all five tables are customer-owned) ──────
-- Pattern identical to 0001 portal tables and 0006 referral tables.

ALTER TABLE public.portal_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_downloads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_comments      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_timeline_events_customer_isolation" ON public.portal_timeline_events;
CREATE POLICY "portal_timeline_events_customer_isolation" ON public.portal_timeline_events
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "portal_downloads_customer_isolation" ON public.portal_downloads;
CREATE POLICY "portal_downloads_customer_isolation" ON public.portal_downloads
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "document_versions_customer_isolation" ON public.document_versions;
CREATE POLICY "document_versions_customer_isolation" ON public.document_versions
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "document_signatures_customer_isolation" ON public.document_signatures;
CREATE POLICY "document_signatures_customer_isolation" ON public.document_signatures
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

DROP POLICY IF EXISTS "document_comments_customer_isolation" ON public.document_comments;
CREATE POLICY "document_comments_customer_isolation" ON public.document_comments
  FOR ALL TO authenticated
  USING (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text))
  WITH CHECK (data->>'customer_id' = (SELECT customer_id FROM public.portal_users WHERE id = auth.uid()::text));

-- ─── 5. REALTIME PUBLICATION MEMBERSHIP (idempotent) ───────────────────────
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY[
            'portal_timeline_events','portal_downloads','document_versions',
            'document_signatures','document_comments'
        ]
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
-- End of 0007
-- ============================================================================
