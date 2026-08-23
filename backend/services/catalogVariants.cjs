/**
 * Catalog variant helpers (shared).
 *
 * Authoritative variant data lives EMBEDDED in each `products` doc
 * (`data.variants[]`, written by the ERP inventory/SmartPricing editor).
 * The separate `product_variants` table is part of the same contract but is
 * not populated by every ERP version, so the catalog must merge BOTH sources.
 *
 * Embedded variants may carry no stable `id`, so the portal contract derives
 * a DETERMINISTIC key: `${productId}::${sku || name || v<index>}`. The SAME
 * derivation is used by the portal catalog endpoint AND by server-side order
 * re-pricing (getCatalogPriceMap), so a customer-selected variant can be
 * priced authoritatively end-to-end. Never invent prices here.
 */

function variantKey(productId, variant, index) {
  const sku = String(variant && variant.sku ? variant.sku : '').trim();
  if (sku) return `${productId}::${sku}`;
  const name = String(variant && variant.name ? variant.name : '').trim();
  if (name) return `${productId}::${name}`;
  return `${productId}::v${index}`;
}

function normalizeEmbeddedVariant(productId, raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim() || null;
  const sku = raw.sku != null && String(raw.sku).trim() !== '' ? String(raw.sku).trim() : null;
  // Price contract: preserve exactly what ERP stores — 0 and null are passed
  // through untouched (0 is a legitimate price; null means "unset upstream").
  const sellingRaw = raw.sellingPrice ?? raw.selling_price ?? raw.price;
  const sellingPrice = sellingRaw === undefined || sellingRaw === null ? null : Number(sellingRaw) || 0;
  const costRaw = raw.costPrice ?? raw.cost_price ?? raw.cost;
  const costPrice = costRaw === undefined || costRaw === null ? null : Number(costRaw) || 0;
  return {
    id: raw.id != null && String(raw.id).trim() !== '' ? String(raw.id) : variantKey(productId, raw, index),
    productId,
    name,
    sku,
    attributes: raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : null,
    sellingPrice,
    costPrice,
    stock: raw.stock == null ? null : Number(raw.stock) || 0,
    active: raw.active !== false,
  };
}

/**
 * Merge embedded doc variants with table rows. Embedded entries win on key
 * collision; ordering follows the authoritative doc, then any table-only rows.
 */
function collectProductVariants(productDoc, tableRows) {
  const merged = new Map();
  const embedded = Array.isArray(productDoc && productDoc.variants) ? productDoc.variants : [];
  embedded.forEach((raw, index) => {
    const v = normalizeEmbeddedVariant(productDoc.id, raw, index);
    if (v) merged.set(v.id, v);
  });
  for (const row of Array.isArray(tableRows) ? tableRows : []) {
    if (!row) continue;
    const v = normalizeEmbeddedVariant(productDoc.id, row, embedded.length + merged.size);
    if (v && !merged.has(v.id)) merged.set(v.id, v);
  }
  return Array.from(merged.values());
}

module.exports = { variantKey, normalizeEmbeddedVariant, collectProductVariants };
