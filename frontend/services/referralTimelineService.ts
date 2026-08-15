import { ReferralTimelineEntry } from '../types/referral-extended'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

export const referralTimelineService = {
  async addEntry(params: {
    referralId: string
    eventType: ReferralTimelineEntry['eventType']
    title: string
    description?: string
    amount?: number
    actorId?: string
    actorName?: string
    metadata?: Record<string, any>
  }): Promise<ReferralTimelineEntry> {
    const entry: ReferralTimelineEntry = {
      id: generateId('TIMELINE'),
      referralId: params.referralId,
      eventType: params.eventType,
      title: params.title,
      description: params.description,
      amount: params.amount,
      actorId: params.actorId,
      actorName: params.actorName,
      metadata: params.metadata,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    await dbService.put('referralTimeline', entry)
    return entry
  },

  async getTimelineForReferral(referralId: string): Promise<ReferralTimelineEntry[]> {
    const all = (await dbService.getAll<ReferralTimelineEntry>('referralTimeline')) || []
    return all
      .filter(e => e.referralId === referralId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  },

  async getAllTimeline(limit = 100): Promise<ReferralTimelineEntry[]> {
    const all = (await dbService.getAll<ReferralTimelineEntry>('referralTimeline')) || []
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },
}

export default referralTimelineService
