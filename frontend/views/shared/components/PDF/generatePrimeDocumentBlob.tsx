import React from 'react';
import { pdf } from '@react-pdf/renderer';
import type { DocType } from '../../../../stores/documentStore';
import { PrimeDocument } from './PrimeDocument';
import type { PrimeDocData } from './schemas';
import type { CompanyConfig } from '../../../../types';
import { initializePrimePdfFonts } from './templateSettings';
import { platform } from '../../../../services/platform';
import { isPdfDebugLoggingEnabled } from '../../../../utils/debugFlags';

export const DEFAULT_PDF_TIMEOUT_MS = 45000;
const MIN_VALID_SIZE = 10240;
const MAX_ITEM_WARN = 500;
const PDF_HEADER = '%PDF-';
const pdfDebugLoggingEnabled = isPdfDebugLoggingEnabled();

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

const pdfLog = (event: string, meta?: Record<string, unknown>) => {
  if (!pdfDebugLoggingEnabled) return;
  const entry = { ts: Date.now(), event, ...meta };
  if (platform.isDesktop) {
    platform.api.log({ message: `[PDF Gen] ${event}`, ...meta });
  }
  console.log('[PDF Gen]', JSON.stringify(entry));
};

const withTimeout = async <T,>(op: Promise<T>, ms: number, label: string): Promise<T> => {
  let id = 0;
  const timeout = new Promise<T>((_, rej) => {
    id = window.setTimeout(() => rej(new Error(`${label} timed out (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([op, timeout]);
  } finally {
    window.clearTimeout(id);
  }
};

const validateBlob = (blob: Blob, type: DocType): void => {
  const { size } = blob;
  if (size <= 0) throw new Error(`Generated PDF is empty (0 bytes) for ${type}`);
  if (blob.type && blob.type !== 'application/pdf') {
    throw new Error(`Unexpected MIME type "${blob.type}" for ${type}`);
  }
  if (size < MIN_VALID_SIZE && type !== 'FISCAL_REPORT') {
    pdfLog('small-pdf-warning', { type, size, minExpected: MIN_VALID_SIZE });
  }
};

const verifyHeader = async (blob: Blob): Promise<void> => {
  const headerBytes = await blob.slice(0, PDF_HEADER.length).arrayBuffer();
  const header = new TextDecoder().decode(headerBytes);
  if (!header.startsWith(PDF_HEADER)) {
    throw new Error(`Invalid PDF header "${header}". Expected "${PDF_HEADER}"`);
  }
};

export const generatePrimeDocumentBlob = async (
  type: DocType,
  data: PrimeDocData,
  config?: CompanyConfig | null,
  timeoutMs = DEFAULT_PDF_TIMEOUT_MS,
): Promise<Blob> => {
  const d = data as { items?: unknown[] };
  const itemCount = Array.isArray(d.items) ? d.items.length : 0;
  pdfLog('start', { type, itemCount, timeoutMs });

  await initializePrimePdfFonts();

  if (itemCount > MAX_ITEM_WARN) {
    pdfLog('large-document', { type, itemCount });
    await yieldToUi();
  }

  const doc = <PrimeDocument type={type} data={data} configOverride={config ?? null} />;

  await yieldToUi();

  const start = performance.now();
  let blob: Blob;

  try {
    blob = await withTimeout(
      pdf(doc).toBlob(),
      timeoutMs,
      `PDF generation (${type})`,
    );
  } catch (err: any) {
    pdfLog('generation-failed', { type, error: err.message, itemCount });
    throw err;
  }

  const duration = Math.round(performance.now() - start);
  pdfLog('blob-received', { type, size: blob.size, durationMs: duration });

  try {
    await verifyHeader(blob);
    validateBlob(blob, type);
    pdfLog('validation-passed', { type, size: blob.size, durationMs: duration });
  } catch (err: any) {
    pdfLog('validation-failed', { type, error: err.message, durationMs: duration });
    throw err;
  }

  return blob;
};
