import { ReferralAuditEntry } from '../types/referral-extended'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

export const referralAuditService = {
  async log(params: {
    entityType: ReferralAuditEntry['entityType']
    entityId: string
    action: ReferralAuditEntry['action']
    actorId: string
    actorName?: string
    fieldName?: string
    oldValue?: any
    newValue?: any
    reason?: string
    correlationId?: string
  }): Promise<ReferralAuditEntry> {
    const entry: ReferralAuditEntry = {
      id: generateId('AUDIT-REF'),
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
    await dbService.put('referralAuditLogs', entry)
    return entry
  },

  async getForEntity(entityType: string, entityId: string): Promise<ReferralAuditEntry[]> {
    const all = (await dbService.getAll<ReferralAuditEntry>('referralAuditLogs')) || []
    return all
      .filter(e => e.entityType === entityType && e.entityId === entityId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },

  async getAll(limit = 200): Promise<ReferralAuditEntry[]> {
    const all = (await dbService.getAll<ReferralAuditEntry>('referralAuditLogs')) || []
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },
}

export default referralAuditService
