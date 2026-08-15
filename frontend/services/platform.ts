import { isFileProtocol } from '../utils/runtime';

export type PlatformType = 'browser';

export interface PlatformLogPayload {
  message: string;
  level?: string;
  [key: string]: unknown;
}

export interface PlatformReadPdfResult {
  success: boolean;
  data?: number[];
  size?: number;
  path?: string;
  error?: string;
}

export interface PlatformWritePdfResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface PlatformCleanupPdfResult {
  success: boolean;
  error?: string;
}

export interface PlatformOpenPdfResult {
  success: boolean;
  error?: string;
}

export interface PlatformAPI {
  getBackendUrl: () => Promise<string>;
  log: (payload: PlatformLogPayload) => void;
  readPdfFile: (filePath: string) => Promise<PlatformReadPdfResult>;
  writeTempPdf: (data: number[], filename?: string) => Promise<PlatformWritePdfResult>;
  cleanupTempPdf: (filePath: string) => Promise<PlatformCleanupPdfResult>;
  openPdfWithSystemViewer: (filePath: string) => Promise<PlatformOpenPdfResult>;
  getPdfPreviewUrl: (filePath: string) => string | null;
}

let cachedApi: PlatformAPI | null = null;
const blobUrls = new Set<string>();

const getRuntimeBackendUrl = () => {
  try {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;
  } catch {
    // ignore
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const override = String(urlParams.get('backend') || '').trim();
    if (override) return override;
  } catch {
    // Ignore malformed query strings.
  }

  const configured = String((window as { BACKEND_ORIGIN?: string })?.BACKEND_ORIGIN || '').trim();
  if (configured) return configured;
  if (isFileProtocol()) return '';
  return 'https://primebooks-erp.onrender.com';
};

const toFileUrl = (filePath: string) => {
  const normalized = String(filePath || '').trim();
  if (!normalized) return null;
  if (
    normalized.startsWith('blob:')
    || normalized.startsWith('data:')
    || normalized.startsWith('file:')
    || /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }

  if (/^[a-zA-Z]:[\\/]/.test(normalized)) {
    return `file:///${normalized.replace(/\\/g, '/')}`;
  }

  try {
    return new URL(normalized.replace(/^\/+/, ''), window.location.href).toString();
  } catch {
    return null;
  }
};

function createBrowserAPI(): PlatformAPI {
  return {
    getBackendUrl: async () => getRuntimeBackendUrl(),

    log: (payload: PlatformLogPayload) => {
      const level = payload.level || 'INFO';
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `[${level}] ${payload.message}`,
        payload,
      );
    },

    readPdfFile: async (filePath: string): Promise<PlatformReadPdfResult> => {
      const previewUrl = toFileUrl(filePath);
      if (!previewUrl || previewUrl.startsWith('file:')) {
        return {
          success: false,
          error: 'Direct local file reads are not available in browser-only mode. Use the generated preview URL instead.'
        };
      }

      try {
        const response = await fetch(previewUrl);
        if (!response.ok) {
          return { success: false, error: `Failed to read PDF (${response.status})` };
        }
        const buffer = await response.arrayBuffer();
        return {
          success: true,
          data: Array.from(new Uint8Array(buffer)),
          size: buffer.byteLength,
          path: previewUrl
        };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to read file' };
      }
    },

    writeTempPdf: async (data: number[], _filename?: string): Promise<PlatformWritePdfResult> => {
      try {
        const blob = new Blob([new Uint8Array(data)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        blobUrls.add(url);
        return { success: true, path: url };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to write temp PDF' };
      }
    },

    cleanupTempPdf: async (filePath: string): Promise<PlatformCleanupPdfResult> => {
      if (filePath?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(filePath);
          blobUrls.delete(filePath);
        } catch (err: any) {
          return { success: false, error: err?.message || 'Failed to clean up temporary PDF' };
        }
      }

      return { success: true };
    },

    openPdfWithSystemViewer: async (filePath: string): Promise<PlatformOpenPdfResult> => {
      const previewUrl = toFileUrl(filePath);
      if (!previewUrl) {
        return { success: false, error: 'No PDF path available to open.' };
      }

      const opened = window.open(previewUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        return { success: false, error: 'Browser blocked the PDF preview window.' };
      }

      return { success: true };
    },

    getPdfPreviewUrl: (filePath: string): string | null => {
      return toFileUrl(filePath);
    },
  };
}

export function detectPlatform(): PlatformType {
  return 'browser';
}

export function isTauri(): boolean {
  return false;
}

export function isElectron(): boolean {
  return false;
}

export function isDesktop(): boolean {
  return false;
}

export function getPlatformAPI(): PlatformAPI {
  if (cachedApi) return cachedApi;
  cachedApi = createBrowserAPI();
  return cachedApi;
}

export const platform = {
  get type(): PlatformType {
    return detectPlatform();
  },
  get isTauri(): boolean {
    return false;
  },
  get isElectron(): boolean {
    return false;
  },
  get isDesktop(): boolean {
    return false;
  },
  get api(): PlatformAPI {
    return getPlatformAPI();
  },
};
