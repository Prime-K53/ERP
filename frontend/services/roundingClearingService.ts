import { dbService } from './db';

const ROUNDING_CLEARING_ACCOUNT = '4998';
const ROUNDING_ACCRUAL_ACCOUNT = '2290';

export interface RoundingClearanceSummary {
  periodStart: string;
  periodEnd: string;
  netRoundingAmount: number;
  positiveRoundingCount: number;
  negativeRoundingCount: number;
  transactionCount: number;
  journalEntryId: string;
  clearedAt: string;
}

export async function getUnclearedRoundingTotal(): Promise<number> {
  const logs = await dbService.getAll<any>('roundingLogs');
  const allLedger = await dbService.getAll<any>('ledger');
  const clearedEntryIds = new Set(
    allLedger
      .filter((l: any) => l.id?.startsWith('LG-RNDCLR'))
      .map((l: any) => l.id)
  );
  return logs.reduce((sum: number, l: any) => sum + (l.rounding_difference || 0), 0);
}

export async function clearRoundingForPeriod(
  periodStart: string,
  periodEnd: string,
  performedBy: string = 'System',
): Promise<RoundingClearanceSummary> {
  const logs = await dbService.getAll<any>('roundingLogs');
  const inRange = logs.filter((l: any) => {
    const d = l.date || l.createdAt || '';
    return d >= periodStart && d <= periodEnd;
  });
  if (inRange.length === 0) {
    throw new Error('No rounding logs found in the specified period');
  }

  const netAmount = inRange.reduce((sum: number, l: any) => sum + (l.rounding_difference || 0), 0);
  const positiveCount = inRange.filter((l: any) => (l.rounding_difference || 0) > 0).length;
  const negativeCount = inRange.filter((l: any) => (l.rounding_difference || 0) < 0).length;
  const clearedAt = new Date().toISOString();

  const journalEntryId = `LG-RNDCLR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const absAmount = Math.abs(Math.round(netAmount * 100) / 100);

  const entry: any = {
    id: journalEntryId,
    date: clearedAt,
    description: `Rounding clearance ${periodStart.slice(0, 10)} to ${periodEnd.slice(0, 10)}`,
    referenceId: `RNDCLR-${periodStart.slice(0, 7)}`,
    reconciled: false,
    performedBy,
    type: 'rounding_clearance',
  };

  if (netAmount > 0) {
    entry.debitAccountId = ROUNDING_ACCRUAL_ACCOUNT;
    entry.creditAccountId = ROUNDING_CLEARING_ACCOUNT;
    entry.amount = absAmount;
  } else if (netAmount < 0) {
    entry.debitAccountId = ROUNDING_CLEARING_ACCOUNT;
    entry.creditAccountId = ROUNDING_ACCRUAL_ACCOUNT;
    entry.amount = absAmount;
  } else {
    throw new Error('Net rounding amount is zero — nothing to clear');
  }

  await dbService.put('ledger', entry);

  return {
    periodStart,
    periodEnd,
    netRoundingAmount: Math.round(netAmount * 100) / 100,
    positiveRoundingCount: positiveCount,
    negativeRoundingCount: negativeCount,
    transactionCount: inRange.length,
    journalEntryId,
    clearedAt,
  };
}

export async function getRoundingClearanceHistory(): Promise<RoundingClearanceSummary[]> {
  const allLedger = await dbService.getAll<any>('ledger');
  return allLedger
    .filter((l: any) => l.description?.startsWith('Rounding clearance'))
    .map((l: any) => ({
      periodStart: l.description?.match(/Rounding clearance (.+?) to/)?.[1] || '',
      periodEnd: l.description?.match(/to (.+?)$/)?.[1] || '',
      netRoundingAmount: l.amount * (l.debitAccountId === ROUNDING_ACCRUAL_ACCOUNT ? 1 : -1),
      positiveRoundingCount: 0,
      negativeRoundingCount: 0,
      transactionCount: 0,
      journalEntryId: l.id,
      clearedAt: l.date || l.timestamp || '',
    }))
    .sort((a: any, b: any) => new Date(b.clearedAt).getTime() - new Date(a.clearedAt).getTime());
}
