// ─── Customer Portal Banner Image Service ────────────────────────────────────
// Canonical preparation pipeline for the `customer_portal_banner` type.
//
// The customer portal renders banners in a responsive 4:1 area. Every banner
// uploaded through the ERP must therefore be prepared as an exact 4:1 asset so
// the portal never stretches or distorts an image.
//
// Pipeline (server-side, defense-in-depth — the ERP UI also validates and
// offers an interactive 4:1 crop before uploading):
//   1. Validate payload (bytes, real image, allowed format)
//   2. Normalize EXIF orientation
//   3. Crop to an exact 4:1 region — positioned intelligently (content-energy
//      analysis) when the source is not 4:1
//   4. Resize to the recommended 1600 × 400 px (WebP) — exact 4:1, no stretch
//   5. Return the optimized buffer + metadata for the ad record

const sharp = require('sharp');

const BANNER_SPEC = {
  bannerType: 'customer_portal_banner',
  targetRatio: 4,
  recommendedWidth: 1600,
  recommendedHeight: 400,
  minWidth: 1200,
  minHeight: 300,
  maxBytes: 2 * 1024 * 1024, // ~2 MB for web delivery
  outputFormat: 'webp',
  outputQuality: 82,
  allowedFormats: ['webp', 'jpeg', 'png'],
  // The ERP UI crops to exactly 4:1; anything within 2% of 4:1 is treated as
  // conformant (covers rounding drift) and only normalized to exact 4:1.
  aspectTolerance: 0.02,
};

class BannerImageError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = 'BannerImageError';
    this.code = code;
    this.status = status;
  }
}

/** Largest 4:1 region that fits inside a source without upscaling. */
function largestFourToOneRegion(width, height) {
  if (!width || !height) return null;
  const ratio = width / height;
  if (ratio >= BANNER_SPEC.targetRatio) {
    let cropW = Math.round(height * BANNER_SPEC.targetRatio);
    if (cropW > width) cropW = width;
    return { width: cropW, height: Math.round(cropW / BANNER_SPEC.targetRatio) };
  }
  let cropH = Math.round(width / BANNER_SPEC.targetRatio);
  if (cropH > height) cropH = height;
  return { width: Math.round(cropH * BANNER_SPEC.targetRatio), height: cropH };
}

/**
 * Finds the best crop offset along one axis using a cheap content-energy scan.
 * The scan downscales to grayscale, computes per-line gradient energy (edges —
 * where logos, text and product shots live) and slides the crop window across
 * the line-energy array, picking the window that contains the most content.
 * Used as the intelligent fallback for non-4:1 uploads that bypass the UI crop.
 *
 * @param {Buffer} inputBuffer original bytes (EXIF orientation applied inside)
 * @param {'x'|'y'} axis       'x' = window moves horizontally (cropping width)
 * @param {number} cropLen     crop window length in source px along the axis
 * @param {number} sourceLen   full source length in source px along the axis
 * @returns {Promise<number>}  best offset in source px (centered when ambiguous)
 */
async function bestCropOffset(inputBuffer, axis, cropLen, sourceLen) {
  if (cropLen >= sourceLen) return 0;
  const PROXY = 96; // proxy edge length — energy analysis stays cheap

  let pipeline = sharp(inputBuffer, { failOn: 'error' }).rotate().grayscale();
  pipeline = axis === 'y'
    ? pipeline.resize({ width: PROXY, withoutEnlargement: true })
    : pipeline.resize({ height: PROXY, withoutEnlargement: true });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  const pw = info.width;
  const ph = info.height;
  const lineCount = axis === 'y' ? ph : pw;
  const energy = new Float64Array(lineCount);

  if (axis === 'y') {
    // Vertical edges — content rows (headlines, logos) stand out.
    for (let r = 1; r < ph; r++) {
      const prev = (r - 1) * pw;
      const cur = r * pw;
      let sum = 0;
      for (let c = 0; c < pw; c++) sum += Math.abs(data[cur + c] - data[prev + c]);
      energy[r] = sum;
    }
  } else {
    // Horizontal edges — content columns stand out.
    for (let c = 1; c < pw; c++) {
      let sum = 0;
      for (let r = 0; r < ph; r++) sum += Math.abs(data[r * pw + c] - data[r * pw + c - 1]);
      energy[c] = sum;
    }
  }

  const windowLen = Math.max(1, Math.round((cropLen / sourceLen) * lineCount));
  const center = Math.floor(lineCount / 2);

  if (windowLen >= lineCount) return Math.max(0, Math.round((sourceLen - cropLen) / 2));

  // Sliding window over line energy; ties prefer the window nearest center.
  let bestStart = 0;
  let bestSum = -1;
  let bestDist = Infinity;
  for (let start = 0; start + windowLen <= lineCount; start++) {
    let sum = 0;
    for (let i = start; i < start + windowLen; i++) sum += energy[i];
    const winCenter = start + windowLen / 2;
    const dist = Math.abs(winCenter - center);
    if (sum > bestSum || (sum === bestSum && dist < bestDist)) {
      bestSum = sum;
      bestStart = start;
      bestDist = dist;
    }
  }

  let offset = Math.round((bestStart / lineCount) * sourceLen);
  offset = Math.max(0, Math.min(offset, sourceLen - cropLen));
  return offset;
}

