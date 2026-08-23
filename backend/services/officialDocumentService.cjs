/**
 * Official Document Service (portal-facing)
 *
 * Bridges authenticated portal requests to THE authoritative ERP document
 * renderer. The renderer bundle (officialDocument/primeRenderer.cjs) is built
 * from the ERP frontend's own PrimeDocument pipeline — there is exactly ONE
 * document generator in the system; this service only feeds it authoritative
 * ERP records and streams the resulting application/pdf bytes.
 *
 * Security contract enforced by CALLERS (routes/portal.cjs):
 *   - customer identity comes from the portal JWT
 *   - the record is fetched through the existing customer-scoped getters,
 *     so an id belonging to another customer resolves to NOT_FOUND
 */

const path = require('path');
const repo = require('./supabaseRepository.cjs');

let rendererPromise = null;

function loadRenderer() {
  if (!rendererPromise) {
    rendererPromise = Promise.resolve()
      .then(() => require(path.join(__dirname, 'officialDocument', 'primeRenderer.cjs')))
      .then((mod) => {
        const fn = mod.renderOfficialDocumentPdf || mod.default;
        if (typeof fn !== 'function') throw new Error('renderer entrypoint missing');
        return fn;
      })
      .catch((err) => {
        rendererPromise = null; // allow retry after a build/deploy fix
        const error = new Error(`Official document renderer unavailable: ${err.message}`);
        error.code = 'RENDERER_UNAVAILABLE';
        throw error;
      });
  }
  return rendererPromise;
}

async function isRendererAvailable() {
  try { await loadRenderer(); return true; } catch { return false; }
}

/**
 * Company configuration for branding/terms. Read from the cloud settings
 * table when present; otherwise null — the canonical mapper falls back to the
 * same safe placeholders the staff UI uses on a fresh install.
 */
async function getCompanyConfig() {
  try {
    const rows = await repo.getAll('settings', { 'data->>key': 'eq.companyConfig' });
    const row = (rows || [])[0];
    if (row && row.data && row.data.value) {
      return typeof row.data.value === 'string' ? JSON.parse(row.data.value) : row.data.value;
    }
  } catch (_) { /* branding is best-effort */ }
  return null;
}

/**
 * Normalize a stored/mapped ERP record into the shape the canonical document
 * mapper expects (same as what the ERP finance layer feeds its renderer):
 * items[] as an array of {description, quantity, price, total, …} regardless
 * of whether the source spelled them line_items/items_json/name-vs-desc.
 */
function normalizeRecordForRenderer(raw) {
  const record = { ...(raw || {}) };
  let items = Array.isArray(record.items) ? record.items : null;
  if (!items) {
    for (const key of ['line_items', 'lineItems', 'items_json']) {
      const value = record[key];
      if (Array.isArray(value)) { items = value; break; }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) { items = parsed; break; }
        } catch (_) { /* not JSON — skip */ }
      }
    }
  }
  if (!items) items = [];
  record.items = items.map((it) => {
    const quantity = Number(it?.quantity ?? it?.qty ?? 0) || 0;
    const price = Number(it?.price ?? it?.unitPrice ?? it?.unit_price ?? 0) || 0;
    return {
      ...it,
      description: String(it?.description || it?.name || it?.productName || it?.product_name || 'Item'),
      quantity,
      price,
      total: Number(it?.total ?? it?.lineTotal ?? it?.line_total ?? quantity * price) || 0,
    };
  });
  return record;
}

/**
 * Render the OFFICIAL pdf for a record already proven to belong to the
 * requesting customer.
 *
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function renderOfficialPdf({ type, rawData, customers = [] }) {
  const render = await loadRenderer();
  const companyConfig = await getCompanyConfig();
  const buffer = await render({
    type,
    rawData: normalizeRecordForRenderer(rawData),
    companyConfig,
    customers,
  });
  return { buffer, contentType: 'application/pdf' };
}

/** RFC 6266-ish filename for Content-Disposition (ASCII-safe). */
function buildContentDisposition(filename) {
  const safe = String(filename || 'document.pdf')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'document.pdf';
  if (!/\.pdf$/i.test(safe)) return `attachment; filename="${safe}.pdf"`;
  return `attachment; filename="${safe}"`;
}

module.exports = {
  loadRenderer,
  isRendererAvailable,
  getCompanyConfig,
  renderOfficialPdf,
  buildContentDisposition,
};
