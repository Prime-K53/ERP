/**
 * Reconciliation Service
 * 
 * Provides data integrity checks and automated reconciliation between modules
 */

import { dbService } from './db';
import { financialIntegrityService } from './financialIntegrityService';

import {
  Discrepancy,
  ReconciliationResult,
  FinancialIntegrityIssue,
  FinancialIntegrityAuditResult
} from '../types';

class ReconciliationService {
  async runFullReconciliation(): Promise<ReconciliationResult> {
    const discrepancies: Discrepancy[] = [];

    const customerDiscrepancies = await this.reconcileCustomerBalances();
    discrepancies.push(...customerDiscrepancies);

    const supplierDiscrepancies = await this.reconcileSupplierBalances();
    discrepancies.push(...supplierDiscrepancies);

    const orphanedEntries = await this.findOrphanedEntries();
    discrepancies.push(...orphanedEntries);

    const integrityAudit = await financialIntegrityService.runAudit();
    discrepancies.push(...integrityAudit.issues.map(issue => ({
      type:
        issue.type === 'invoice_payment_mismatch' ? 'invoice_payment' :
        issue.type === 'missing_bank_mirror' || issue.type === 'orphaned_bank_reference' ? 'bank_mirror' :
        issue.type === 'broken_examination_link' ? 'examination_link' :
        'ledger_gap',
      entityId: issue.entityId || issue.id,
      entityName: `${issue.entityType} ${issue.entityId || issue.id}`,
      expectedValue: 0,
      actualValue: 0,
      difference: 0,
      suggestedAction: issue.recommendedAction,
      severity: issue.severity
    })));

    return {
      success: discrepancies.length === 0,
      discrepancies,
      summary: {
        totalChecked: discrepancies.length,
        totalDiscrepancies: discrepancies.length
      }
    };
  }

  async reconcileCustomerBalances(): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];
    const [customers, ledger] = await Promise.all([
      dbService.getAll<any>('customers'),
      dbService.getAll<any>('ledger')
    ]);

    const arAccountId = '1100';

    for (const customer of customers) {
      const customerEntries = ledger.filter(e => e.customerId === customer.id);
      let expectedBalance = 0;

      for (const entry of customerEntries) {
        if (entry.debitAccountId === arAccountId) expectedBalance += entry.amount;
        if (entry.creditAccountId === arAccountId) expectedBalance -= entry.amount;
      }

      const actualBalance = customer.balance || 0;
      const difference = expectedBalance - actualBalance;

      if (Math.abs(difference) > 0.01) {
        discrepancies.push({
          type: 'customer_balance',
          entityId: customer.id,
          entityName: customer.name,
          expectedValue: expectedBalance,
          actualValue: actualBalance,
          difference,
          suggestedAction: `Update balance to ${expectedBalance.toFixed(2)}`,
          severity: Math.abs(difference) > 100 ? 'high' : 'medium'
        });
      }
    }

    return discrepancies;
  }

  async reconcileSupplierBalances(): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];
    const [suppliers, ledger] = await Promise.all([
      dbService.getAll<any>('suppliers'),
      dbService.getAll<any>('ledger')
    ]);

    const apAccountId = '2000';

    for (const supplier of suppliers) {
      const supplierEntries = ledger.filter(e => e.supplierId === supplier.id);
      let expectedBalance = 0;

      for (const entry of supplierEntries) {
        if (entry.creditAccountId === apAccountId) expectedBalance += entry.amount;
        if (entry.debitAccountId === apAccountId) expectedBalance -= entry.amount;
      }

      const actualBalance = supplier.balance || 0;
      const difference = expectedBalance - actualBalance;

      if (Math.abs(difference) > 0.01) {
        discrepancies.push({
          type: 'supplier_balance',
          entityId: supplier.id,
          entityName: supplier.name,
          expectedValue: expectedBalance,
          actualValue: actualBalance,
          difference,
          suggestedAction: `Update balance to ${expectedBalance.toFixed(2)}`,
          severity: Math.abs(difference) > 100 ? 'high' : 'medium'
        });
      }
    }

    return discrepancies;
  }

  async findOrphanedEntries(): Promise<Discrepancy[]> {
    const discrepancies: Discrepancy[] = [];
    const [customers, suppliers, ledger] = await Promise.all([
      dbService.getAll<any>('customers'),
      dbService.getAll<any>('suppliers'),
      dbService.getAll<any>('ledger')
    ]);

    const customerIds = new Set(customers.map(c => c.id));
    const supplierIds = new Set(suppliers.map(s => s.id));

    for (const entry of ledger) {
      if (entry.customerId && !customerIds.has(entry.customerId)) {
        discrepancies.push({
          type: 'orphaned_entry',
          entityId: entry.id,
          entityName: `Ledger Entry ${entry.id}`,
          expectedValue: 0,
          actualValue: entry.amount,
          difference: entry.amount,
          suggestedAction: `Review orphaned ledger entry for missing customer ${entry.customerId}`,
          severity: 'low'
        });
      }

      if (entry.supplierId && !supplierIds.has(entry.supplierId)) {
        discrepancies.push({
          type: 'orphaned_entry',
          entityId: entry.id,
          entityName: `Ledger Entry ${entry.id}`,
          expectedValue: 0,
          actualValue: entry.amount,
          difference: entry.amount,
          suggestedAction: `Review orphaned ledger entry for missing supplier ${entry.supplierId}`,
          severity: 'low'
        });
      }
    }

    return discrepancies;
  }
}

export const reconciliationService = new ReconciliationService();
export default reconciliationService;
