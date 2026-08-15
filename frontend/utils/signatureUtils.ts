import type { SignatureInputMode } from '../types';

export const MAX_SIGNATURE_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

export const SUPPORTED_SIGNATURE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
] as const;

export const normalizeSignatureDataUrl = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) return null;
  if (!trimmed.includes(';base64,')) return null;
  return trimmed;
};

export const resolveSignatureDataUrl = (
  proof?: { signatureDataUrl?: string; signature?: string } | null
): string | null => {
  if (!proof) return null;
  return normalizeSignatureDataUrl(proof.signatureDataUrl) || normalizeSignatureDataUrl(proof.signature) || null;
};

export const inferSignatureInputMode = (
  mode?: string | null,
  signatureDataUrl?: string | null
): SignatureInputMode => {
  if (mode === 'Upload' || mode === 'Draw') return mode;
  return signatureDataUrl ? 'Upload' : 'Draw';
};

export const validateSignatureUploadFile = (
  file?: { size: number; type: string } | null
): string | null => {
  if (!file) return 'Select an image file to upload.';
  if (file.size > MAX_SIGNATURE_UPLOAD_SIZE_BYTES) {
    return 'Signature image must be 5MB or smaller.';
  }

  const fileType = (file.type || '').toLowerCase();
  if (!SUPPORTED_SIGNATURE_MIME_TYPES.includes(fileType as (typeof SUPPORTED_SIGNATURE_MIME_TYPES)[number])) {
    return 'Only PNG, JPG, or WEBP signature files are supported.';
  }

  return null;
};

export const hasSignaturePayload = (
  proof?: { signatureDataUrl?: string; signature?: string } | null
): boolean => Boolean(resolveSignatureDataUrl(proof));
