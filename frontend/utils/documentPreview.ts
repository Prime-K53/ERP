export interface DeviceProfile {
  isAndroid: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isTouch: boolean;
}

const PDF_EXTENSIONS = new Set(['pdf']);
const DOC_EXTENSIONS = new Set(['doc', 'docx']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);

const PDF_MIME_PREFIX = 'application/pdf';
const DOC_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const isStoredFileIdentifier = (value?: string | null): boolean =>
  /^FILE(?:\s*-\s*|-)/i.test((value || '').trim());

export const inferMimeType = (fileName?: string | null, sourceUrl?: string | null): string | undefined => {
  const candidate = (fileName || sourceUrl || '').toLowerCase();
  const extension = candidate.split('?')[0].split('#')[0].split('.').pop();

  if (!extension) return undefined;
  if (PDF_EXTENSIONS.has(extension)) return PDF_MIME_PREFIX;
  if (extension === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (extension === 'doc') return 'application/msword';
  if (IMAGE_EXTENSIONS.has(extension)) {
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'svg') return 'image/svg+xml';
    return `image/${extension}`;
  }
  return undefined;
};

export const isPdfMimeType = (mimeType?: string | null, fileName?: string | null, sourceUrl?: string | null): boolean =>
  (mimeType || '').toLowerCase().startsWith(PDF_MIME_PREFIX)
  || inferMimeType(fileName, sourceUrl) === PDF_MIME_PREFIX;

export const isWordMimeType = (mimeType?: string | null, fileName?: string | null, sourceUrl?: string | null): boolean => {
  const normalized = (mimeType || '').toLowerCase();
  if (DOC_MIME_TYPES.has(normalized)) return true;

  const candidate = (fileName || sourceUrl || '').toLowerCase();
  const extension = candidate.split('?')[0].split('#')[0].split('.').pop();
  return Boolean(extension && DOC_EXTENSIONS.has(extension));
};

export const isImageMimeType = (mimeType?: string | null, fileName?: string | null, sourceUrl?: string | null): boolean =>
  (mimeType || '').toLowerCase().startsWith('image/')
  || (inferMimeType(fileName, sourceUrl) || '').startsWith('image/');

export const getDeviceProfile = (): DeviceProfile => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isAndroid: false,
      isDesktop: true,
      isIOS: false,
      isMobile: false,
      isTablet: false,
      isTouch: false,
    };
  }

  const userAgent = navigator.userAgent || navigator.vendor || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isAndroid = /Android/i.test(userAgent);
  const isIPhone = /iPhone|iPod/i.test(userAgent);
  const isIPad = /iPad/i.test(userAgent) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad;
  const isTablet =
    isIPad
    || /Tablet|PlayBook|Silk/i.test(userAgent)
    || (isAndroid && !/Mobile/i.test(userAgent))
    || (window.innerWidth >= 768 && window.innerWidth <= 1366 && maxTouchPoints > 1);
  const isMobile =
    !isTablet && (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(userAgent) || window.innerWidth < 768);
  const isTouch = maxTouchPoints > 0 || /Android|iPhone|iPad|Tablet|Touch/i.test(userAgent);

  return {
    isAndroid,
    isDesktop: !isMobile && !isTablet,
    isIOS,
    isMobile,
    isTablet,
    isTouch,
  };
};
