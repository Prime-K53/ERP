const repo = require('./supabaseRepository.cjs');

function extractTable(sql) {
  const match = String(sql || '').trim().match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
  return match ? match[1] : null;
}

function parseWhere(sql) {
  const trimmed = String(sql || '').trim();
  const whereMatch = trimmed.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|\s+HAVING|$)/is);
  if (!whereMatch) return {};
  const conditions = whereMatch[1].trim();
  if (!conditions) return {};
  const filters = {};
  const pairs = conditions.split(/\s+AND\s+/i);
  for (const pair of pairs) {
    const eqMatch = pair.match(/(\w+)\s*(?:=|!=|<>|>|<|>=|<=)\s*'([^']*)'/i);
    if (eqMatch) filters[eqMatch[1]] = eqMatch[2];
    else {
      const qMatch = pair.match(/(\w+)\s*=\s*\?/);
      if (qMatch) filters[qMatch[1]] = 'eq.?';
    }
  }
  return filters;
}

function parseOrderBy(sql) {
  const match = String(sql || '').trim().match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s+$)/is);
  return match ? match[1].trim() : null;
}

function parseLimit(sql) {
  const match = String(sql || '').trim().match(/LIMIT\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

async function getOne(query, params = []) {
  const table = extractTable(query);
  if (!table) return {};
  if (/COUNT\s*\(\*\)/i.test(query)) {
    const rows = await repo.getAll(table);
    return { count: rows.length };
  }
  if (/SUM\s*\(/i.test(query)) {
    const rows = await repo.getAll(table);
    const colMatch = query.match(/SUM\s*\(\s*(\w+)\s*\)/i);
    const col = colMatch ? colMatch[1] : 'total_amount';
    const total = rows.reduce((sum, r) => sum + Number(r[col] || r.data?.[col] || 0), 0);
    return { [`sum_${col}`]: total, [col.replace(/^total_/, '') || 'total']: total };
  }
  const filters = parseWhere(query);
  const paramKeys = Object.keys(filters);
  if (paramKeys.length > 0 && params.length > 0) {
    const supabaseFilters = {};
    for (let i = 0; i < Math.min(paramKeys.length, params.length); i++) {
      const val = String(params[i]);
      if (val !== '?') {
        supabaseFilters[`data->>${paramKeys[i]}`] = `eq.${val}`;
      }
    }
    const rows = await repo.getAll(table, supabaseFilters);
    return rows[0] || {};
  }
  const rows = await repo.getAll(table);
  return rows[0] || {};
}

async function getAll(query, params = []) {
  const table = extractTable(query);
  if (!table) return [];
  const filters = parseWhere(query);
  const paramKeys = Object.keys(filters);
  const supabaseFilters = {};
  for (let i = 0; i < Math.min(paramKeys.length, params.length); i++) {
    const val = String(params[i]);
    if (val !== '?') {
      supabaseFilters[`data->>${paramKeys[i]}`] = `eq.${val}`;
    }
  }
  const rows = await repo.getAll(table, supabaseFilters);
  const orderBy = parseOrderBy(query);
  if (orderBy) {
    const [field, direction] = orderBy.split(/\s+/);
    rows.sort((a, b) => {
      const aVal = a[field] || a.data?.[field] || '';
      const bVal = b[field] || b.data?.[field] || '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return direction && String(direction).toLowerCase() === 'desc' ? -cmp : cmp;
    });
  }
  const limit = parseLimit(query);
  if (limit) return rows.slice(0, limit);
  return rows;
}

async function run(query, params = [], callback) {
  const table = extractTable(query);
  const trimmed = String(query || '').trim();
  try {
    if (/INSERT\s+INTO/i.test(trimmed)) {
      const id = String(params[0] || `gen_${Date.now()}`);
      const row = { id };
      for (let i = 1; i < params.length; i++) {
        const colMatch = trimmed.match(/\(([^)]+)\)\s*VALUES/i);
        if (colMatch) {
          const cols = colMatch[1].split(',').map(c => c.trim());
          if (i - 1 < cols.length) row[cols[i - 1]] = params[i];
        }
      }
      await repo.upsert(table, row);
      if (callback) callback(null, { lastID: id, changes: 1 });
      return { lastID: id, changes: 1 };
    }
    if (/UPDATE/i.test(trimmed)) {
      const id = String(params[params.length - 1]);
      const row = await repo.getById(table, id);
      if (row) {
        const updates = {};
        const setMatch = trimmed.match(/SET\s+(.+?)\s+WHERE/is);
        if (setMatch) {
          const pairs = setMatch[1].split(',');
          for (let i = 0; i < Math.min(pairs.length, params.length - 1); i++) {
            const colMatch = pairs[i].match(/(\w+)\s*=\s*\?/);
            if (colMatch) updates[colMatch[1]] = params[i];
          }
        }
        await repo.upsert(table, { ...row, ...updates });
      }
      if (callback) callback(null, { changes: 1 });
      return { changes: 1 };
    }
    if (/DELETE\s+FROM/i.test(trimmed)) {
      const id = String(params[0]);
      await repo.softDelete(table, id);
      if (callback) callback(null, { changes: 1 });
      return { changes: 1 };
    }
    if (/BEGIN\s+TRANSACTION/i.test(trimmed)) {
      if (callback) callback(null);
      return {};
    }
    if (/COMMIT/i.test(trimmed)) {
      if (callback) callback(null);
      return {};
    }
    if (callback) callback(null, { changes: 0 });
    return { changes: 0 };
  } catch (err) {
    if (callback) callback(err);
    throw err;
  }
}

function prepare(query) {
  return {
    run: (params) => run(query, params),
    get: (params) => getOne(query, params),
    all: (params) => getAll(query, params),
    finalize: () => {}
  };
}

module.exports = { getOne, getAll, run, prepare, extractTable, parseWhere };
