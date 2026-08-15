import { platform } from './platform';

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
}

const logger = {
  warn: (msg: string, extra?: any) => {
    const formatted = `[FRONTEND][safeFetch] ${msg}`;
    console.warn(formatted, extra || '');
    if (platform.isDesktop) {
      platform.api.log({ message: formatted, level: 'WARN', ...extra });
    }
  },
  error: (msg: string, extra?: any) => {
    const formatted = `[FRONTEND][safeFetch] ${msg}`;
    console.error(formatted, extra || '');
    if (platform.isDesktop) {
      platform.api.log({ message: formatted, level: 'ERROR', ...extra });
    }
  },
  debug: (msg: string, extra?: any) => {
    const formatted = `[FRONTEND][safeFetch] ${msg}`;
    console.debug(formatted, extra || '');
  }
};

export interface SafeFetchResponse<T = any> {
  data: T | null;
  error: Error | null;
  status?: number;
  ok: boolean;
}

export async function safeFetch<T = any>(
  url: string,
  options: SafeFetchOptions = {},
  fallback: T | null = null
): Promise<SafeFetchResponse<T>> {
  const { timeoutMs = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`Request to ${url} failed with status: ${response.status}`);
      return {
        data: fallback,
        error: new Error(`HTTP Error: ${response.status} ${response.statusText}`),
        status: response.status,
        ok: false
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (!text || text.trim() === '') {
      logger.warn(`Empty response received from ${url}`);
      return { data: fallback, error: null, status: response.status, ok: true };
    }

    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        const json = JSON.parse(text);
        return { data: json, error: null, status: response.status, ok: true };
      } catch (parseError) {
        logger.error(`JSON parse error ("incorrect data check" prevention) on ${url}:`, parseError);
        logger.debug(`Raw response start:`, text.substring(0, 100));
        return { 
          data: fallback, 
          error: new Error('Invalid JSON response format'),
          status: response.status,
          ok: false
        };
      }
    }

    logger.warn(`Received non-JSON response from ${url} (Content-Type: ${contentType})`);
    return { 
      data: fallback, 
      error: new Error('Expected JSON response but received different format'),
      status: response.status,
      ok: false
    };

  } catch (err: any) {
    clearTimeout(timeoutId);
    
    if (err.name === 'AbortError') {
      logger.error(`Request timeout (${timeoutMs}ms) for ${url}`);
      return { data: fallback, error: new Error(`Request timeout after ${timeoutMs}ms`), ok: false };
    }

    logger.error(`Network error calling ${url}:`, err.message);
    return { data: fallback, error: err, ok: false };
  }
}
