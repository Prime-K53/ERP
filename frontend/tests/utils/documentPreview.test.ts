import { describe, expect, it } from 'vitest';
import { inferMimeType, isPdfMimeType, isWordMimeType, isImageMimeType, isStoredFileIdentifier } from '../../utils/documentPreview';

describe('documentPreview utilities', () => {
  describe('inferMimeType', () => {
    it('returns undefined for null input', () => {
      expect(inferMimeType(null, null)).toBeUndefined();
    });
    it('detects PDF from file name', () => {
      expect(inferMimeType('report.pdf')).toBe('application/pdf');
    });
    it('detects docx from file name', () => {
      expect(inferMimeType('report.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
    it('detects doc from file name', () => {
      expect(inferMimeType('report.doc')).toBe('application/msword');
    });
    it('detects images from file name', () => {
      expect(inferMimeType('photo.jpg')).toBe('image/jpeg');
      expect(inferMimeType('photo.png')).toBe('image/png');
      expect(inferMimeType('photo.svg')).toBe('image/svg+xml');
    });
    it('returns undefined for unknown extension', () => {
      expect(inferMimeType('file.xyz')).toBeUndefined();
    });
  });

  describe('isPdfMimeType', () => {
    it('returns true for PDF mime type', () => {
      expect(isPdfMimeType('application/pdf')).toBe(true);
    });
    it('returns false for non-PDF mime type', () => {
      expect(isPdfMimeType('image/png')).toBe(false);
    });
    it('infers PDF from file name when mime type is null', () => {
      expect(isPdfMimeType(null, 'report.pdf')).toBe(true);
    });
  });

  describe('isWordMimeType', () => {
    it('returns true for docx mime type', () => {
      expect(isWordMimeType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    });
    it('returns true for doc mime type', () => {
      expect(isWordMimeType('application/msword')).toBe(true);
    });
    it('returns false for non-word mime type', () => {
      expect(isWordMimeType('application/pdf')).toBe(false);
    });
    it('infers from file name when mime type is null', () => {
      expect(isWordMimeType(null, 'report.docx')).toBe(true);
    });
  });

  describe('isImageMimeType', () => {
    it('returns true for image mime type', () => {
      expect(isImageMimeType('image/jpeg')).toBe(true);
    });
    it('returns false for non-image mime type', () => {
      expect(isImageMimeType('application/pdf')).toBe(false);
    });
    it('infers from file name when mime type is null', () => {
      expect(isImageMimeType(null, 'photo.jpg')).toBe(true);
    });
  });

  describe('isStoredFileIdentifier', () => {
    it('returns true for FILE- prefixed string', () => {
      expect(isStoredFileIdentifier('FILE-abc123')).toBe(true);
    });
    it('returns false for null or undefined', () => {
      expect(isStoredFileIdentifier(null)).toBe(false);
      expect(isStoredFileIdentifier(undefined)).toBe(false);
    });
    it('returns false for non-FILE string', () => {
      expect(isStoredFileIdentifier('abc123')).toBe(false);
    });
  });
});
