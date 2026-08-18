// ─── Customer Portal Banner Image Service (ERP side) ─────────────────────────
// Mirrors the backend bannerImageService spec so the ERP UI can validate,
// interactively crop to 4:1, and prepare a banner before it is uploaded.
// The canonical 4:1 ratio is enforced on the actual asset — never by CSS
// stretching — and the server re-validates everything on upload.

import type { PortalAdImageMeta } from '../types/ads';

export const BANNER_SPEC = {
  bannerType: 'customer_portal_banner',
  targetRatio: 4,
  recommendedWidth: 1600,
  recommendedHeight: 400,
  minWidth: 1200,
  minHeight: 300,
  maxBytes: 2 * 1024 * 1024, // ~2 MB for web delivery
  outputFormat: 'webp',
  outputQuality: 0.92,
  allowedMime: /^image\/(png|jpe?g|webp)$/i,
  aspectTolerance: 0.02, // UI crop rounding drift treated as conformant
} as const;

export type BannerValidationErrorCode = 'TYPE' | 'SIZE' | 'SMALL' | 'LOAD';

export interface BannerValidationResult {
  ok: boolean;
  error?: string;
  code?: BannerValidationErrorCode;
  /** Source width in px (orientation-normalized). */
  width?: number;
  /** Source height in px (orientation-normalized). */
  height?: number;
  /** width / height of the source. */
  ratio?: number;
  /** True when the source is already 4:1 (within tolerance) — no crop needed. */
  conformant?: boolean;
  /** True when the source must be cropped to 4:1 before upload. */
  needsCrop?: boolean;
  /** Final prepared asset size (4:1). */
  output?: { width: number; height: number };
}

export const BANNER_ERROR_MESSAGES: Record<BannerValidationErrorCode, string> = {
  TYPE: 'Unsupported file type. Accepted formats: WebP, JPG, PNG.',
  SIZE: 'Image is too large — the maximum size is 2 MB.',
  SMALL: `Image is too small. Minimum acceptable: ${BANNER_SPEC.minWidth} × ${BANNER_SPEC.minHeight} px (4:1).`,
  LOAD: 'The file could not be read as an image.',
};

/** Client-side file gate (type + size) before the image is even decoded. */
export function validateBannerFile(file: File | null | undefined): BannerValidationResult {
  if (!file) return { ok: false, code: 'LOAD', error: BANNER_ERROR_MESSAGES.LOAD };
  if (!BANNER_SPEC.allowedMime.test(file.type || '')) {
    return { ok: false, code: 'TYPE', error: BANNER_ERROR_MESSAGES.TYPE };
  }
  if (file.size > BANNER_SPEC.maxBytes) {
    return { ok: false, code: 'SIZE', error: BANNER_ERROR_MESSAGES.SIZE };
  }
  return { ok: true };
}

/** True when width/height are 4:1 within the given tolerance (default spec). */
export function aspectConformance(width: number, height: number, tolerance = BANNER_SPEC.aspectTolerance): boolean {
  if (!width || !height) return false;
  return Math.abs(width / height - BANNER_SPEC.targetRatio) <= tolerance;
}

/**
 * Largest 4:1 region that fits inside a source without upscaling, or null
 * when the source is too small to ever produce a valid banner.
 */
export function largestFourToOneRegion(width: number, height: number): { width: number; height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (width / height >= BANNER_SPEC.targetRatio) {
    const cropW = Math.min(Math.round(height * BANNER_SPEC.targetRatio), width);
    return { width: cropW, height: Math.round(cropW / BANNER_SPEC.targetRatio) };
  }
  const cropH = Math.min(Math.round(width / BANNER_SPEC.targetRatio), height);
  return { width: Math.round(cropH * BANNER_SPEC.targetRatio), height: cropH };
}

/**
 * Structural validation of decoded image dimensions:
 * minimum size gate (even the largest possible 4:1 crop must meet the min),
 * conformance (already 4:1 or needs cropping), and the final output size.
 */
export function buildBannerValidation(width: number, height: number): BannerValidationResult {
  if (!width || !height) {
    return { ok: false, code: 'LOAD', error: BANNER_ERROR_MESSAGES.LOAD };
  }
  const region = largestFourToOneRegion(width, height);
  if (!region || region.width < BANNER_SPEC.minWidth || region.height < BANNER_SPEC.minHeight) {
    return {
      ok: false,
      code: 'SMALL',
      error: `Image is too small (${width} × ${height} px). Minimum acceptable: ${BANNER_SPEC.minWidth} × ${BANNER_SPEC.minHeight} px (4:1).`,
    };
  }
  return {
    ok: true,
    width,
    height,
    ratio: width / height,
    conformant: aspectConformance(width, height),
    needsCrop: !aspectConformance(width, height),
    output: { width: BANNER_SPEC.recommendedWidth, height: BANNER_SPEC.recommendedHeight },
  };
}

