import { OFFLINE_MODE } from '../constants';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

export const isLocalNetworkUrl = (value?: string | null): boolean => {
  if (!value) return false;

  try {
    const parsed = new URL(value, 'http://localhost');
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return LOCAL_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith('.local');
  } catch {
    return false;
  }
};

export const isRemoteNetworkUrl = (value?: string | null): boolean => {
  if (!value) return false;

  try {
    const parsed = new URL(value, 'http://localhost');
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return !isLocalNetworkUrl(parsed.toString());
  } catch {
    return false;
  }
};

export const shouldBlockRemoteNetwork = (value?: string | null): boolean =>
  OFFLINE_MODE && isRemoteNetworkUrl(value);
