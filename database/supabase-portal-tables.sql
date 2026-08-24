-- ============================================================================
-- Portal Tables (Customer Portal auth): Prime ERP
-- Run in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Required because backend/services/supabaseRepository.cjs talks to these
-- tables through PostgREST flat-column helpers (portalEntities). Without them,
-- portal user auto-create silently no-ops (404 swallowed) and
-- POST /api/portal/admin/users/:id/regenerate-password 500s with "User not found".
--
-- Schema mirrors the SQLite tables created in backend/db.cjs so local-first and
-- Supabase-backed deployments expose the same columns.
-- ============================================================================

-- ─── portal_users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_users (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'invited')),
    last_login_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_users_customer ON public.portal_users (customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON public.portal_users (email);

-- ─── portal_sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_sessions (
    id TEXT PRIMARY KEY,
    portal_user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_sessions_user FOREIGN KEY (portal_user_id) REFERENCES public.portal_users (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_user ON public.portal_sessions (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON public.portal_sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON public.portal_sessions (expires_at);

-- ─── portal_password_resets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_password_resets (
    id TEXT PRIMARY KEY,
    portal_user_id TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_password_resets_user FOREIGN KEY (portal_user_id) REFERENCES public.portal_users (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_password_resets_user ON public.portal_password_resets (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_password_resets_code ON public.portal_password_resets (code);

-- ─── portal_login_history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_login_history (
    id TEXT PRIMARY KEY,
    portal_user_id TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_portal_login_history_user FOREIGN KEY (portal_user_id) REFERENCES public.portal_users (id)
);

CREATE INDEX IF NOT EXISTS idx_portal_login_history_user ON public.portal_login_history (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_login_history_at ON public.portal_login_history (login_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- The backend writes with the service-role key (bypasses RLS). These policies
-- are kept permissive for the portal/anon clients that read auth tables at
-- runtime, matching the pattern already used for idempotency_keys.
ALTER TABLE public.portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Portal auth: manage portal_users" ON public.portal_users;
CREATE POLICY "Portal auth: manage portal_users"
    ON public.portal_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_sessions" ON public.portal_sessions;
CREATE POLICY "Portal auth: manage portal_sessions"
    ON public.portal_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_password_resets" ON public.portal_password_resets;
CREATE POLICY "Portal auth: manage portal_password_resets"
    ON public.portal_password_resets FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Portal auth: manage portal_login_history" ON public.portal_login_history;
CREATE POLICY "Portal auth: manage portal_login_history"
    ON public.portal_login_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── updated_at triggers ────────────────────────────────────────────────────
-- Same helper as supabase-add-updated-at-triggers.sql (idempotent).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portal_users_updated_at ON public.portal_users;
CREATE TRIGGER trg_portal_users_updated_at BEFORE UPDATE ON public.portal_users
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_portal_sessions_updated_at ON public.portal_sessions;
CREATE TRIGGER trg_portal_sessions_updated_at BEFORE UPDATE ON public.portal_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_portal_password_resets_updated_at ON public.portal_password_resets;
CREATE TRIGGER trg_portal_password_resets_updated_at BEFORE UPDATE ON public.portal_password_resets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_portal_login_history_updated_at ON public.portal_login_history;
CREATE TRIGGER trg_portal_login_history_updated_at BEFORE UPDATE ON public.portal_login_history
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();