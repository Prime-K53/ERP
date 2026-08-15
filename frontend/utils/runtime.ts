const isWindowAvailable = () => typeof window !== 'undefined';

export const isFileProtocol = (): boolean => (
  isWindowAvailable() && window.location?.protocol === 'file:'
);

export const getBackendOverride = (): string => {
  if (!isWindowAvailable()) return '';
  try {
    return String(new URLSearchParams(window.location.search).get('backend') || '').trim();
  } catch {
    return '';
  }
};

export const hasRemoteBackend = (candidate?: string | null): boolean => {
  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }
  if (!isWindowAvailable()) return false;
  const runtimeBase = String((window as Window & { API_BASE_URL?: string }).API_BASE_URL || '').trim();
  return runtimeBase.length > 0 || getBackendOverride().length > 0;
};

export const resolveAppAssetUrl = (assetPath: string): string => {
  const rawPath = String(assetPath || '').trim();
  if (!rawPath) return '';

  if (
    rawPath.startsWith('data:')
    || rawPath.startsWith('blob:')
    || rawPath.startsWith('file:')
    || /^https?:\/\//i.test(rawPath)
  ) {
    return rawPath;
  }

  const relativePath = rawPath.replace(/^\/+/, '');

  if (!isWindowAvailable()) {
    return `./${relativePath}`;
  }

  if (!isFileProtocol()) {
    return rawPath.startsWith('/') ? rawPath : `/${relativePath}`;
  }

  try {
    return new URL(relativePath, window.location.href).toString();
  } catch {
    return `./${relativePath}`;
  }
};
