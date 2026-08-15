import React, { useEffect } from 'react';
import { pdf, Document as RDocument, Page, Text, Font } from '@react-pdf/renderer';
import { PrimeDocument } from './PrimeDocument';
import { initializePrimePdfFonts } from './templateSettings';
import { validateDocumentData, sanitizePdfPayload } from './documentValidation';
import type { DocType } from '../../../../stores/documentStore';
import type { PrimeDocData } from './schemas';

Font.registerHyphenationCallback((word) => [word]);

interface Request {
  type: DocType;
  data: PrimeDocData;
  config?: Record<string, unknown> | null;
}

interface Result {
  success: boolean;
  data?: number[];
  size?: number;
  error?: string;
}

let busy = false;

const workerLog = (event: string, meta?: Record<string, unknown>) => {
  try { console.log('[PDF Worker]', JSON.stringify({ ts: Date.now(), event, ...meta })); } catch {}
};

// ── PDF binary content validation (zero-dependency, no pdfjs) ──
// NOTE: @react-pdf/renderer compresses content streams with FlateDecode.
// Raw bytes cannot be searched for text operators (Tj, TJ) or business labels.
// Only structural properties (page tree) are reliably readable.

const PAGE_PATTERN = /\/Type\s*\/Page(?!s)/g;
const MASK = ['prices', 'customer', 'account', 'identifiers', 'phone', 'email'];

const maskValue = (key: string, val: unknown): unknown => {
  const lower = key.toLowerCase();
  if (MASK.some((m) => lower.includes(m))) return '[REDACTED]';
  return val;
};

const countPages = (bytes: Uint8Array): number => {
  const str = String.fromCharCode(...bytes);
  const matches = str.match(PAGE_PATTERN);
  return matches ? matches.length : 0;
};

const validatePdfContent = (bytes: Uint8Array, type: string, size: number): string | null => {
  const pages = countPages(bytes);
  if (pages === 0) {
    return 'Document rendered with 0 pages — the template may have produced no output';
  }

  // Warning-only: unusually small PDFs (content streams may be tiny for simple docs)
  if (size > 0 && size < 5000 && pages > 0) {
    workerLog('content-warning', { type, size, pages, message: 'Unusually small PDF but has pages — accepted' });
  }

  return null;
};

// ── Serialization diagnostics (debug only) ──

const isDebugMode = (): boolean => {
  try {
    return typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).has('pdf-debug') ||
       localStorage.getItem('pdf_debug') === 'true');
  } catch { return false; }
};

interface SanitizeDiff {
  removedKeys: string[];
  undefinedKeys: string[];
  dateConversions: string[];
}

const diffSanitized = (before: any, after: any, path = ''): SanitizeDiff => {
  const diff: SanitizeDiff = { removedKeys: [], undefinedKeys: [], dateConversions: [] };
  if (typeof before !== 'object' || before === null) return diff;
  if (typeof after !== 'object' || after === null) return diff;

  for (const key of Object.keys(before)) {
    const fullPath = path ? `${path}.${key}` : key;
    const b = before[key];
    const a = after[key];
    if (b === undefined) {
      diff.undefinedKeys.push(fullPath);
    }
    if (a === undefined && b !== undefined) {
      diff.removedKeys.push(fullPath);
    }
    if (b instanceof Date) {
      diff.dateConversions.push(fullPath);
    }
    if (typeof b === 'object' && b !== null && typeof a === 'object' && a !== null) {
      const nested = diffSanitized(b, a, fullPath);
      diff.removedKeys.push(...nested.removedKeys);
      diff.undefinedKeys.push(...nested.undefinedKeys);
      diff.dateConversions.push(...nested.dateConversions);
    }
  }
  return diff;
};

const logSanitizationDiff = (original: any, sanitized: any, type: string) => {
  if (!isDebugMode()) return;
  const diff = diffSanitized(original, sanitized);
  if (diff.removedKeys.length === 0 && diff.undefinedKeys.length === 0 && diff.dateConversions.length === 0) {
    workerLog('sanitize-clean', { documentType: type });
    return;
  }
  workerLog('sanitize-diff', {
    documentType: type,
    removedKeys: diff.removedKeys.map((k) => k.split('.').map((seg) => maskValue(seg, seg)).join('.')),
    undefinedFields: diff.undefinedKeys.map((k) => k.split('.').map((seg) => maskValue(seg, seg)).join('.')),
    dateConversions: diff.dateConversions,
  });
};

// ── Real document self-tests ──

const testRender = async (label: string, doc: React.JSX.Element): Promise<Result> => {
  const blob = await pdf(doc).toBlob();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const structErr = validatePdfStructure(bytes);
  if (structErr) return { success: false, error: `${label}: ${structErr}`, size: bytes.byteLength };
  const contentErr = validatePdfContent(bytes, label, bytes.byteLength);
  if (contentErr) return { success: false, error: `${label}: ${contentErr}`, size: bytes.byteLength };
  workerLog('test-pass', { label, size: bytes.byteLength, pages: countPages(bytes) });
  return { success: true, data: Array.from(bytes), size: bytes.byteLength };
};

