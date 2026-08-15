
export type PaymentStatus = 'PARTIALLY PAID' | 'PAID' | 'OVERPAID';

export interface PaymentCalculation {
    paymentStatus: PaymentStatus;
    invoiceTotal: number;
    amountPaid: number;
    outstandingBalance: number;
    overpaymentAmount: number;
    walletCredit: number;
}

/**
 * Audit and refactor of payment calculation logic to ensure consistency across the application.
 * Follows the specific rules for Partial, Paid, and Overpaid status.
 */
export const calculatePaymentDetails = (invoiceTotal: number, amountPaid: number): PaymentCalculation => {
    // Round to 2 decimal places to avoid floating point issues
    const total = Math.round(invoiceTotal * 100) / 100;
    const paid = Math.round(amountPaid * 100) / 100;

    if (paid < total) {
        return {
            paymentStatus: 'PARTIALLY PAID',
            invoiceTotal: total,
            amountPaid: paid,
            outstandingBalance: Math.round((total - paid) * 100) / 100,
            overpaymentAmount: 0,
            walletCredit: 0
        };
    } else if (paid === total) {
        return {
            paymentStatus: 'PAID',
            invoiceTotal: total,
            amountPaid: paid,
            outstandingBalance: 0,
            overpaymentAmount: 0,
            walletCredit: 0
        };
    } else {
        const overpayment = Math.round((paid - total) * 100) / 100;
        return {
            paymentStatus: 'OVERPAID',
            invoiceTotal: total,
            amountPaid: paid,
            outstandingBalance: 0,
            overpaymentAmount: overpayment,
            walletCredit: overpayment
        };
    }
};

/**
 * Standard utility to generate the payment narrative required for receipts.
 */
export const getPaymentNarrative = (calc: PaymentCalculation, customerName: string, date: string, invoiceNumber: string, currency: string = '$') => {
    const formattedDate = new Date(date).toLocaleDateString();

    if (calc.paymentStatus === 'PARTIALLY PAID') {
        return `This is to acknowledge that Prime ERP has received a payment of ${currency} ${calc.amountPaid.toLocaleString()} from ${customerName} on ${formattedDate}. This payment has been applied toward Invoice ${invoiceNumber}.

Invoice Amount: ${currency} ${calc.invoiceTotal.toLocaleString()}
Amount Paid: ${currency} ${calc.amountPaid.toLocaleString()}
Outstanding Balance: ${currency} ${calc.outstandingBalance.toLocaleString()}

This receipt confirms a partial settlement of the invoice.`;
    }

    return `Receipt acknowledgment for payment of ${currency} ${calc.amountPaid.toLocaleString()} received from ${customerName} on ${formattedDate} for Invoice ${invoiceNumber}.`;
};
