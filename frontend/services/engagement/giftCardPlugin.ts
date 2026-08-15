import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, GiftCard, GiftCardTransaction, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'

export const giftCardPlugin: IEngagementPlugin = {
  id: 'giftcard',
  name: 'Gift Cards',
  supportedEvents: ['invoice.paid', 'giftcard.created', 'giftcard.redeemed'],
  priority: 60,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.giftCardsEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer } = context
    if (!customer?.id) return null

    if (event.eventType === 'giftcard.created') {
      return handleGiftCardCreated(event, customer.id)
    }

    if (event.eventType === 'giftcard.redeemed') {
      return handleGiftCardRedeemed(event, customer.id)
    }

    if (event.eventType === 'invoice.paid' && event.data?.giftCardPayment) {
      return handleGiftCardPayment(event, customer.id)
    }

    return null
  },
}

async function handleGiftCardCreated(event: any, customerId: string): Promise<EngagementPluginResult | null> {
  const data = event.data
  if (!data?.initialBalance || data.initialBalance <= 0) return null

  try {
    const code = data.code || generateGiftCardCode()
    const giftCard: GiftCard = {
      id: generateId('GC'),
      code,
      pin: data.pin,
      customerId,
      issuerId: event.actorId || customerId,
      initialBalance: data.initialBalance,
      currentBalance: data.initialBalance,
      status: 'active',
      type: data.type ?? 'digital',
      expiresAt: data.expiresAt,
      activatedAt: new Date().toISOString(),
      rechargeable: data.rechargeable ?? false,
      transferable: data.transferable ?? false,
      giftMessage: data.giftMessage,
      purchasedWith: data.purchasedWith,
      createdAt: new Date().toISOString(),
    }

    await dbService.put('engagementGiftCards', giftCard as any)

    const tx: GiftCardTransaction = {
      id: generateId('GCTX'),
      giftCardId: giftCard.id,
      type: 'issued',
      amount: data.initialBalance,
      balanceAfter: data.initialBalance,
      referenceType: 'giftcard',
      customerId,
      description: `Gift card ${code} created with $${data.initialBalance}`,
      createdAt: new Date().toISOString(),
    }

    await dbService.put('engagementGiftCardTransactions', tx as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.GIFTCARD_CREATED, {
      source: 'giftCardPlugin',
      entityType: 'giftcard',
      entityId: giftCard.id,
      data: { code, initialBalance: data.initialBalance },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `Gift card ${code} created — $${data.initialBalance}`,
      metadata: { giftCardId: giftCard.id, code, initialBalance: data.initialBalance },
    }
  } catch (err) {
    logger.error('GiftCardPlugin: creation failed:', err)
    return null
  }
}

async function handleGiftCardRedeemed(event: any, customerId: string): Promise<EngagementPluginResult | null> {
  const data = event.data
  if (!data?.giftCardId || !data?.amount || data.amount <= 0) return null

  try {
    const allCards = await dbService.getAll<GiftCard>('engagementGiftCards')
    const card = allCards.find((c: any) => c.id === data.giftCardId)
    if (!card) return null
    if (card.status !== 'active') return null
    if ((card.currentBalance ?? 0) < data.amount) return null
    if (card.expiresAt && new Date(card.expiresAt) < new Date()) return null

    const balanceBefore = card.currentBalance
    card.currentBalance -= data.amount
    card.updatedAt = new Date().toISOString()

    if (card.currentBalance <= 0) {
      card.status = 'redeemed'
    }

    await dbService.put('engagementGiftCards', card as any)

    const tx: GiftCardTransaction = {
      id: generateId('GCTX'),
      giftCardId: card.id,
      type: 'redeemed',
      amount: data.amount,
      balanceAfter: card.currentBalance,
      referenceType: data.referenceType || 'invoice',
      referenceId: data.referenceId,
      customerId,
      description: `Redeemed $${data.amount} from gift card ${card.code}`,
      createdAt: new Date().toISOString(),
    }

    await dbService.put('engagementGiftCardTransactions', tx as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.GIFTCARD_REDEEMED, {
      source: 'giftCardPlugin',
      entityType: 'giftcard',
      entityId: card.id,
      data: { code: card.code, amount: data.amount, balanceAfter: card.currentBalance },
      actorId: event.actorId,
      correlationId: event.correlationId,
    })

    return {
      applied: true,
      description: `Gift card ${card.code} redeemed $${data.amount}`,
      cashback: -data.amount,
      metadata: { giftCardId: card.id, code: card.code, balanceBefore, balanceAfter: card.currentBalance },
    }
  } catch (err) {
    logger.error('GiftCardPlugin: redemption failed:', err)
    return null
  }
}

async function handleGiftCardPayment(event: any, customerId: string): Promise<EngagementPluginResult | null> {
  const giftCardPayment = event.data?.giftCardPayment
  if (!giftCardPayment?.giftCardId || !giftCardPayment?.amount) return null

  return handleGiftCardRedeemed(
    { ...event, data: { ...event.data, giftCardId: giftCardPayment.giftCardId, amount: giftCardPayment.amount } },
    customerId
  )
}

export async function rechargeGiftCard(giftCardId: string, amount: number, rechargedBy?: string): Promise<GiftCard | null> {
  try {
    const allCards = await dbService.getAll<GiftCard>('engagementGiftCards')
    const card = allCards.find((c: any) => c.id === giftCardId)
    if (!card) throw new Error('Gift card not found')
    if (!card.rechargeable) throw new Error('Gift card is not rechargeable')
    if (card.status !== 'active' && card.status !== 'redeemed') throw new Error('Gift card cannot be recharged')

    card.currentBalance += amount
    card.status = 'active'
    card.updatedAt = new Date().toISOString()
    await dbService.put('engagementGiftCards', card as any)

    const tx: GiftCardTransaction = {
      id: generateId('GCTX'),
      giftCardId: card.id,
      type: 'recharged',
      amount,
      balanceAfter: card.currentBalance,
      description: `Recharged $${amount}`,
      createdAt: new Date().toISOString(),
    }
    await dbService.put('engagementGiftCardTransactions', tx as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.GIFTCARD_RECHARGED, {
      source: 'giftCardPlugin',
      entityType: 'giftcard',
      entityId: card.id,
      data: { code: card.code, amount, balanceAfter: card.currentBalance },
      actorId: rechargedBy,
    })

    return card
  } catch (err) {
    logger.error('GiftCardPlugin: recharge failed:', err)
    throw err
  }
}

export async function cancelGiftCard(giftCardId: string, reason: string, cancelledBy?: string): Promise<void> {
  try {
    const allCards = await dbService.getAll<GiftCard>('engagementGiftCards')
    const card = allCards.find((c: any) => c.id === giftCardId)
    if (!card) throw new Error('Gift card not found')

    card.status = 'cancelled'
    card.cancelledAt = new Date().toISOString()
    card.cancelReason = reason
    card.updatedAt = new Date().toISOString()
    await dbService.put('engagementGiftCards', card as any)

    const tx: GiftCardTransaction = {
      id: generateId('GCTX'),
      giftCardId: card.id,
      type: 'cancelled',
      amount: 0,
      balanceAfter: card.currentBalance,
      description: `Cancelled: ${reason}`,
      createdAt: new Date().toISOString(),
    }
    await dbService.put('engagementGiftCardTransactions', tx as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.GIFTCARD_CANCELLED, {
      source: 'giftCardPlugin',
      entityType: 'giftcard',
      entityId: card.id,
      data: { code: card.code, reason },
      actorId: cancelledBy,
    })
  } catch (err) {
    logger.error('GiftCardPlugin: cancel failed:', err)
    throw err
  }
}

function generateGiftCardCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default giftCardPlugin
