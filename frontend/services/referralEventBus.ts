import { ReferralEvent } from '../types/referral-extended'
import { generateId } from './transactions/_internal'
import { logger } from './logger'

type EventHandler = (event: ReferralEvent) => Promise<void> | void

class ReferralEventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private history: ReferralEvent[] = []
  private maxHistory = 500
  private processing = false

  async emit(eventType: string, params: {
    source: string
    entityType: string
    entityId: string
    data?: Record<string, any>
    actorId?: string
    correlationId?: string
  }): Promise<string> {
    const eventId = generateId('EVT')
    const event: ReferralEvent = {
      id: eventId,
      eventType: eventType,
      source: params.source,
      entityType: params.entityType,
      entityId: params.entityId,
      data: params.data,
      correlationId: params.correlationId || eventId,
      actorId: params.actorId,
      timestamp: new Date().toISOString(),
      processed: false,
      retryCount: 0,
      maxRetries: 3,
    }

    this.history.unshift(event)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory)
    }

    await this.dispatch(event)
    return event.id
  }

  private async dispatch(event: ReferralEvent): Promise<void> {
    const typeHandlers = this.handlers.get(event.eventType)
    if (!typeHandlers) return

    this.processing = true
    for (const handler of typeHandlers) {
      try {
        await handler(event)
      } catch (err) {
        logger.error(`EventBus handler error for ${event.eventType}:`, err)
      }
    }
    event.processed = true
    event.processedAt = new Date().toISOString()
    this.processing = false
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)
    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  off(eventType: string, handler: EventHandler): void {
    this.handlers.get(eventType)?.delete(handler)
  }

  getHistory(eventType?: string): ReferralEvent[] {
    if (eventType) {
      return this.history.filter(e => e.eventType === eventType)
    }
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
  }
}

export const referralEventBus = new ReferralEventBus()
export default referralEventBus
