import { IEngagementPlugin, EngagementPluginContext } from '../../types/engagement-plugin'
import { EngagementPluginResult, CashbackEntry, ENGAGEMENT_EVENT_TYPES } from '../../types/engagement'
import { generateId } from '../transactions/_internal'
import { dbService } from '../db'
import { logger } from '../logger'
import { referralEventBus } from '../referralEventBus'
import { WalletTransaction } from '../../types'

export const cashbackPlugin: IEngagementPlugin = {
  id: 'cashback',
  name: 'Cashback',
  supportedEvents: ['invoice.paid'],
  priority: 45,

  async enabled(context: EngagementPluginContext): Promise<boolean> {
    return context.companyConfig?.engagementSettings?.cashbackEnabled ?? false
  },

  async execute(event: any, context: EngagementPluginContext): Promise<EngagementPluginResult | null> {
    const { customer, companyConfig } = context
    const settings = companyConfig?.engagementSettings
    if (!customer?.id) return null

    if (event.eventType !== 'invoice.paid') return null

    const paidAmount = event.data?.paidAmount ?? event.data?.amount ?? 0
    if (paidAmount <= 0) return null

    const invoiceId = event.data?.id || event.entityId
    const invoiceCategory = event.data?.category

    const defaultRate = (settings?.cashbackDefaultRate ?? 0) / 100
    const categoryRates: Record<string, number> = settings?.cashbackCategoryRates ?? {}
    const cashbackType = settings?.cashbackType ?? 'immediate'
    const delayDays = settings?.cashbackDelayDays ?? 0
    const expiryDays = settings?.cashbackExpiryDays ?? 90
    const requireApproval = settings?.cashbackRequireApproval ?? false
    const autoApproveThreshold = settings?.cashbackAutoApproveThreshold ?? 50
    const maxPerTransaction = settings?.cashbackMaxPerTransaction ?? 0
    const maxPerDay = settings?.cashbackMaxPerDay ?? 0

    const rate = invoiceCategory && categoryRates[invoiceCategory]
      ? (categoryRates[invoiceCategory] / 100)
      : defaultRate

    let amount = paidAmount * rate
    if (maxPerTransaction > 0 && amount > maxPerTransaction) amount = maxPerTransaction

    if (maxPerDay > 0) {
      try {
        const allCashback = await dbService.getAll<CashbackEntry>('engagementCashback')
        const today = new Date().toISOString().slice(0, 10)
        const todayTotal = allCashback
          .filter((c: any) => c.customerId === customer.id && c.createdAt?.startsWith(today) && c.status !== 'reversed')
          .reduce((sum: number, c: any) => sum + (c.amount ?? 0), 0)
        if (todayTotal + amount > maxPerDay) amount = Math.max(0, maxPerDay - todayTotal)
      } catch { }
    }

    if (amount <= 0) return null

    amount = Math.round(amount * 100) / 100

    try {
      let status: CashbackEntry['status'] = 'approved'
      let scheduledAt: string | undefined

      if (requireApproval && amount > autoApproveThreshold) {
        status = 'pending'
      }

      if (cashbackType === 'delayed' && delayDays > 0) {
        scheduledAt = new Date(Date.now() + delayDays * 86400000).toISOString()
        if (status !== 'pending') status = 'pending'
      }

      if (cashbackType === 'scheduled') {
        status = 'pending'
      }

      const cashbackEntry: CashbackEntry = {
        id: generateId('CBK'),
        customerId: customer.id,
        invoiceId,
        amount,
        rate: Math.round(rate * 10000) / 100,
        type: invoiceCategory && categoryRates[invoiceCategory] ? 'category' : 'percentage',
        status,
        category: invoiceCategory,
        scheduledAt,
        expiresAt: expiryDays > 0
          ? new Date(Date.now() + expiryDays * 86400000).toISOString()
          : undefined,
        createdAt: new Date().toISOString(),
      }

      await dbService.put('engagementCashback', cashbackEntry as any)

      referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.CASHBACK_ISSUED, {
        source: 'cashbackPlugin',
        entityType: 'cashback',
        entityId: cashbackEntry.id,
        data: { amount, rate, status, invoiceId, scheduledAt },
        actorId: event.actorId,
        correlationId: event.correlationId,
      })

      return {
        applied: true,
        description: `Cashback ${amount} (${(rate * 100).toFixed(2)}%)${status === 'pending' ? ' — pending' : ''}`,
        cashback: amount,
        metadata: { cashbackId: cashbackEntry.id, rate: rate * 100, status, scheduledAt, invoiceId },
      }
    } catch (err) {
      logger.error('CashbackPlugin: failed to process:', err)
      return null
    }
  },
}

