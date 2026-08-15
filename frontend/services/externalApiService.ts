import { dbService } from './db';
import { logger } from '@/services/logger';
import { OFFLINE_MODE } from '../constants';
import { shouldBlockRemoteNetwork } from '../utils/networkPolicy';

export interface ExternalApiConfig {
  id: string;
  name: string;
  baseUrl: string;
  authToken?: string;
  authType?: 'bearer' | 'api_key' | 'basic' | 'none';
  apiKeyHeader?: string;
  enabled: boolean;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

const API_CONFIG_STORE = 'externalApi_configs';

class ExternalApiService {
  async getConfigs(): Promise<ExternalApiConfig[]> {
    try {
      const configs = await dbService.getAll<ExternalApiConfig>(API_CONFIG_STORE);
      return configs || [];
    } catch (error) {
      logger.error('Failed to fetch external API configs:', error);
      return [];
    }
  }

  async saveConfig(config: ExternalApiConfig): Promise<void> {
    await dbService.put(API_CONFIG_STORE, config);
  }

  async deleteConfig(id: string): Promise<void> {
    await dbService.delete(API_CONFIG_STORE, id);
  }

  private getHeaders(config: ExternalApiConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {})
    };

    if (config.authType === 'bearer' && config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    } else if (config.authType === 'api_key' && config.authToken && config.apiKeyHeader) {
      headers[config.apiKeyHeader] = config.authToken;
    } else if (config.authType === 'basic' && config.authToken) {
      headers['Authorization'] = `Basic ${btoa(config.authToken)}`;
    }

    return headers;
  }

  async callApi<T = any>(
    config: ExternalApiConfig,
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      body?: any;
      queryParams?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse<T>> {
    if (!config.enabled) {
      return { success: false, error: 'API is disabled' };
    }

    if (OFFLINE_MODE && shouldBlockRemoteNetwork(config.baseUrl)) {
      return {
        success: true,
        data: {
          offline: true,
          mocked: true,
          endpoint,
          method: options.method || 'GET',
          timestamp: new Date().toISOString()
        } as T,
        statusCode: 200
      };
    }

    try {
      let url = `${config.baseUrl}${endpoint}`;
      
      if (options.queryParams) {
        const params = new URLSearchParams(options.queryParams);
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: this.getHeaders(config),
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      const data = await response.json().catch(() => null);

      return {
        success: response.ok,
        data: response.ok ? data : undefined,
        error: !response.ok ? (data?.message || data?.error || 'Request failed') : undefined,
        statusCode: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async testConnection(config: ExternalApiConfig): Promise<ApiResponse<{ message: string }>> {
    const result = await this.callApi<{ message: string }>(config, '', { method: 'GET' });
    if (result.success) {
      return { success: true, data: { message: 'Connection successful' }, statusCode: 200 };
    }
    return result;
  }
}

export const externalApiService = new ExternalApiService();
