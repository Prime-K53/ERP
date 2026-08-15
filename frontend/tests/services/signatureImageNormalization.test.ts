import { describe, expect, it } from 'vitest';
import {
  MAX_SIGNATURE_UPLOAD_SIZE_BYTES,
  inferSignatureInputMode,
  normalizeSignatureDataUrl,
  resolveSignatureDataUrl,
  validateSignatureUploadFile
} from '../../utils/signatureUtils';

describe('signatureUtils normalization', () => {
  it('accepts valid image data URLs and trims whitespace', () => {
    const normalized = normalizeSignatureDataUrl('  data:image/png;base64,AAA111  ');
    expect(normalized).toBe('data:image/png;base64,AAA111');
  });

  it('resolves signatureDataUrl first, then legacy signature fallback', () => {
    const fromPrimary = resolveSignatureDataUrl({
      signatureDataUrl: 'data:image/png;base64,PRIMARY',
      signature: 'data:image/png;base64,LEGACY'
    });
    const fromLegacy = resolveSignatureDataUrl({
      signature: 'data:image/png;base64,LEGACY_ONLY'
    });

    expect(fromPrimary).toBe('data:image/png;base64,PRIMARY');
    expect(fromLegacy).toBe('data:image/png;base64,LEGACY_ONLY');
  });

  it('infers upload mode for stored signature payloads', () => {
    expect(inferSignatureInputMode(undefined, 'data:image/png;base64,AAA')).toBe('Upload');
    expect(inferSignatureInputMode('Draw', 'data:image/png;base64,AAA')).toBe('Draw');
  });

  it('validates upload size and mime type constraints', () => {
    expect(validateSignatureUploadFile({ size: 1024, type: 'image/png' })).toBeNull();
    expect(validateSignatureUploadFile({ size: MAX_SIGNATURE_UPLOAD_SIZE_BYTES + 1, type: 'image/png' })).toContain('5MB');
    expect(validateSignatureUploadFile({ size: 100, type: 'application/pdf' })).toContain('PNG, JPG, or WEBP');
  });
});
