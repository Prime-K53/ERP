# Tauri-ERP

<div align="center">
<img width="1200" height="475" alt="Prime ERP" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Prime ERP

A full-stack offline-capable ERP system for printing businesses — built with React (TypeScript) + Node.js + SQLite.

---

## Run Locally

**Prerequisites:** Node.js ≥ 18

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Start backend (port 5002)
cd backend && node index.cjs

# Start frontend (port 5173 in a separate terminal)
cd frontend && npm run dev
```

---

## Settings — Override Profit Margin

### Overview

Prime ERP implements a **three-level profit margin override system** that lets authorised users (Admin or Finance Manager) set, adjust, and soft-delete margin rules at different scopes without ever breaking lower-priority defaults.

---

### Override Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                  EFFECTIVE MARGIN RESOLUTION            │
│                                                         │
│  1. LINE-ITEM override  ← highest priority              │
│     Applies to a single product/SKU                     │
│           │                                             │
│           ▼  (if no line-item override found)           │
│  2. CATEGORY override                                   │
│     Applies to all products in a category               │
│           │                                             │
│           ▼  (if no category override found)            │
│  3. GLOBAL default                                      │
│     Applies to everything else                          │
│           │                                             │
│           ▼  (if no global setting exists)              │
│  4. SYSTEM FALLBACK  → 0% (no markup)                   │
└─────────────────────────────────────────────────────────┘
```

**Rule:** A more-specific scope always takes precedence over a less-specific scope. Deleting an override at any level causes the system to **revert to the next level** automatically — overrides are soft-deleted (`deleted_at` timestamp) so the full history is preserved.

---

### Data Model

| Column | Type | Description |
|---|---|---|
| `id` | UUID (TEXT PK) | Unique identifier |
| `scope` | ENUM | `global`, `category`, or `line_item` |
| `scope_ref_id` | TEXT nullable | Category ID or SKU (NULL for global) |
| `margin_type` | ENUM | `percentage` or `fixed_amount` |
| `margin_value` | REAL | 0–100 for %, ≥ 0 for fixed |
| `is_active` | INTEGER | 1 = active, 0 = suspended |
| `reason` | TEXT nullable | Audit note |
| `created_by` | TEXT | User ID who created the rule |
| `created_at` | DATETIME | Creation timestamp |
| `updated_at` | DATETIME | Last modification timestamp |
| `deleted_at` | DATETIME nullable | Soft-delete timestamp (NULL = live) |

---

### Business Rules

- **Precedence**: `line_item` → `category` → `global` → system default (0%)
- **Percentage bounds**: `0.00 ≤ value ≤ 100.00`
- **Fixed amount bounds**: `value ≥ 0`
- **Permissions**: Only `Admin` or `Finance Manager` roles may create, edit, or delete overrides
- **Conflict**: Creating a second active override for the same `scope_ref_id` returns HTTP `409`
- **Deletion**: All deletes are soft-deletes — the record's `deleted_at` is set; the record is never physically removed
- **Audit trail**: Every create, update, and delete is written to `profit_margin_audit_logs`

---

### API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings/profit-margins` | Any authenticated | List all (filter by `?scope=`) |
| `GET` | `/api/settings/profit-margins/resolve` | Any authenticated | Resolve effective margin for `?lineItemId=&categoryId=` |
| `GET` | `/api/settings/profit-margins/audit-log` | Any authenticated | Paginated audit history |
| `GET` | `/api/settings/profit-margins/:id` | Any authenticated | Single record |
| `POST` | `/api/settings/profit-margins` | Admin / Finance Manager | Create override |
| `PATCH` | `/api/settings/profit-margins/:id` | Admin / Finance Manager | Update override |
| `DELETE` | `/api/settings/profit-margins/:id` | Admin / Finance Manager | Soft-delete override |
| `POST` | `/api/settings/profit-margins/bulk-upload` | Admin / Finance Manager | CSV bulk import |

---

### Using `getEffectiveMargin` in Pricing Calculations

```ts
import { getEffectiveMargin, applyMargin, getSellingPrice } from '../utils/getEffectiveMargin';

// Resolve margin from API (cached per {lineItemId, categoryId} pair)
const margin = await getEffectiveMargin('SKU-001', 'CAT-PAPER');
// → { margin_value: 35, margin_type: 'percentage', source: 'line_item' }

// Apply it to a cost
const sellingPrice = applyMargin(1000, margin); // → 1350

// Or in one step
const { sellingPrice, margin: m } = await getSellingPrice(1000, 'SKU-001', 'CAT-PAPER');
```

The utility resolves the correct override from the API, falls back gracefully to `0%` on network/auth errors, and caches results in-memory for the duration of the session.

---

### UI Location

Navigate to: **Settings → Pricing → Profit Margins**

