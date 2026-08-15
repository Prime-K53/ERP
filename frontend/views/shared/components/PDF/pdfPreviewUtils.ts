import { FilePreviewDescriptor } from '../../../../stores/documentStore';
import { localFileStorage } from '../../../../services/localFileStorage';
import { isPdfMimeType } from '../../../../utils/documentPreview';
import { platform } from '../../../../services/platform';

export type PDFPreviewSource = Blob | Uint8Array | ArrayBuffer;

const PDF_HEADER = '%PDF-';
const PDF_HEADER_BYTES = new TextEncoder().encode(PDF_HEADER);
const WINDOWS_PATH = /^[a-zA-Z]:[\\/]/;
const UNC_PATH = /^\\\\/;

export const getPdfErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown PDF error';
  }
};

export const formatPdfSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

export const preparePdfBytes = async (source: PDFPreviewSource, label?: string): Promise<Uint8Array> => {
  if (source instanceof Blob) {
    if (source.size <= 0) {
      throw new Error(`Invalid PDF: blob is empty (0 bytes)`);
    }
    const buffer = await source.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    validatePdfBytes(bytes);
    return bytes;
  }

  if (source instanceof Uint8Array) {
    validatePdfBytes(source);
    return source;
  }

  if (source instanceof ArrayBuffer) {
    const bytes = new Uint8Array(source);
    validatePdfBytes(bytes);
    return bytes;
  }

  throw new Error('Invalid PDF: unsupported source type');
};

const validatePdfBytes = (bytes: Uint8Array): void => {
  if (bytes.byteLength <= 0) {
    throw new Error(`Invalid PDF: file is empty (0 bytes)`);
  }
  const header = bytes.slice(0, PDF_HEADER_BYTES.length);
  const isValid = PDF_HEADER_BYTES.every((b, i) => header[i] === b);
  if (!isValid) {
    const sig = String.fromCharCode(...header);
    throw new Error(`Invalid PDF: missing PDF header (got "${sig || 'empty'}")`);
  }
  const tail = bytes.slice(-50);
  const tailStr = String.fromCharCode(...tail);
  if (!tailStr.includes('%%EOF')) {
    throw new Error('Invalid PDF: missing %%EOF footer — document may be truncated');
  }
};

const resolveFilePath = (value?: string | null): string | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('file://')) {
    try {
      const url = new URL(trimmed);
      const decoded = decodeURIComponent(url.pathname || '');
      if (/^\/[a-zA-Z]:\//.test(decoded)) {
        return decoded.slice(1);
      }
      return decoded;
    } catch {
      return null;
    }
  }

  if (WINDOWS_PATH.test(trimmed) || UNC_PATH.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/') && !/^https?:/i.test(trimmed) && !/^blob:/i.test(trimmed)) {
    return trimmed;
  }

  return null;
};

const getPreviewUrl = (file: FilePreviewDescriptor): string | null =>
  file.sourceUrl || file.downloadUrl || file.publicUrl || null;

export const resolvePdfFilePreviewSource = async (
  file: FilePreviewDescriptor,
  signal?: AbortSignal,
): Promise<PDFPreviewSource> => {
  const declaredMimeType = String(file.mimeType || '').trim();
  const previewUrl = getPreviewUrl(file);

  if (!isPdfMimeType(declaredMimeType, file.fileName, previewUrl || undefined)) {
    throw new Error(`Expected a PDF file but received "${declaredMimeType || 'unknown'}"`);
  }

  if (file.fileId) {
    const blob = await localFileStorage.getBlob(file.fileId);
    if (!blob) {
      throw new Error(`Stored file "${file.fileId}" not found`);
    }
    return blob;
  }

  const fileSystemPath = resolveFilePath(previewUrl);
  if (fileSystemPath && platform.isDesktop) {
    const result = await platform.api.readPdfFile(fileSystemPath);
    if (!result?.success || !result.data) {
      throw new Error(`Failed to read PDF file: ${result?.error || 'unknown error'}`);
    }
    return Uint8Array.from(result.data);
  }

  if (!previewUrl) {
    throw new Error('No file source provided for preview');
  }

  const response = await fetch(previewUrl, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF (${response.status} ${response.statusText})`);
  }

  return response.blob();
};

const sanitizeFileName = (title: string): string => {
  const normalized = String(title || 'document').trim()
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'document';
};

export const downloadPdfSource = async (source: PDFPreviewSource, title: string): Promise<void> => {
  const bytes = await preparePdfBytes(source, `${title} download`);
  const blob = new Blob([bytes instanceof Uint8Array ? bytes.buffer as ArrayBuffer : bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(title)}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
};
