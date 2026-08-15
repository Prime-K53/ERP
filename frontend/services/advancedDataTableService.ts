const escapeCsvValue = (value: unknown): string => {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const flattenObject = (obj: unknown, prefix = ''): Record<string, unknown> => {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return { [prefix]: obj };
  }
  if (Array.isArray(obj)) {
    return { [prefix]: JSON.stringify(obj) };
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
};

const getValueByPath = (obj: unknown, path: string): unknown => {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const detectType = (value: unknown): 'string' | 'number' | 'date' | 'boolean' | 'currency' => {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'number';
    return 'currency';
  }
  if (typeof value === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
    if (/^-?\d+\.\d{2}$/.test(value)) return 'currency';
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(value)) return 'date';
    if (/^(true|false)$/i.test(value)) return 'boolean';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return 'date';
  const d = new Date(value as string);
  if (!Number.isNaN(d.getTime()) && typeof value === 'string') return 'date';
  return 'string';
};

export function exportToCsv(data: any[], filename: string, columns?: { key: string; label: string }[]): void {
  if (!data || data.length === 0) return;
  const resolvedColumns = columns ?? Object.keys(flattenObject(data[0])).map(k => ({ key: k, label: k }));
  const header = resolvedColumns.map(c => escapeCsvValue(c.label)).join(',');
  const rows = data.map(item => {
    const flat = flattenObject(item);
    return resolvedColumns.map(c => escapeCsvValue(flat[c.key])).join(',');
  });
  const bom = '\uFEFF';
  const csv = bom + header + '\r\n' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToPdf(data: any[], title: string, columns?: { key: string; label: string }[]): void {
  if (!data || data.length === 0) return;
  const resolvedColumns = columns ?? Object.keys(flattenObject(data[0])).map(k => ({ key: k, label: k }));
  const rows = data.map(item => {
    const flat = flattenObject(item);
    return resolvedColumns.map(c => String(flat[c.key] ?? ''));
  });
  const tableRows = rows.map(r => `<tr>${r.map(c => `<td>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`).join('\n');
  const tableHeader = resolvedColumns.map(c => `<th>${c.label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</th>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { font-size: 18px; margin-bottom: 10px; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
    th { background: #e0e0e0; font-weight: bold; }
    tr:nth-child(even) td { background: #f5f5f5; }
    @media print { body { margin: 0.5in; } }
  </style></head><body><h1>${title}</h1><table><thead><tr>${tableHeader}</tr></thead><tbody>${tableRows}</tbody></table><script>window.print();<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function filterData<T>(data: T[], filters: Record<string, any>): T[] {
  if (!filters || Object.keys(filters).length === 0) return data;
  return data.filter(item => {
    for (const [key, filterValue] of Object.entries(filters)) {
      if (filterValue === null || filterValue === undefined || filterValue === '') continue;
      const itemValue = getValueByPath(item, key);
      if (typeof filterValue === 'object' && !Array.isArray(filterValue)) {
        if ('min' in filterValue || 'max' in filterValue) {
          const num = Number(itemValue);
          if (!isNaN(num)) {
            if (filterValue.min != null && num < Number(filterValue.min)) return false;
            if (filterValue.max != null && num > Number(filterValue.max)) return false;
          }
        }
        if ('start' in filterValue || 'end' in filterValue) {
          const d = itemValue instanceof Date ? itemValue : new Date(String(itemValue ?? ''));
          if (!isNaN(d.getTime())) {
            if (filterValue.start) {
              const start = new Date(filterValue.start);
              if (!isNaN(start.getTime()) && d < start) return false;
            }
            if (filterValue.end) {
              const end = new Date(filterValue.end);
              if (!isNaN(end.getTime()) && d > end) return false;
            }
          }
        }
      } else if (Array.isArray(filterValue)) {
        if (!filterValue.includes(itemValue)) return false;
      } else if (typeof filterValue === 'boolean') {
        if (Boolean(itemValue) !== filterValue) return false;
      } else if (typeof filterValue === 'number') {
        if (Number(itemValue) !== filterValue) return false;
      } else {
        const str = String(itemValue ?? '').toLowerCase();
        if (!str.includes(String(filterValue).toLowerCase())) return false;
      }
    }
    return true;
  });
}

export function paginateData<T>(data: T[], page: number, pageSize: number): {
  data: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalItems = data.length;
  const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;
  const currentPage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (currentPage - 1) * pageSize;
  const paginated = data.slice(start, start + pageSize);
  return {
    data: paginated,
    totalItems,
    totalPages,
    currentPage,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  };
}

export function sortData<T>(data: T[], sortBy: string, sortDirection: 'asc' | 'desc'): T[] {
  if (!sortBy) return data;
  return [...data].sort((a, b) => {
    const valA = getValueByPath(a, sortBy);
    const valB = getValueByPath(b, sortBy);
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    let result = 0;
    const dateA = new Date(String(valA));
    const dateB = new Date(String(valB));
    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
      result = dateA.getTime() - dateB.getTime();
    } else if (typeof valA === 'number' && typeof valB === 'number') {
      result = valA - valB;
    } else {
      result = String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' });
    }
    return sortDirection === 'asc' ? result : -result;
  });
}

export function searchData<T>(data: T[], query: string, searchFields?: string[]): T[] {
  if (!query || !query.trim()) return data;
  const q = query.trim().toLowerCase();
  return data.filter(item => {
    if (searchFields && searchFields.length > 0) {
      return searchFields.some(field => {
        const value = getValueByPath(item, field);
        return value != null && String(value).toLowerCase().includes(q);
      });
    }
    for (const value of Object.values(item as Record<string, unknown>)) {
      if (value != null && typeof value === 'string' && value.toLowerCase().includes(q)) return true;
      if (value != null && typeof value === 'object') {
        const flat = flattenObject(value);
        for (const v of Object.values(flat)) {
          if (v != null && String(v).toLowerCase().includes(q)) return true;
        }
      }
    }
    return false;
  });
}

export function getColumnDefinitions(data: any[]): { key: string; label: string; type: 'string' | 'number' | 'date' | 'boolean' | 'currency'; detected: boolean }[] {
  if (!data || data.length === 0) return [];
  const sample = flattenObject(data[0]);
  const keys = Object.keys(sample);
  const definitions: { key: string; label: string; type: 'string' | 'number' | 'date' | 'boolean' | 'currency'; detected: boolean }[] = [];
  for (const key of keys) {
    const value = sample[key];
    const type = detectType(value);
    definitions.push({
      key,
      label: key,
      type,
      detected: true,
    });
  }
  return definitions;
}

export function aggregateData(
  data: any[],
  groupBy: string,
  aggregates: { field: string; function: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinctCount' }[]
): Record<string, any>[] {
  if (!data || data.length === 0) return [];
  const groups = new Map<string, any[]>();
  for (const item of data) {
    const key = String(getValueByPath(item, groupBy) ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const results: Record<string, any>[] = [];
  for (const [groupKey, groupItems] of groups.entries()) {
    const row: Record<string, any> = { [groupBy]: groupKey };
    for (const agg of aggregates) {
      const values = groupItems.map(i => Number(getValueByPath(i, agg.field))).filter(v => !isNaN(v));
      switch (agg.function) {
        case 'sum':
          row[`${agg.field}_sum`] = values.reduce((s, v) => s + v, 0);
          break;
        case 'avg':
          row[`${agg.field}_avg`] = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
          break;
        case 'count':
          row[`${agg.field}_count`] = groupItems.length;
          break;
        case 'min':
          row[`${agg.field}_min`] = values.length > 0 ? Math.min(...values) : 0;
          break;
        case 'max':
          row[`${agg.field}_max`] = values.length > 0 ? Math.max(...values) : 0;
          break;
        case 'distinctCount':
          row[`${agg.field}_distinctCount`] = new Set(values).size;
          break;
      }
    }
    results.push(row);
  }
  return results;
}

export function pivotData(
  data: any[],
  rows: string[],
  columns: string[],
  values: string,
  aggregateFn: 'sum' | 'avg' | 'count' = 'sum'
): Record<string, any>[] {
  if (!data || data.length === 0) return [];
  const colValues = [...new Set(data.map(item => String(getValueByPath(item, columns[0]) ?? '')))];
  const groups = new Map<string, any[]>();
  for (const item of data) {
    const rowKey = rows.map(r => String(getValueByPath(item, r) ?? '')).join('||');
    if (!groups.has(rowKey)) groups.set(rowKey, []);
    groups.get(rowKey)!.push(item);
  }
  const results: Record<string, any>[] = [];
  for (const [rowKey, groupItems] of groups.entries()) {
    const rowKeys = rowKey.split('||');
    const row: Record<string, any> = {};
    rows.forEach((r, i) => { row[r] = rowKeys[i]; });
    for (const col of colValues) {
      const matching = groupItems.filter(item => String(getValueByPath(item, columns[0]) ?? '') === col);
      const vals = matching.map(i => Number(getValueByPath(i, values))).filter(v => !isNaN(v));
      let result = 0;
      switch (aggregateFn) {
        case 'sum':
          result = vals.reduce((s, v) => s + v, 0);
          break;
        case 'avg':
          result = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
          break;
        case 'count':
          result = matching.length;
          break;
      }
      row[col] = result;
    }
    results.push(row);
  }
  return results;
}