The page is split into three sections and an audit tab:

| Section | Description |
|---|---|
| **Global Default** | Inline edit with confirmation dialog |
| **Category Overrides** | Table with add/edit/toggle/delete actions |
| **Line-Item Overrides** | Searchable table + CSV bulk upload |
| **Audit Log** | Filterable (date, user, scope) + CSV export |

---

### Running Tests

```bash
# Unit tests — getEffectiveMargin precedence + validation
cd backend && npx jest tests/profitMargin.unit.test.js

# Integration tests — all API endpoints
cd backend && npx jest tests/profitMargin.integration.test.js
```

---

## Production Deployment (Frontend + Domain)

### Architecture

- **Frontend:** React/Vite SPA — deployed to **Vercel** (or Netlify).
- **Backend API:** Node.js/Express — deployed separately (e.g. Render).
- **Database:** SQLite locally, Supabase for multi-tenant cloud sync.
- **Routing:** The app is a single React build that serves both the **ERP** and the **Customer Portal**:

  | URL (new) | URL (hash legacy) | App |
  |---|---|---|
  | `https://primeerp.com/login` | `https://primeerp.com/#/login` | ERP Admin Login |
  | `https://primeerp.com/portal/login` | `https://primeerp.com/#/portal/login` | Customer Portal Login |
  | `https://primeerp.com/dashboard` | `https://primeerp.com/#/dashboard` | ERP Dashboard |

- Clean URLs (`/login`, `/portal/login`) are translated to hash routes by a small
  shim in `frontend/index.html`, so refreshes, bookmarks and direct links all work.

### Vercel Deployment

The root `vercel.json` is configured for the monorepo:

- **Framework:** Vite
- **Root directory:** `frontend`
- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Rewrites:** `/api/*` → backend, `/*` → `/index.html` (SPA)

Required env vars in Vercel (Project → Settings → Environment Variables):

```env
VITE_API_URL=https://primebooks-erp.onrender.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_EXAM_BACKEND_URL=https://primebooks-erp.onrender.com
```

See `frontend/.env.example` for all supported variables.

### DNS Setup

> ⚠️ The current `primeerp.com`, `admin.primeerp.com` and `portal.primeerp.com`
> records point to an unrelated IIS server at `124.111.128.152`. They serve
> directory listings, **not** this application. Remove those A records.

**Initial deployment (single domain):**

1. Connect the repo to Vercel and deploy (config above).
2. In Vercel → Project → Settings → Domains, add `primeerp.com` (and `www`).
3. Follow Vercel's DNS instructions at your registrar:
   - Point `A` / `ALIAS` / `CNAME` records to `cname.vercel-dns.com` (or the
     IP Vercel provides).

**Optional subdomains (ERP vs Portal split):**

After the main deployment works, add in Vercel:

| Domain | Routes to |
|---|---|
| `admin.primeerp.com` | `/#/login` (ERP) |
| `portal.primeerp.com` | `/#/portal/login` (Portal) |

The app detects the hostname automatically:

- `portal.primeerp.com` → customer portal login
- `admin.primeerp.com` → ERP login
- anything else → Gateway chooser (`primeerp.com/`)

### Backend CORS

The backend now has a strict production CORS allowlist:

- `https://primeerp.com`
- `https://www.primeerp.com`
- `https://admin.primeerp.com`
- `https://portal.primeerp.com`
- `*.vercel.app`, `*.netlify.app`, localhost/LAN origins (dev)

In production (`NODE_ENV=production`) unknown origins are **rejected** (no
origin echo). Additional origins can be added via the `CORS_ORIGIN`
environment variable (comma-separated) — see `backend/.env.example`.

### Authentication Separation

- **ERP** (`AuthContext`): stores session in `sessionStorage['nexus_user']`.
- **Customer Portal** (`CustomerAuthContext`): stores session in
  `sessionStorage['portal_session']`, calls `/api/portal/*`.

The backend rejects logins from the wrong portal with HTTP 403
(e.g. staff account → portal, customer account → admin). A portal customer
can never access ERP routes and vice-versa.

### Final Verification Checklist

- [ ] DNS: `primeerp.com` points to Vercel (no IIS server response)
- [ ] DNS: old A records to `124.111.128.152` removed
- [ ] HTTPS works (Vercel issues certs automatically)
- [ ] `https://primeerp.com/login` loads ERP login
- [ ] `https://primeerp.com/portal/login` loads customer login
- [ ] Refreshing `/login`, `/portal/login`, `/dashboard` works (no 404)
- [ ] `VITE_API_URL` env var set → API requests reach the backend
- [ ] Portal and ERP sessions stay separate (no company-context leakage)

## License

Proprietary — Prime K53 / Prime ERP. All rights reserved.
# PrimeBooks-ERP
# PrimeBooks-ERP