/** Decode a selected file into an orientation-normalized HTMLImageElement. */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(BANNER_ERROR_MESSAGES.LOAD)); };
    img.src = url;
  });
}

/** Load an image from a URL (CORS-clean so it can be drawn to a canvas). */
export function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load the image (${url})`));
    img.src = url;
  });
}

/** Read natural dimensions from a URL (used to flag legacy non-4:1 banners). */
export function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Could not load the image (${url})`));
    img.src = url;
  });
}

// ── Interactive crop math (pure — unit tested) ───────────────────────────────

export interface CropTransform {
  /** Display scale of the image inside the stage. */
  scale: number;
  /** Pan offset from the centered position (display px). */
  panX: number;
  /** Pan offset from the centered position (display px). */
  panY: number;
}

/** Minimum scale so the image fully covers the fixed 4:1 crop window. */
export function coverTransform(srcW: number, srcH: number, winW: number, winH: number): CropTransform {
  const scale = Math.max(winW / srcW, winH / srcH);
  return { scale, panX: 0, panY: 0 };
}

/** Clamp pan so the image always covers the crop window. */
export function clampPan(panX: number, panY: number, scale: number, srcW: number, srcH: number, winW: number, winH: number): { panX: number; panY: number } {
  const maxX = Math.max(0, (srcW * scale - winW) / 2);
  const maxY = Math.max(0, (srcH * scale - winH) / 2);
  return {
    panX: Math.max(-maxX, Math.min(maxX, panX)),
    panY: Math.max(-maxY, Math.min(maxY, panY)),
  };
}

/**
 * Source-pixel crop rectangle implied by the current transform and the
 * fixed crop window. Window is centered in the stage, image origin is
 * stage center − image size/2 + pan.
 */
export function cropRectFromTransform(
  t: CropTransform,
  srcW: number,
  srcH: number,
  winW: number,
  winH: number,
): { x: number; y: number; width: number; height: number } {
  const imgW = srcW * t.scale;
  const imgH = srcH * t.scale;
  const originX = winW / 2 - imgW / 2 + t.panX;
  const originY = winH / 2 - imgH / 2 + t.panY;
  const x = (0 - originX) / t.scale;
  const y = (0 - originY) / t.scale;
  const width = winW / t.scale;
  const height = winH / t.scale;
  const maxX = Math.max(0, srcW - width);
  const maxY = Math.max(0, srcH - height);
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
    width: Math.min(width, srcW),
    height: Math.min(height, srcH),
  };
}

// ── Canvas processing ────────────────────────────────────────────────────────

/** Renders a source crop region onto the final 1600 × 400 WebP canvas. */
export function renderBannerCanvas(image: HTMLImageElement, src: { x: number; y: number; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BANNER_SPEC.recommendedWidth;
  canvas.height = BANNER_SPEC.recommendedHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, src.x, src.y, src.width, src.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** toBlob('image/webp') wrapper. */
export function canvasToWebPBlob(canvas: HTMLCanvasElement, quality = BANNER_SPEC.outputQuality): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode the prepared banner as WebP'));
    }, `image/${BANNER_SPEC.outputFormat}`, quality);
  });
}

/**
 * Prepares a conformant (already 4:1) source: crops to the largest 4:1 region
 * (a no-op for exact 4:1 sources, covers tiny rounding drift), scales to the
 * recommended 1600 × 400 canvas and encodes as WebP. Never stretches.
 */
export async function prepareBannerBlob(image: HTMLImageElement): Promise<Blob> {
  const region = largestFourToOneRegion(image.naturalWidth, image.naturalHeight) || {
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  const offsetX = Math.max(0, Math.round((image.naturalWidth - region.width) / 2));
  const offsetY = Math.max(0, Math.round((image.naturalHeight - region.height) / 2));
  const canvas = renderBannerCanvas(image, { x: offsetX, y: offsetY, width: region.width, height: region.height });
  return canvasToWebPBlob(canvas);
}

/** Builds the final `File` uploaded to POST /ads/upload. */
export function preparedBannerFile(blob: Blob): File {
  return new File([blob], `banner.${BANNER_SPEC.outputFormat}`, { type: `image/${BANNER_SPEC.outputFormat}` });
}

/** Formats bytes for the preview UI (e.g. "412 KB"). */
export function formatBannerBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** True when stored metadata describes a conformant 4:1 banner. */
export function isConformantMeta(meta: PortalAdImageMeta | undefined | null): boolean {
  if (!meta || !meta.width || !meta.height) return false;
  return aspectConformance(meta.width, meta.height);
}