const validatePdfStructure = (bytes: Uint8Array): string | null => {
  if (bytes.byteLength < 50) return `PDF file too small (${bytes.byteLength} bytes) — likely corrupt`;
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== '%PDF-') return `Invalid PDF header: "${header}"`;
  const tail = bytes.slice(-50);
  const tailStr = String.fromCharCode(...tail);
  if (!tailStr.includes('%%EOF')) return 'Missing PDF end-of-file marker — document truncated';
  return null;
};

const helloWorldDoc = () => (
  <RDocument>
    <Page size="A4" style={{ padding: 40 }}>
      <Text style={{ fontSize: 12 }}>Prime ERP PDF Worker — Pipeline Test</Text>
    </Page>
  </RDocument>
);

const invoiceTestDoc = () => (
  <RDocument>
    <Page size="A4" style={{ padding: 40 }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 20 }}>INVOICE</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Invoice #: INV-TEST-001</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Client: Test Client Ltd</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Date: 2025-01-15</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Item: A4 Paper × 10 — MWK 15,000.00</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Item: Toner Cartridge × 2 — MWK 12,000.00</Text>
      <Text style={{ fontSize: 10, marginTop: 12, fontWeight: 'bold' }}>Total: MWK 27,000.00</Text>
    </Page>
  </RDocument>
);

const receiptTestDoc = () => (
  <RDocument>
    <Page size="A4" style={{ padding: 40 }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 20 }}>RECEIPT</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Receipt #: RCP-TEST-001</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Customer: Walk-in Client</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Date: 2025-01-15</Text>
      <Text style={{ fontSize: 10, marginBottom: 4 }}>Item: Binding Service × 3 — MWK 4,500.00</Text>
      <Text style={{ fontSize: 10, marginTop: 12, fontWeight: 'bold' }}>Total: MWK 4,500.00</Text>
    </Page>
  </RDocument>
);

// ── Main generation ──

const generate = async (req: Request): Promise<Result> => {
  if (busy) return { success: false, error: 'Worker busy — another generation in progress' };
  busy = true;

  try {
    workerLog('generate-start', { type: req.type });

    // 1. Semantic validation of incoming data
    const validation = validateDocumentData(req.type, req.data);
    if (!validation.valid) {
      workerLog('semantic-validation-failed', { type: req.type, error: validation.error });
      return { success: false, error: validation.error || 'Document data validation failed' };
    }

    // 2. Serialization safety with optional diagnostics
    const originalForDiff = isDebugMode() ? req.data : null;
    const safeData = sanitizePdfPayload(req.data) as PrimeDocData;
    if (originalForDiff) logSanitizationDiff(originalForDiff, safeData, req.type);
    workerLog('payload-sanitized', { type: req.type, keys: Object.keys(safeData).length });

    // 3. Render PDF
    await initializePrimePdfFonts();
    const doc = (
      <PrimeDocument type={req.type} data={safeData} configOverride={req.config as any} />
    );

    workerLog('render-start', { type: req.type });
    const blob = await pdf(doc).toBlob();
    workerLog('blob-received', { type: req.type, size: blob.size });

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 4. Structural validation (header + footer)
    const structErr = validatePdfStructure(bytes);
    if (structErr) {
      workerLog('structural-validation-failed', { type: req.type, error: structErr, size: bytes.byteLength });
      return { success: false, error: structErr, size: bytes.byteLength };
    }

    // 5. Content validation (page count only — text scanning unreliable with compressed streams)
    const contentErr = validatePdfContent(bytes, req.type, bytes.byteLength);
    if (contentErr) {
      workerLog('content-validation-failed', { type: req.type, error: contentErr, size: bytes.byteLength, pages: countPages(bytes) });
      return { success: false, error: contentErr, size: bytes.byteLength };
    }

    workerLog('generate-success', { type: req.type, size: bytes.byteLength, pages: countPages(bytes) });
    return { success: true, data: Array.from(bytes), size: bytes.byteLength };
  } catch (err: any) {
    workerLog('generate-error', { type: req.type, error: err?.message });
    return { success: false, error: err?.message || 'PDF generation failed' };
  } finally {
    busy = false;
  }
};

export const PdfWorker: React.FC = () => {
  useEffect(() => {
    (window as any).__pdfWorkerReady = true;
    (window as any).__pdfWorkerGenerate = generate;
    (window as any).__pdfWorkerTest = async () => {
      const tests = [
        { label: 'Hello World', doc: helloWorldDoc() },
        { label: 'Invoice', doc: invoiceTestDoc() },
        { label: 'Receipt', doc: receiptTestDoc() },
      ];
      const results: string[] = [];
      for (const t of tests) {
        const r = await testRender(t.label, t.doc);
        results.push(r.success
          ? `✓ ${t.label} (${r.size} bytes, ${countPages(new Uint8Array(r.data || []))} pages)`
          : `✗ ${t.label}: ${r.error}`);
      }
      return { success: true, results };
    };
    window.dispatchEvent(new Event('pdf-worker-ready'));

    (window as any).__pdfWorkerTest().then((r: any) => {
      for (const line of r.results) console.log('[PDF Worker]', line);
    });
  }, []);
  return null;
};

export default PdfWorker;
