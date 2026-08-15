/**
 * Shared utilities for examination services
 * Extracted from examinationBatchService.ts and examinationNotificationService.ts
 */

import { getUrl } from '../config/api.js';
import { logger } from '../services/logger';
import { getJsonRequestHeaders } from './requestHeaders';

/**
 * Constructs proper API headers with user context from session storage
 */
export const getHeaders = () => {
  return getJsonRequestHeaders();
};

/**
 * Joins base URL and endpoint with proper slash handling
 */
export const joinPath = (base: string, endpoint: string) => {
  const trimmedBase = String(base || '').replace(/^\/+|\/+$/g, '');
  const trimmedEndpoint = String(endpoint || '').replace(/^\/+/, '');
  if (!trimmedBase) return trimmedEndpoint;
  if (!trimmedEndpoint) return trimmedBase;
  return `${trimmedBase}/${trimmedEndpoint}`;
};

/**
 * Safely parses JSON response, with HTML detection and error handling
 */
export const safeJson = async (response: Response, context: string) => {
  const raw = await response.text();
  
  if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
    throw new Error(`Backend not reachable or wrong API URL: Received HTML response in ${context}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.error(`[examinationService] JSON parse error in ${context}:`, err);
    logger.debug(`[examinationService] Failed content:`, raw);
    throw new Error(`Invalid response format from server in ${context}. Expected JSON.`);
  }
};

/**
 * Extracts error message from service response
 */
export const toServiceError = async (response: Response, fallback: string) => {
  try {
    const raw = await response.text();
    const statusSuffix = ` (HTTP ${response.status})`;

    // Detect HTML response (indicates backend error page, wrong URL, or proxy failure)
    if (raw.trim().startsWith('<!DOCTYPE') || raw.trim().startsWith('<html')) {
      return `Backend not reachable or wrong API URL: Received HTML instead of JSON${statusSuffix}`;
    }

    if (!raw || !raw.trim()) return `${fallback}${statusSuffix}`;

    try {
      const data = JSON.parse(raw);
      const detailParts = [data?.error, data?.message, data?.diagnostic]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index);
      if (detailParts.length > 0) return `${fallback}: ${detailParts.join(' - ')}${statusSuffix}`;
    } catch (parseError) {
      logger.error(`[examinationService] Failed to parse JSON response:`, parseError);
      logger.debug(`[examinationService] Raw response text:`, raw);
    }

    const compact = raw.replace(/\s+/g, ' ').trim();
    const preview = compact.length > 180 ? `${compact.slice(0, 180)}...` : compact;
    return `${fallback}: ${preview}${statusSuffix}`;
  } catch (err) {
    logger.error(`[examinationService] Error processing service error:`, err);
    return `${fallback} (HTTP ${response.status})`;
  }
};

/**
 * Detects if an error is likely caused by network issues
 */
export const isLikelyNetworkError = (error: Error) => {
  const message = String(error.message || '').toLowerCase();
  return (
    error.name === 'TypeError'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('err_connection_closed')
    || message.includes('connection closed')
  );
};
