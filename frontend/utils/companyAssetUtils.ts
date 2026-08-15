import { CompanyConfig } from '../types';
import { localFileStorage } from '../services/localFileStorage';
import { isStoredFileIdentifier } from './documentPreview';

const PDF_SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export const normalizeImageDataUrl = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) return null;
  if (!trimmed.includes(';base64,')) return null;
  return trimmed;
};

const getDataUrlMimeType = (value: string): string => {
  const match = value.match(/^data:([^;]+);base64,/i);
  return String(match?.[1] || '').toLowerCase();
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Failed to read image data.'));
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result.startsWith('data:image/')) {
        reject(new Error('Unsupported image payload.'));
        return;
      }
      resolve(result);
    };

    reader.readAsDataURL(blob);
  });

const loadHtmlImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image data.'));
    image.src = src;
  });

const convertImageSourceToPngDataUrl = async (src: string): Promise<string> => {
  if (typeof document === 'undefined') {
    throw new Error('Image normalization requires a browser environment.');
  }

  const image = await loadHtmlImage(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('Image dimensions are invalid.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas rendering is unavailable.');
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
};

export const resolvePdfReadyImageDataUrlFromBlob = async (blob: Blob): Promise<string> => {
  const mimeType = String(blob.type || '').toLowerCase();

  if (PDF_SAFE_IMAGE_MIME_TYPES.has(mimeType)) {
    return readBlobAsDataUrl(blob);
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await convertImageSourceToPngDataUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const fetchBlobFromSource = async (source: string): Promise<Blob | null> => {
  const trimmedSource = String(source || '').trim();
  if (!trimmedSource) return null;

  if (isStoredFileIdentifier(trimmedSource)) {
    const objectUrl = await localFileStorage.getUrl(trimmedSource);
    if (!objectUrl) return null;

    try {
      const response = await fetch(objectUrl);
      if (!response.ok) return null;
      return await response.blob();
    } finally {
      localFileStorage.revoke(objectUrl);
    }
  }

  const response = await fetch(trimmedSource);
  if (!response.ok) return null;
  return await response.blob();
};

export const resolvePdfReadyImageDataUrl = async (source?: string | null): Promise<string | null> => {
  const normalizedDataUrl = normalizeImageDataUrl(source);
  if (normalizedDataUrl) {
    const mimeType = getDataUrlMimeType(normalizedDataUrl);
    if (PDF_SAFE_IMAGE_MIME_TYPES.has(mimeType)) {
      return normalizedDataUrl;
    }

    try {
      return await convertImageSourceToPngDataUrl(normalizedDataUrl);
    } catch {
      return null;
    }
  }

  try {
    const blob = await fetchBlobFromSource(String(source || '').trim());
    if (!blob) return null;
    return await resolvePdfReadyImageDataUrlFromBlob(blob);
  } catch {
    return null;
  }
};

export const hydrateCompanyPdfAssets = async <T extends CompanyConfig | null | undefined>(config: T): Promise<T> => {
  if (!config) return config;

  const nextConfig = { ...config } as CompanyConfig & {
    logoBase64?: string;
    signatureBase64?: string;
  };

  const logoBase64 = await resolvePdfReadyImageDataUrl(nextConfig.logoBase64 || nextConfig.logo || '');
  if (logoBase64) {
    nextConfig.logoBase64 = logoBase64;
  }

  const signatureBase64 = await resolvePdfReadyImageDataUrl(nextConfig.signatureBase64 || nextConfig.signature || '');
  if (signatureBase64) {
    nextConfig.signatureBase64 = signatureBase64;
  }

  return nextConfig as T;
};

export const resolvePdfLogoSource = (config?: CompanyConfig | null, showCompanyLogo = true): string => {
  if (!showCompanyLogo) return '';
  return normalizeImageDataUrl((config as CompanyConfig & { logoBase64?: string })?.logoBase64)
    || normalizeImageDataUrl(config?.logo)
    || '';
};

export const resolvePdfQrCodeSource = (value?: string | null): string =>
  normalizeImageDataUrl(value) || '';
