import { EngagementTimelineEntry } from '../types/engagement'
import { dbService } from './db'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

export const engagementTimelineService = {
  async addEntry(params: {
    customerId: string
    eventType: string
    title: string
    description?: string
    amount?: number
    points?: number
    tierName?: string
    referenceType: string
    referenceId: string
    metadata?: Record<string, any>
    actorId?: string
    actorName?: string
    timestamp?: string
  }): Promise<EngagementTimelineEntry> {
    const entry: EngagementTimelineEntry = {
      id: generateId('ETL'),
      customerId: params.customerId,
      eventType: params.eventType,
      title: params.title,
      description: params.description,
      amount: params.amount,
      points: params.points,
      tierName: params.tierName,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      metadata: params.metadata,
      actorId: params.actorId,
      actorName: params.actorName,
      timestamp: params.timestamp || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    await dbService.put('engagementTimeline', entry)
    return entry
  },

  async getTimelineForCustomer(customerId: string, limit = 100): Promise<EngagementTimelineEntry[]> {
    const all = await dbService.getAll<EngagementTimelineEntry>('engagementTimeline')
    return all
      .filter(e => e.customerId === customerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },

  async getAllTimeline(limit = 200): Promise<EngagementTimelineEntry[]> {
    const all = await dbService.getAll<EngagementTimelineEntry>('engagementTimeline')
    return all
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  },
}

export default engagementTimelineService
