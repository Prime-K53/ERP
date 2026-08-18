// ─── bannerImageService unit tests ───────────────────────────────────────────
// Verifies the customer_portal_banner preparation pipeline: every accepted
// banner becomes an exact 4:1 WebP at 1600 × 400 (never stretched), while
// unsuitable files are rejected with clear errors.

const sharp = require('sharp');
const crypto = require('crypto');
const {
  BANNER_SPEC,
  BannerImageError,
  processBannerImage,
  largestFourToOneRegion,
} = require('../../services/bannerImageService.cjs');

/** Solid-color test image. */
async function makeSolid(width, height, format = 'jpeg', color = { r: 40, g: 120, b: 90 }) {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .toFormat(format)
    .toBuffer();
}

/** Random-noise test image (incompressible → predictable file sizes). */
async function makeNoise(width, height, format = 'png') {
  const data = crypto.randomBytes(width * height * 3);
  return sharp(data, { raw: { width, height, channels: 3 } }).toFormat(format).toBuffer();
}

/** Image with a flat dark top and a noisy bright band at the bottom. */
async function makeBottomContent(width, height, bandHeight) {
  const data = Buffer.alloc(width * height * 3);
  const flatStart = height - bandHeight;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (y >= flatStart) {
        const v = 200 + Math.floor(Math.random() * 56);
        data[i] = v; data[i + 1] = v; data[i + 2] = v;
      } else {
        data[i] = 10; data[i + 1] = 10; data[i + 2] = 10;
      }
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function decodeMean(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  return sum / data.length;
}

describe('bannerImageService (customer_portal_banner)', () => {
  describe('spec', () => {
    it('declares the canonical 4:1 customer portal banner spec', () => {
      expect(BANNER_SPEC.bannerType).toBe('customer_portal_banner');
      expect(BANNER_SPEC.targetRatio).toBe(4);
      expect(BANNER_SPEC.recommendedWidth).toBe(1600);
      expect(BANNER_SPEC.recommendedHeight).toBe(400);
      expect(BANNER_SPEC.minWidth).toBe(1200);
      expect(BANNER_SPEC.minHeight).toBe(300);
      expect(BANNER_SPEC.outputFormat).toBe('webp');
    });

    it('largestFourToOneRegion finds the biggest 4:1 region without upscaling', () => {
      expect(largestFourToOneRegion(1600, 400)).toEqual({ width: 1600, height: 400 });
      expect(largestFourToOneRegion(1920, 480)).toEqual({ width: 1920, height: 480 });
      expect(largestFourToOneRegion(1600, 600)).toEqual({ width: 1600, height: 400 });
      expect(largestFourToOneRegion(1200, 1200)).toEqual({ width: 1200, height: 300 });
      expect(largestFourToOneRegion(400, 400)).toEqual({ width: 400, height: 100 });
      expect(largestFourToOneRegion(400, 120)).toEqual({ width: 400, height: 100 });
    });
  });

  describe('conforming uploads (already 4:1)', () => {
    it.each([
      [1600, 400, '1600 × 400 — exact recommended'],
      [1200, 300, '1200 × 300 — exact minimum'],
      [1920, 480, '1920 × 480 — larger 4:1 downscaled'],
    ])('%s → prepared as exact 4:1 1600 × 400 WebP', async (w, h) => {
      const { buffer, meta } = await processBannerImage(await makeSolid(w, h, 'jpeg'));
      expect(meta.bannerType).toBe('customer_portal_banner');
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(400);
      expect(meta.aspectRatio).toBe(4);
      expect(meta.fileSize).toBe(buffer.length);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.length).toBeLessThanOrEqual(BANNER_SPEC.maxBytes);

      const outMeta = await sharp(buffer).metadata();
      expect(outMeta.format).toBe('webp');
      expect(outMeta.width).toBe(1600);
      expect(outMeta.height).toBe(400);
      // Never stretched: stored asset is exactly 4:1.
      expect(outMeta.width / outMeta.height).toBe(4);
    });
  });

  describe('non-conforming uploads (need a 4:1 crop)', () => {
    it('1600 × 600 (too tall) → cropped to 1600 × 400, never stretched', async () => {
      const { buffer, meta } = await processBannerImage(await makeSolid(1600, 600, 'jpeg'));
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(400);
      expect(meta.aspectRatio).toBe(4);
    });

    it('1200 × 1200 (square) → cropped to 4:1, never stretched', async () => {
      const { buffer, meta } = await processBannerImage(await makeSolid(1200, 1200, 'jpeg'));
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(400);
      expect(meta.aspectRatio).toBe(4);
    });

    it('preserves content: crop window lands on the content band', async () => {
      // Content (bright noisy band) occupies the bottom 300 rows of 1200 × 1200.
      const src = await makeBottomContent(1200, 1200, 300);
      const { buffer } = await processBannerImage(src);
      const mean = await decodeMean(buffer);
      // If the crop window missed the content band we'd get ~10 (flat dark).
      expect(mean).toBeGreaterThan(150);
    });

    it('PNG upload is accepted and converted to WebP', async () => {
      const { buffer, meta } = await processBannerImage(await makeSolid(1600, 400, 'png'));
      expect(meta.format).toBe('webp');
      const outMeta = await sharp(buffer).metadata();
      expect(outMeta.format).toBe('webp');
    });
  });

  describe('rejections with clear feedback', () => {
    it('very small image (400 × 400) → IMAGE_TOO_SMALL', async () => {
      const src = await makeSolid(400, 400, 'jpeg');
      await expect(processBannerImage(src)).rejects.toThrowError(BannerImageError);
      await expect(processBannerImage(src)).rejects.toMatchObject({ code: 'IMAGE_TOO_SMALL' });
    });

    it('very small 4:1 image (1000 × 250) → IMAGE_TOO_SMALL', async () => {
      const src = await makeSolid(1000, 250, 'jpeg');
      await expect(processBannerImage(src)).rejects.toMatchObject({ code: 'IMAGE_TOO_SMALL' });
    });

    it('unsupported file type (GIF) → UNSUPPORTED_TYPE even if renamed', async () => {
      const src = await makeSolid(800, 200, 'gif');
      await expect(processBannerImage(src)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    });

    it('unsupported file type (AVIF) → UNSUPPORTED_TYPE', async () => {
      const src = await makeSolid(800, 200, 'avif');
      await expect(processBannerImage(src)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    });

    it('not an image (text bytes) → INVALID_IMAGE', async () => {
      await expect(processBannerImage(Buffer.from('definitely not an image')))
        .rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    });

    it('oversized file (> 2 MB) → FILE_TOO_LARGE', async () => {
      const src = await makeNoise(1000, 1000, 'png'); // random data ≈ 3 MB
      expect(src.length).toBeGreaterThan(BANNER_SPEC.maxBytes);
      await expect(processBannerImage(src)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    });

    it('empty buffer → NO_IMAGE', async () => {
      await expect(processBannerImage(Buffer.alloc(0))).rejects.toMatchObject({ code: 'NO_IMAGE' });
    });
  });

  describe('orientation handling', () => {
    it('EXIF-rotated source (orientation 6) is normalized to landscape 4:1', async () => {
      // Raw portrait bytes 400 × 1200 tagged orientation 6 → displays as 1200 × 400.
      const data = Buffer.alloc(400 * 1200 * 3);
      for (let y = 0; y < 1200; y++) {
        for (let x = 0; x < 400; x++) {
          const i = (y * 400 + x) * 3;
          data[i] = x < 200 ? 200 : 30; data[i + 1] = 30; data[i + 2] = 30;
        }
      }
      const base = await sharp(data, { raw: { width: 400, height: 1200, channels: 3 } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

      const rawMeta = await sharp(base).metadata();
      expect(rawMeta.width).toBe(400);
      expect(rawMeta.height).toBe(1200);
      expect(rawMeta.orientation).toBe(6);

      const { meta } = await processBannerImage(base);
      expect(meta.width).toBe(1600);
      expect(meta.height).toBe(400);
      expect(meta.aspectRatio).toBe(4);
    });
  });

  describe('never stretches', () => {
    it.each([[1600, 400], [1200, 300], [1920, 480], [1600, 600], [1200, 1200], [1400, 350], [2000, 500]])(
      '%s → output is exactly 4:1',
      async (w, h) => {
        const { buffer } = await processBannerImage(await makeSolid(w, h, 'jpeg'));
        const outMeta = await sharp(buffer).metadata();
        expect(outMeta.width / outMeta.height).toBe(4);
        expect(outMeta.width).toBe(1600);
        expect(outMeta.height).toBe(400);
      }
    );
  });
});