export async function approveCashback(cashbackId: string, approvedBy: string): Promise<void> {
  try {
    const all = await dbService.getAll<CashbackEntry>('engagementCashback')
    const entry = all.find((c: any) => c.id === cashbackId)
    if (!entry || entry.status !== 'pending') throw new Error('Cashback entry not found or not pending')

    entry.status = 'approved'
    entry.approvedAt = new Date().toISOString()
    entry.approvedBy = approvedBy

    await dbService.put('engagementCashback', entry as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.CASHBACK_APPROVED, {
      source: 'cashbackPlugin',
      entityType: 'cashback',
      entityId: cashbackId,
      data: { amount: entry.amount },
      actorId: approvedBy,
    })

    // Auto-pay if no further delay is configured
    if (!entry.scheduledAt) {
      await payCashback(cashbackId)
    }
  } catch (err) {
    logger.error('CashbackPlugin: approveCashback failed:', err)
    throw err
  }
}

export async function payCashback(cashbackId: string, walletTxId?: string): Promise<string> {
  try {
    const all = await dbService.getAll<CashbackEntry>('engagementCashback')
    const entry = all.find((c: any) => c.id === cashbackId)
    if (!entry) throw new Error('Cashback entry not found')

    const customers = await dbService.getAll<any>('customers')
    const customer = customers.find((c: any) => c.id === entry.customerId)
    if (!customer) throw new Error('Customer not found')

    const txId = walletTxId || generateId('WLT-CBK')

    const walletTx: WalletTransaction = {
      id: txId,
      customerId: entry.customerId,
      amount: entry.amount,
      type: 'Credit',
      date: new Date().toISOString(),
      reference: `Cashback for invoice #${entry.invoiceId}`,
      description: `Cashback credit (${entry.rate?.toFixed(2)}%)`,
    }

    await dbService.executeAtomicOperation(
      ['engagementCashback', 'customers', 'walletTransactions'],
      async (tx) => {
        entry.status = 'paid'
        entry.walletTxId = txId
        entry.updatedAt = new Date().toISOString()
        await tx.objectStore('engagementCashback').put(entry)

        customer.walletBalance = (customer.walletBalance || 0) + entry.amount
        await tx.objectStore('customers').put(customer)

        await tx.objectStore('walletTransactions').put(walletTx)
      }
    )

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.CASHBACK_ISSUED, {
      source: 'cashbackPlugin',
      entityType: 'cashback',
      entityId: cashbackId,
      data: { amount: entry.amount, walletTxId: txId, status: 'paid' },
      actorId: 'system',
    })

    return txId
  } catch (err) {
    logger.error('CashbackPlugin: payCashback failed:', err)
    throw err
  }
}

export async function reverseCashback(cashbackId: string, reversedBy: string, reason: string): Promise<void> {
  try {
    const all = await dbService.getAll<CashbackEntry>('engagementCashback')
    const entry = all.find((c: any) => c.id === cashbackId)
    if (!entry) throw new Error('Cashback entry not found')

    entry.status = 'reversed'
    entry.reversedAt = new Date().toISOString()
    entry.reversedBy = reversedBy
    entry.reverseReason = reason
    entry.updatedAt = new Date().toISOString()

    await dbService.put('engagementCashback', entry as any)

    referralEventBus.emit(ENGAGEMENT_EVENT_TYPES.CASHBACK_REVERSED, {
      source: 'cashbackPlugin',
      entityType: 'cashback',
      entityId: cashbackId,
      data: { amount: entry.amount, reason },
      actorId: reversedBy,
    })
  } catch (err) {
    logger.error('CashbackPlugin: reverseCashback failed:', err)
    throw err
  }
}

export default cashbackPlugin
