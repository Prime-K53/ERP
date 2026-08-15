const crypto = require('crypto');
const repo = require('./supabaseRepository.cjs');

class PaymentAllocationService {

  async allocatePayment(payment, allocations, currency = 'USD') {
    if (!allocations || allocations.length === 0) {
      throw new Error('At least one allocation is required');
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const paymentAmount = Number(payment.amount) || 0;
    const paymentCurrency = payment.currency || currency;

    if (totalAllocated > paymentAmount) {
      throw new Error(`Total allocated (${totalAllocated}) exceeds payment amount (${paymentAmount})`);
    }

    const allocationId = `ALLOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const allocationRecord = {
      id: allocationId,
      data: {
        payment_id: payment.id,
        total_allocated: totalAllocated,
        excess_amount: paymentAmount - totalAllocated,
        excess_handling: payment.excess_handling || 'credit_to_customer',
        created_at: new Date().toISOString(),
      },
    };
    await repo.upsert('payment_allocations', allocationRecord);

    for (let index = 0; index < allocations.length; index++) {
      const alloc = allocations[index];
      const oldInvoice = await repo.invoices.getById(alloc.invoiceId);
      if (oldInvoice) {
        const oldData = oldInvoice.data || oldInvoice;
        const newPaidAmount = Number(oldData.paid_amount || 0) + Number(alloc.amount);
        let newStatus = oldData.status;
        if (newPaidAmount >= Number(oldData.total_amount || 0)) newStatus = 'Paid';
        else if (newPaidAmount > 0) newStatus = 'Partially Paid';
        await repo.upsert('invoices', {
          ...oldInvoice,
          data: {
            ...oldData,
            paid_amount: newPaidAmount,
            status: newStatus,
            updated_at: new Date().toISOString(),
          },
        });
      }

      const lineRecord = {
        id: `ALLOC-LINE-${Date.now()}-${index}`,
        data: {
          allocation_id: allocationId,
          invoice_id: alloc.invoiceId,
          amount: alloc.amount,
          currency: paymentCurrency,
          created_at: new Date().toISOString(),
        },
      };
      await repo.upsert('payment_allocation_lines', lineRecord);
    }

    return {
      allocationId,
      totalAllocated,
      excess: paymentAmount - totalAllocated,
      allocations: allocations.map((a) => ({
        invoiceId: a.invoiceId,
        amount: a.amount,
      })),
    };
  }

  async getPaymentAllocations(paymentId) {
    const rows = await repo.paymentAllocations.getAll({ 'data->>payment_id': `eq.${paymentId}` });
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return rows.map((r) => ({ ...r, ...(r.data || {}) }));
  }

  async getOutstandingInvoices(customerId) {
    const rows = await repo.invoices.getAll({ 'data->>customer_id': `eq.${customerId}` });
    return rows
      .map((r) => {
        const d = r.data || r;
        return {
          ...r,
          ...d,
          outstanding: Number(d.total_amount || 0) - Number(d.paid_amount || 0),
        };
      })
      .filter((inv) => {
        const status = String(inv.status || '').toLowerCase();
        return !['paid', 'voided', 'cancelled'].includes(status);
      })
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')));
  }

  async suggestAllocation(customerId, paymentAmount) {
    const outstanding = await this.getOutstandingInvoices(customerId);
    const suggestions = [];
    let remaining = paymentAmount;

    const sorted = outstanding.sort((a, b) => {
      const aOverdue = a.due_date && new Date(a.due_date) < new Date();
      const bOverdue = b.due_date && new Date(b.due_date) < new Date();
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return new Date(a.due_date || 0) - new Date(b.due_date || 0);
    });

    for (const inv of sorted) {
      if (remaining <= 0) break;

      const invOutstanding = Number(inv.outstanding) || 0;
      const allocateAmount = Math.min(remaining, invOutstanding);

      if (allocateAmount > 0) {
        suggestions.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          outstanding: invOutstanding,
          suggestedAmount: allocateAmount,
          remainingAfter: invOutstanding - allocateAmount,
        });
        remaining -= allocateAmount;
      }
    }

    return suggestions;
  }
}

module.exports = PaymentAllocationService;
