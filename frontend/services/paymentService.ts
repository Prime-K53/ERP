import { dbService } from './db';
import { Invoice, Customer, CustomerPayment } from '../types';
import { roundFinancial } from '../utils/helpers';
import {
    buildCustomerReceiptDoc,
    calculateCustomerPaymentSnapshot
} from './receiptCalculationService';

export interface LedgerEntry {
    date: string;
    type: 'INVOICE' | 'PAYMENT';
    reference_no: string;
    memo?: string;
    debit: number;
    credit: number;
}

export const paymentService = {
    /**
     * Calculates the total outstanding balance for a customer before applying a new payment.
     * Equivalent to: 
     * SELECT SUM(total_amount - paidAmount) as outstanding_balance 
     * FROM invoices 
     * WHERE customer_id = ? AND status != 'Paid';
     */
    async getCustomerOutstandingBalance(customerId: string): Promise<number> {
        const invoices = await dbService.getAll<Invoice>('invoices');

        const outstandingBalance = invoices
            .filter(inv => inv.customerId === customerId && inv.status !== 'Paid' && inv.status !== 'Cancelled')
            .reduce((sum, inv) => {
                const balance = (inv.totalAmount || 0) - (inv.paidAmount || 0);
                return sum + (balance > 0 ? balance : 0);
            }, 0);

        return roundFinancial(outstandingBalance);
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
     * Fetches the Ledger for a specific customer within a date range.
     * Equivalent to the user provided SQL query:
     * SELECT date, type, reference_no, debit, credit 
     * FROM ( ... UNION ALL ... ) 
     * WHERE customer_id = ? AND date BETWEEN ? AND ? 
     * ORDER BY date ASC;
     */
    async getCustomerLedger(customerId: string, startDate: string, endDate: string): Promise<LedgerEntry[]> {
        const allInvoices = await dbService.getAll<Invoice>('invoices');
        const customerInvoices = allInvoices.filter(inv => inv.customerId === customerId);
        const allPayments = await dbService.getAll<CustomerPayment>('customerPayments');
        const customerPayments = allPayments.filter(payment => payment.customerId === customerId);

        // Map Invoices to Ledger Entries
        const invoiceEntries: LedgerEntry[] = customerInvoices.map(inv => ({
            date: inv.date,
            type: 'INVOICE',
            reference_no: inv.reference || inv.id, // Use reference if available, else ID
            memo: 'Invoice',
            debit: inv.totalAmount,
            credit: 0
        }));

        // Map payments to Ledger Entries using retained amount as source of truth.
        const paymentEntries: LedgerEntry[] = customerPayments.map(payment => ({
            date: payment.date,
            type: 'PAYMENT',
            reference_no: payment.id,
            memo: payment.paymentMethod ? `Payment (${payment.paymentMethod})` : 'Payment',
            debit: 0,
            credit: roundFinancial(
                Number(
                    payment.amountRetained ??
                    payment.receiptSnapshot?.amountRetained ??
                    payment.amount ??
                    0
                )
            )
        }));

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Combine and Filter by Date Range
        const allEntries = [...invoiceEntries, ...paymentEntries].filter(entry => {
            const entryDate = new Date(entry.date);
            return !Number.isNaN(entryDate.getTime()) && entryDate >= start && entryDate <= end;
        });

        // Sort by Date ASC
        allEntries.sort((a, b) => {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        return allEntries;
    }
};
