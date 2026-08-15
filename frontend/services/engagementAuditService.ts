import { EngagementAuditEntry } from '../types/engagement'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

export const engagementAuditService = {
  async log(params: {
    entityType: EngagementAuditEntry['entityType']
    entityId: string
    action: string
    actorId: string
    actorName?: string
    fieldName?: string
    oldValue?: any
    newValue?: any
    reason?: string
    correlationId?: string
  }): Promise<EngagementAuditEntry> {
    const entry: EngagementAuditEntry = {
      id: generateId('EAUD'),
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId,
      actorName: params.actorName,
      fieldName: params.fieldName,
      oldValue: params.oldValue,
      newValue: params.newValue,
      reason: params.reason,
      ipAddress: typeof window !== 'undefined' ? '' : undefined,
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
      correlationId: params.correlationId,
      createdAt: new Date().toISOString(),
    }
    await dbService.put('engagementAudit', entry)
    return entry
  },

  async getForEntity(entityType: string, entityId: string): Promise<EngagementAuditEntry[]> {
    const all = await dbService.getAll<EngagementAuditEntry>('engagementAudit')
    return all
      .filter(e => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },

  async getAll(limit = 200): Promise<EngagementAuditEntry[]> {
    const all = await dbService.getAll<EngagementAuditEntry>('engagementAudit')
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },
}

export default engagementAuditService
