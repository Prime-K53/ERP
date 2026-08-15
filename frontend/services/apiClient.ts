import { API_BASE_URL, HAS_REMOTE_BACKEND, getUrl } from '../config/api.js';
import { ensureSessionAuthState, dispatchAuthInvalid, getStoredUserSession, isSessionExpired, refreshLocalAccessToken } from './authSession';
import { getJsonRequestHeaders } from './requestHeaders';
import { isFileProtocol } from '../utils/runtime';

export class ApiClientError extends Error {
  status?: number;
  url?: string;
  retryable: boolean;
  response?: Response;

  constructor(message: string, options: { status?: number; url?: string; retryable?: boolean; response?: Response } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.url = options.url;
    this.retryable = options.retryable === true;
    this.response = options.response;
  }
}

export class OfflineRequestError extends ApiClientError {
  constructor(message: string) {
    super(message, { retryable: false });
    this.name = 'OfflineRequestError';
  }
}

export class UnauthorizedRequestError extends ApiClientError {
  constructor(message: string, url?: string, response?: Response) {
    super(message, { status: response?.status || 401, url, retryable: false, response });
    this.name = 'UnauthorizedRequestError';
  }
}

export interface ApiRequestConfig {
  endpoint: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  timeoutMs?: number;
  baseCandidates?: string[];
  retries?: number;
  retryDelayMs?: number;
  expectJson?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_AUTH_COOLDOWN_MS = 15000;

let authBlockedUntil = 0;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const joinPath = (base: string, endpoint: string) => {
  const trimmedBase = String(base || '').replace(/^\/+|\/+$/g, '');
  const trimmedEndpoint = String(endpoint || '').replace(/^\/+/, '');
  if (!trimmedBase) return trimmedEndpoint;
  if (!trimmedEndpoint) return trimmedBase;
  return `${trimmedBase}/${trimmedEndpoint}`;
};

const parseJsonSafely = async <T>(response: Response): Promise<T> => {
  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
};

const isHtmlResponse = (response: Response, bodyPreview = '') => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    return true;
  }
  const trimmed = bodyPreview.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
};

const isNetworkFailure = (error: unknown) => {
  if (error instanceof OfflineRequestError) {
    return false;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('timeout')
    || message.includes('aborted');
};

const buildAuthHeaders = (headers: Record<string, string> = {}) => {
  const session = ensureSessionAuthState();
  const nextHeaders = getJsonRequestHeaders(headers);

  if (session.accessToken) {
    nextHeaders.Authorization = `Bearer ${session.accessToken}`;
  }

  nextHeaders['x-auth-mode'] = session.authMode;
  return nextHeaders;
};

const shouldPauseRemoteRequests = () => {
  if (!HAS_REMOTE_BACKEND || !API_BASE_URL || isFileProtocol()) {
    return true;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  return authBlockedUntil > Date.now();
};

const suspendProtectedRequests = (durationMs = DEFAULT_AUTH_COOLDOWN_MS) => {
  authBlockedUntil = Math.max(authBlockedUntil, Date.now() + durationMs);
};

const resetProtectedRequestPause = () => {
  authBlockedUntil = 0;
};

const handleUnauthorizedResponse = async (response: Response, url: string) => {
  suspendProtectedRequests();

  let reason = 'Your session is not authorized. Please sign in again.';
  try {
    const payload = await parseJsonSafely<any>(response.clone());
    const detail = String(payload?.message || payload?.error || '').trim();
    if (detail) {
      reason = `Authentication required: ${detail}`;
    }
  } catch {
    // Use the default message.
  }

  const storedUser = getStoredUserSession();
  const isBypassSession = storedUser?.bypassAuth === true || storedUser?.authMode === 'password_bypass';
  if (!isBypassSession && !isSessionExpired(storedUser)) {
    const refreshed = refreshLocalAccessToken();
    if (refreshed) {
      throw new UnauthorizedRequestError('Authentication refreshed locally. Retry when network is available.', url, response);
    }
  }

  if (!isBypassSession) {
    dispatchAuthInvalid(reason);
  }

  throw new UnauthorizedRequestError(reason, url, response);
};

const resolveBaseCandidates = (baseCandidates?: string[]) => {
  const candidates = Array.isArray(baseCandidates) && baseCandidates.length > 0 ? baseCandidates : [''];
  return candidates.filter(Boolean);
};

export const apiClient = {
  getBaseUrl() {
    return API_BASE_URL;
  },

  canUseRemoteApi() {
    return !shouldPauseRemoteRequests();
  },

  isAuthCoolingDown() {
    return authBlockedUntil > Date.now();
  },

  suspendProtectedRequests,
  resetProtectedRequestPause,

  async requestRaw(config: ApiRequestConfig): Promise<Response> {
    if (shouldPauseRemoteRequests()) {
      throw new OfflineRequestError('Remote requests are paused because the app is offline or authentication is unavailable.');
    }

    const {
      endpoint,
      method = 'GET',
      body = null,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retries = 1,
      retryDelayMs = 500,
      expectJson = true
    } = config;

    const baseCandidates = resolveBaseCandidates(config.baseCandidates);
    if (baseCandidates.length === 0) {
      throw new OfflineRequestError('Remote API base URL is not configured.');
    }

    let lastError: unknown = null;

    for (const base of baseCandidates) {
      const url = getUrl(joinPath(base, endpoint));

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const response = await fetch(url, {
            method,
            headers: buildAuthHeaders(config.headers || {}),
            body,
            signal: controller.signal
          });

          if (response.status === 401 || response.status === 403) {
            await handleUnauthorizedResponse(response, url);
          }

          if (expectJson) {
            const preview = await response.clone().text();
            if (isHtmlResponse(response, preview)) {
              throw new ApiClientError(
                `Unsupported MIME type ('text/html') for ${method.toUpperCase()} ${url}.`,
                { status: response.status, url, retryable: false, response }
              );
            }
          }

          if (response.ok) {
            resetProtectedRequestPause();
          }

          return response;
        } catch (error) {
          lastError = error;
          const canRetry = attempt < retries && isNetworkFailure(error);
          if (!canRetry) {
            break;
          }
          const backoffMs = retryDelayMs * Math.pow(2, attempt);
          await delay(backoffMs);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    if (lastError instanceof ApiClientError) {
      throw lastError;
    }

    if (lastError instanceof Error && lastError.name === 'AbortError') {
      throw new ApiClientError('Request timed out while contacting the remote API.', {
        retryable: true
      });
    }

    if (isNetworkFailure(lastError)) {
      throw new OfflineRequestError('Network unavailable. Using offline cache instead.');
    }

    throw new ApiClientError(lastError instanceof Error ? lastError.message : 'Remote request failed.');
  },

  async requestJson<T>(config: ApiRequestConfig): Promise<T> {
    const response = await this.requestRaw(config);
    return parseJsonSafely<T>(response);
  }
};