/**
 * Validates and prepares an uploaded banner image for the customer portal.
 *
 * @param {Buffer} inputBuffer raw upload bytes
 * @returns {Promise<{ buffer: Buffer, meta: object }>}
 */
async function processBannerImage(inputBuffer) {
  const spec = BANNER_SPEC;

  if (!Buffer.isBuffer(inputBuffer) || inputBuffer.length === 0) {
    throw new BannerImageError('No image data provided', 'NO_IMAGE');
  }
  if (inputBuffer.length > spec.maxBytes) {
    throw new BannerImageError(
      `Image is too large — the maximum size is ${Math.round(spec.maxBytes / 1048576)} MB.`,
      'FILE_TOO_LARGE'
    );
  }

  let meta;
  try {
    meta = await sharp(inputBuffer).metadata();
  } catch (err) {
    throw new BannerImageError('The uploaded file is not a valid image.', 'INVALID_IMAGE');
  }
  if (!meta || !meta.width || !meta.height || !spec.allowedFormats.includes(meta.format)) {
    throw new BannerImageError(
      'Unsupported file type. Accepted formats: WebP, JPG, PNG.',
      'UNSUPPORTED_TYPE'
    );
  }

  // Orientation-aware source dimensions (sharp .rotate() normalizes below).
  const needsSwap = meta.orientation && meta.orientation >= 5 && meta.orientation <= 8;
  const srcW = needsSwap ? meta.height : meta.width;
  const srcH = needsSwap ? meta.width : meta.height;

  // Minimum-size gate: even the largest possible 4:1 crop of this source must
  // meet the minimum acceptable banner dimensions.
  const region = largestFourToOneRegion(srcW, srcH);
  if (!region || region.width < spec.minWidth || region.height < spec.minHeight) {
    throw new BannerImageError(
      `Image is too small — the minimum acceptable banner is ${spec.minWidth} × ${spec.minHeight} px (4:1).`,
      'IMAGE_TOO_SMALL'
    );
  }

  // Determine whether an actual crop is needed (within tolerance = normalize only).
  const ratio = srcW / srcH;
  let cropW = srcW;
  let cropH = srcH;
  if (ratio > spec.targetRatio + spec.aspectTolerance) {
    cropW = Math.round(srcH * spec.targetRatio);
  } else if (ratio < spec.targetRatio - spec.aspectTolerance) {
    cropH = Math.round(srcW / spec.targetRatio);
  }

  let cropX = 0;
  let cropY = 0;
  if (cropW < srcW) {
    const bestX = await bestCropOffset(inputBuffer, 'x', cropW, srcW);
    cropX = Math.max(0, Math.min(bestX, srcW - cropW));
  }
  if (cropH < srcH) {
    const bestY = await bestCropOffset(inputBuffer, 'y', cropH, srcH);
    cropY = Math.max(0, Math.min(bestY, srcH - cropH));
  }

  // Final asset: exact 4:1, exactly the recommended canvas (no upscaling
  // beyond the minimum acceptable source), WebP, metadata stripped.
  const outW = spec.recommendedWidth;
  const outH = spec.recommendedHeight;

  let pipeline = sharp(inputBuffer).rotate().extract({
    left: cropX,
    top: cropY,
    width: cropW,
    height: cropH,
  });
  if (cropW !== outW || cropH !== outH) {
    pipeline = pipeline.resize(outW, outH, {
      fit: 'cover',
      position: sharp.strategy.attention,
    });
  }
  pipeline = pipeline.webp({ quality: spec.outputQuality });

  let outBuffer;
  try {
    outBuffer = await pipeline.toBuffer();
  } catch (err) {
    throw new BannerImageError('The uploaded file could not be processed as an image.', 'PROCESS_FAILED');
  }
  if (outBuffer.length > spec.maxBytes) {
    throw new BannerImageError(
      `The prepared banner exceeds ${Math.round(spec.maxBytes / 1048576)} MB — use a simpler image.`,
      'OUTPUT_TOO_LARGE'
    );
  }

  return {
    buffer: outBuffer,
    meta: {
      bannerType: spec.bannerType,
      width: outW,
      height: outH,
      aspectRatio: outW / outH,
      format: spec.outputFormat,
      fileSize: outBuffer.length,
    },
  };
}

module.exports = { BANNER_SPEC, BannerImageError, processBannerImage, largestFourToOneRegion, bestCropOffset };
