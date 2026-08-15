import { logger } from '@/services/logger';
import { dbService } from './db';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  details_json?: string;
  details?: string;
  correlation_id?: string;
  ip_address?: string;
  user_agent?: string;
  status: string;
}

const mapRow = (row: any): AuditLogEntry => ({
  id: String(row?.id || ''),
  timestamp: String(row?.timestamp || row?.date || new Date().toISOString()),
  action: String(row?.action || ''),
  entity_type: String(row?.entity_type || row?.entityType || ''),
  entity_id: String(row?.entity_id || row?.entityId || ''),
  user_id: String(row?.user_id || row?.userId || ''),
  details_json: row?.details_json,
  details: row?.details,
  correlation_id: row?.correlation_id || row?.correlationId,
  ip_address: row?.ip_address,
  user_agent: row?.user_agent,
  status: String(row?.status || 'LOCAL'),
});

export const auditLogService = {
  async getEntityLogs(entityType: string, entityId: string): Promise<AuditLogEntry[]> {
    try {
      const rows = await dbService.getAll<any>('auditLogs');
      return rows.map(mapRow).filter((row) => row.entity_type === entityType && row.entity_id === entityId);
    } catch (error) {
      logger.error('[AuditLogService] Error fetching entity logs:', error);
      return [];
    }
  },

  async getCorrelationTrail(correlationId: string): Promise<AuditLogEntry[]> {
    try {
      const rows = await dbService.getAll<any>('auditLogs');
      return rows.map(mapRow).filter((row) => String(row.correlation_id || '') === correlationId);
    } catch (error) {
      logger.error('[AuditLogService] Error fetching correlation trail:', error);
      return [];
    }
  }
};
