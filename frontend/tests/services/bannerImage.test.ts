import { describe, it, expect } from 'vitest';
import {
  BANNER_SPEC,
  aspectConformance,
  buildBannerValidation,
  clampPan,
  coverTransform,
  cropRectFromTransform,
  formatBannerBytes,
  isConformantMeta,
  largestFourToOneRegion,
  preparedBannerFile,
  validateBannerFile,
} from '../../services/bannerImage';

const makeFile = (name: string, type: string, size: number): File =>
  new File([new Uint8Array(size)], name, { type });

describe('bannerImage (customer_portal_banner spec)', () => {
  it('declares the canonical spec', () => {
    expect(BANNER_SPEC.bannerType).toBe('customer_portal_banner');
    expect(BANNER_SPEC.targetRatio).toBe(4);
    expect(BANNER_SPEC.recommendedWidth).toBe(1600);
    expect(BANNER_SPEC.recommendedHeight).toBe(400);
    expect(BANNER_SPEC.minWidth).toBe(1200);
    expect(BANNER_SPEC.minHeight).toBe(300);
    expect(BANNER_SPEC.maxBytes).toBe(2 * 1024 * 1024);
    expect(BANNER_SPEC.outputFormat).toBe('webp');
  });

  describe('validateBannerFile', () => {
    it('accepts WebP, JPG and PNG', () => {
      expect(validateBannerFile(makeFile('a.webp', 'image/webp', 100)).ok).toBe(true);
      expect(validateBannerFile(makeFile('a.jpg', 'image/jpeg', 100)).ok).toBe(true);
      expect(validateBannerFile(makeFile('a.png', 'image/png', 100)).ok).toBe(true);
    });

    it('rejects unsupported file types with a clear error', () => {
      const gif = validateBannerFile(makeFile('a.gif', 'image/gif', 100));
      expect(gif.ok).toBe(false);
      expect(gif.code).toBe('TYPE');
      const avif = validateBannerFile(makeFile('a.avif', 'image/avif', 100));
      expect(avif.code).toBe('TYPE');
      const txt = validateBannerFile(makeFile('a.txt', 'text/plain', 100));
      expect(txt.code).toBe('TYPE');
      const pdf = validateBannerFile(makeFile('a.pdf', 'application/pdf', 100));
      expect(pdf.code).toBe('TYPE');
    });

    it('rejects oversized files (> 2 MB)', () => {
      const big = validateBannerFile(makeFile('big.jpg', 'image/jpeg', 2 * 1024 * 1024 + 1));
      expect(big.ok).toBe(false);
      expect(big.code).toBe('SIZE');
    });

    it('accepts a file of exactly 2 MB', () => {
      expect(validateBannerFile(makeFile('ok.jpg', 'image/jpeg', 2 * 1024 * 1024)).ok).toBe(true);
    });

    it('rejects no-file', () => {
      expect(validateBannerFile(null).ok).toBe(false);
    });
  });

  describe('aspectConformance', () => {
    it('recognizes 4:1 sources', () => {
      expect(aspectConformance(1600, 400)).toBe(true);
      expect(aspectConformance(1200, 300)).toBe(true);
      expect(aspectConformance(1920, 480)).toBe(true);
      expect(aspectConformance(2000, 500)).toBe(true);
    });

    it('rejects non-4:1 sources', () => {
      expect(aspectConformance(1600, 600)).toBe(false);
      expect(aspectConformance(1200, 1200)).toBe(false);
      expect(aspectConformance(400, 400)).toBe(false);
      expect(aspectConformance(800, 150)).toBe(false);
    });
  });

  describe('largestFourToOneRegion', () => {
    it('finds the largest 4:1 region without upscaling', () => {
      expect(largestFourToOneRegion(1600, 400)).toEqual({ width: 1600, height: 400 });
      expect(largestFourToOneRegion(1920, 480)).toEqual({ width: 1920, height: 480 });
      expect(largestFourToOneRegion(1600, 600)).toEqual({ width: 1600, height: 400 });
      expect(largestFourToOneRegion(1200, 1200)).toEqual({ width: 1200, height: 300 });
      expect(largestFourToOneRegion(400, 400)).toEqual({ width: 400, height: 100 });
      expect(largestFourToOneRegion(3000, 500)).toEqual({ width: 2000, height: 500 });
      expect(largestFourToOneRegion(0, 0)).toBeNull();
    });
  });

  describe('buildBannerValidation', () => {
    it('accepts exact-recommended 1600 × 400 without cropping', () => {
      const r = buildBannerValidation(1600, 400);
      expect(r.ok).toBe(true);
      expect(r.conformant).toBe(true);
      expect(r.needsCrop).toBe(false);
      expect(r.output).toEqual({ width: 1600, height: 400 });
    });

    it('accepts minimum 1200 × 300 without cropping', () => {
      const r = buildBannerValidation(1200, 300);
      expect(r.ok).toBe(true);
      expect(r.conformant).toBe(true);
    });

    it('accepts larger 4:1 1920 × 480 without cropping', () => {
      const r = buildBannerValidation(1920, 480);
      expect(r.ok).toBe(true);
      expect(r.conformant).toBe(true);
    });

    it('requires a crop for 1600 × 600', () => {
      const r = buildBannerValidation(1600, 600);
      expect(r.ok).toBe(true);
      expect(r.conformant).toBe(false);
      expect(r.needsCrop).toBe(true);
    });

    it('requires a crop for 1200 × 1200', () => {
      const r = buildBannerValidation(1200, 1200);
      expect(r.ok).toBe(true);
      expect(r.needsCrop).toBe(true);
    });

    it('rejects a very small image (400 × 400) with a clear error', () => {
      const r = buildBannerValidation(400, 400);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('SMALL');
      expect(r.error).toMatch(/too small/i);
    });

    it('rejects a very small 4:1 image (1000 × 250)', () => {
      const r = buildBannerValidation(1000, 250);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('SMALL');
    });

    it('rejects 1200 × 299 (below minimum after crop normalization)', () => {
      const r = buildBannerValidation(1200, 299);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('SMALL');
    });
  });

  describe('crop math', () => {
    it('coverTransform fits the window without distortion', () => {
      const t = coverTransform(1200, 1200, 400, 100);
      expect(t.scale).toBeCloseTo(400 / 1200);
      expect(t.panX).toBe(0);
      expect(t.panY).toBe(0);
    });

    it('clampPan keeps the image covering the window', () => {
      // 1000 × 250 at scale 0.4 = 400 × 100 — exactly the window, no pan allowed.
      expect(clampPan(250, 250, 0.4, 1000, 250, 400, 100)).toEqual({ panX: 0, panY: 0 });
      // Zoomed 2× (800 × 200 display) → 200 px of play per axis.
      expect(clampPan(500, -500, 0.8, 1000, 250, 400, 100)).toEqual({ panX: 200, panY: -50 });
    });

    it('cropRectFromTransform maps the window back to source pixels', () => {
      const src = cropRectFromTransform({ scale: 0.5, panX: 0, panY: 0 }, 1200, 1200, 400, 100);
      expect(src.width).toBe(800);
      expect(src.height).toBe(200);
      expect(src.x).toBe(200);
      expect(src.y).toBe(500);
    });

    it('cropRectFromTransform clamps pan to the source bounds', () => {
      const src = cropRectFromTransform({ scale: 0.4, panX: 9999, panY: -9999 }, 1000, 250, 400, 100);
      expect(src.x).toBe(0);
      expect(src.y).toBe(0);
      expect(src.width).toBe(1000);
      expect(src.height).toBe(250);
    });
  });

  describe('metadata helpers', () => {
    it('isConformantMeta accepts 4:1 metadata only', () => {
      expect(isConformantMeta({ bannerType: 'customer_portal_banner', width: 1600, height: 400, aspectRatio: 4, format: 'webp', fileSize: 100 })).toBe(true);
      expect(isConformantMeta({ bannerType: 'customer_portal_banner', width: 1600, height: 600, aspectRatio: 2.67, format: 'webp', fileSize: 100 })).toBe(false);
      expect(isConformantMeta(null)).toBe(false);
      expect(isConformantMeta(undefined)).toBe(false);
    });

    it('formatBannerBytes renders friendly sizes', () => {
      expect(formatBannerBytes(512)).toBe('512 B');
      expect(formatBannerBytes(2048)).toBe('2 KB');
      expect(formatBannerBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
    });

    it('preparedBannerFile is a 2 MB WebP upload', () => {
      const f = preparedBannerFile(new Blob([new Uint8Array(8)], { type: 'image/webp' }));
      expect(f.type).toBe('image/webp');
      expect(f.name).toBe('banner.webp');
    });
  });
});