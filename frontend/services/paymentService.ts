import { dbService } from './db';
import { Invoice, Customer, CustomerPayment } from '../types';
import { roundFinancial } from '../utils/helpers';
import {
    buildCustomerReceiptDoc,
    calculateCustomerPaymentSnapshot
} from './receiptCalculationService';
import { buildLedgerFromRecords } from './customerLedger';

export interface LedgerEntry {
    date: string;
    type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
    reference_no: string;
    memo?: string;
    debit: number;
    credit: number;
}

export const paymentService = {
    /**
     * Canonical outstanding balance — derived by the authoritative customer
     * ledger (services/customerLedger.ts), shared with the backend and all
     * other financial views. Previously this was a private per-invoice sum.
     */
    async getCustomerOutstandingBalance(customerId: string): Promise<number> {
        return roundFinancial(await getOutstandingViaLedger(customerId));
    },

    /**
     * Updates the customer's wallet if there is an overpayment.
     * Equivalent to:
     * UPDATE customers 
     * SET wallet_balance = wallet_balance + ? 
     * WHERE id = ?;
     */
    async updateCustomerWallet(customerId: string, amount: number): Promise<void> {
        const customer = await dbService.get<Customer>('customers', customerId);
        if (!customer) {
            throw new Error(`Customer with ID ${customerId} not found.`);
        }

        const updatedCustomer: Customer = {
            ...customer,
            walletBalance: roundFinancial((customer.walletBalance || 0) + amount)
        };

        await dbService.put('customers', updatedCustomer);

        // Log wallet transaction
        const transactionId = `WTX-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await dbService.put('walletTransactions', {
            id: transactionId,
            customerId: customerId,
            date: new Date().toISOString(),
            amount: amount,
            type: amount > 0 ? 'Credit' : 'Debit',
            description: amount > 0 ? 'Overpayment credited to wallet' : 'Wallet balance adjusted',
            referenceId: 'MANUAL_ADJUSTMENT'
        });
    },

    /**
     * Internal reconciliation logic for consistent balance handling.
     * Only flags as overpayment if balance is negative.
     */
    processReconciliation(totalDue: number, amountPaid: number) {
        const balance = totalDue - amountPaid;
        return {
            isOverpaid: balance < 0,
            walletDeposit: balance < 0 ? Math.abs(balance) : 0,
            remainingBalance: balance > 0 ? balance : 0
        };
    },

    /**
     * @deprecated Receipt preview should use persisted payment snapshots.
     * Legacy compatibility wrapper retained for older call paths.
     */
    async processPayment(
        customerId: string,
        paymentAmount: number,
        invoiceIds: string[],
        customerName: string,
        paymentMethod: string,
        existingExcess?: number
    ) {
        const amountTendered = roundFinancial(Number(paymentAmount || 0));
        const allInvoices = await dbService.getAll<Invoice>('invoices');
        const targeted = allInvoices.filter(inv =>
            invoiceIds.includes(inv.id) &&
            (!customerId || inv.customerId === customerId)
        );

        let remaining = amountTendered;
        const appliedInvoices = targeted.map(inv => {
            const outstanding = roundFinancial(Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0)));
            const allocationAmount = roundFinancial(Math.min(remaining, outstanding));
            remaining = roundFinancial(remaining - allocationAmount);
            return {
                invoiceId: inv.id,
                allocationAmount,
                outstandingAmount: outstanding
            };
        }).filter(entry => entry.allocationAmount > 0);

        const snapshot = calculateCustomerPaymentSnapshot({
            amountTendered,
            appliedInvoices,
            excessHandling: (existingExcess || 0) > 0 ? 'Wallet' : undefined,
            paymentPurpose: appliedInvoices.length > 0 ? 'INVOICE_PAYMENT' : 'UNALLOCATED_PAYMENT',
            paymentDate: new Date().toISOString(),
            customerName
        });

        const pseudoPayment: CustomerPayment = {
            id: `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            date: new Date().toISOString(),
            customerId,
            customerName,
            amount: amountTendered,
            paymentMethod,
            allocations: appliedInvoices.map(entry => ({
                invoiceId: entry.invoiceId,
                amount: entry.allocationAmount
            })),
            status: 'Cleared',
            reconciled: false,
            excessHandling: snapshot.walletDeposit > 0 ? 'Wallet' : undefined,
            receiptSnapshot: snapshot,
            invoiceTotal: snapshot.invoiceTotalAtPosting,
            paymentStatus: snapshot.paymentStatus,
            balanceDue: snapshot.balanceDueAfterPayment,
            overpaymentAmount: snapshot.walletDeposit,
            walletDeposit: snapshot.walletDeposit,
            changeGiven: snapshot.changeGiven,
            amountApplied: snapshot.amountApplied,
            amountRetained: snapshot.amountRetained,
            calculationVersion: snapshot.calculationVersion
        };

        const currentBalance = await this.getCustomerOutstandingBalance(customerId);
        return buildCustomerReceiptDoc({
            payment: pseudoPayment,
            customerName,
            snapshot,
            currentBalance
        });
    },

    /**
     * Fetches the canonical customer ledger within a date range.
     * Inclusion rules, amounts (amountApplied ?? amountRetained ?? amount),
     * signs, and ordering all come from the authoritative ledger module —
     * identical to the backend and every other financial view.
     */
    async getCustomerLedger(customerId: string, startDate: string, endDate: string): Promise<LedgerEntry[]> {
        const [allInvoices, allPayments] = await Promise.all([
            dbService.getAll<any>('invoices'),
            dbService.getAll<any>('customerPayments'),
        ]);
        const ledger = buildLedgerFromRecords({
            customerId,
            invoices: allInvoices.filter(inv => inv.customerId === customerId),
            payments: allPayments.filter(payment => payment.customerId === customerId),
        });

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        return ledger.transactions
            .map(tx => ({
                date: String(tx.date || ''),
                type: tx.type === 'credit_note' ? 'CREDIT_NOTE' as const : tx.type === 'payment' ? 'PAYMENT' as const : 'INVOICE' as const,
                reference_no: tx.reference,
                memo: tx.description,
                debit: tx.debit,
                credit: tx.credit,
            }))
            .filter(entry => {
                const entryDate = new Date(entry.date);
                return !Number.isNaN(entryDate.getTime()) && entryDate >= start && entryDate <= end;
            });
    }
};

async function getOutstandingViaLedger(customerId: string): Promise<number> {
    const [allInvoices, allPayments] = await Promise.all([
        dbService.getAll<any>('invoices'),
        dbService.getAll<any>('customerPayments'),
    ]);
    const ledger = buildLedgerFromRecords({
        customerId,
        invoices: allInvoices.filter(inv => inv.customerId === customerId),
        payments: allPayments.filter(payment => payment.customerId === customerId),
    });
    return ledger.outstandingBalance;
}
