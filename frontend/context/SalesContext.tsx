import React, { createContext, useContext, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useSalesStore } from '../stores/salesStore';
import { useFinance } from './FinanceContext';
import { useProductionStore } from '../stores/productionStore';
import { useInventoryStore } from '../stores/inventoryStore';
import { Sale, Quotation, JobOrder, HeldOrder, ZReport, CustomerPayment, Invoice, WorkOrder, LedgerEntry, RecurringInvoice, WalletTransaction, CartItem, Customer, SalesExchange, ReprintJob, SalesOrder, Shipment, Order } from '../types';
import { generateCustomerId, generateNextId, roundFinancial, resolveCustomerPaymentPolicy, resolveCustomerPaymentTerms } from '../utils/helpers';
import { useAuth } from './AuthContext';
import { bomService } from '../services/bomService';
import { transactionService } from '../services/transactionService';
import { inventoryReservationService, inventoryTransactionService } from '../services/inventoryTransactionService';
import { api } from '../services/api';
import { examinationBatchService } from '../services/examinationBatchService';
import { jobTicketConversionService } from '../services/jobTicketConversionService';
import { generateNextSalesInvoiceNumber } from '../services/documentNumberService';
import { salesOrderService } from '../services/salesOrderService';
import { addDays, addMonths, addYears, isBefore, parseISO, format, isSameDay } from 'date-fns';
import { aggregateMarketAdjustmentSnapshots, attachPricingBreakdown, summarizePricingBreakdown } from '../utils/pricingBreakdown';

import { customerNotificationService, type NotificationActivityType } from '../services/customerNotificationService';
import { workflowService as autoWorkflowService } from '../services/automatedWorkflowService';
import { isSupabaseConfigured } from '../services/cloudMode';
import { adminLifecycle, type PortalCredentials } from '../services/adminPortalClient';

type ApprovedQuotationResult = {
    batchId?: string;
};

type ExaminationQuotationClassInput = {
    id?: string;
    className?: string;
    class_name?: string;
    learners?: number;
    number_of_learners?: number;
};

type ExaminationQuotationDetails = {
    batchName: string;
    academicYear: string;
    term: string;
    examType: string;
    pricePerLearner: number;
    classes: Array<{
        id: string;
        className: string;
        learners: number;
    }>;
};

const normalizeExaminationQuotationDetails = (raw: any): ExaminationQuotationDetails => {
    const currentYear = new Date().getFullYear().toString();
    const rawClasses = Array.isArray(raw?.classes) ? raw.classes : [];
    return {
        batchName: String(raw?.batchName || raw?.batch_name || '').trim(),
        academicYear: String(raw?.academicYear || raw?.academic_year || currentYear).trim() || currentYear,
        term: String(raw?.term || '1').trim() || '1',
        examType: String(raw?.examType || raw?.exam_type || 'Mid-Term').trim() || 'Mid-Term',
        pricePerLearner: Math.max(0, Number(raw?.pricePerLearner ?? raw?.price_per_learner) || 0),
        classes: rawClasses
            .map((entry: ExaminationQuotationClassInput, index: number) => ({
                id: String(entry?.id || `EXAM-CLASS-${index + 1}`),
                className: String(entry?.className || entry?.class_name || '').trim(),
                learners: Math.max(0, Math.floor(Number(entry?.learners ?? entry?.number_of_learners) || 0))
            }))
            .filter((entry) => entry.className || entry.learners > 0)
    };
};

interface SalesContextType {
    sales: Sale[];
    invoices: Invoice[];
    quotations: Quotation[];
    jobOrders: JobOrder[];
    heldOrders: HeldOrder[];
    zReports: ZReport[];
    customerPayments: CustomerPayment[];
    customers: Customer[];
    salesOrders: SalesOrder[];
    salesExchanges: SalesExchange[];
    reprintJobs: ReprintJob[];
    shipments: Shipment[];
    isLoading: boolean;
    isPosModalOpen: boolean;
    setIsPosModalOpen: (open: boolean) => void;
    fetchSalesData: (silent?: boolean) => Promise<void>;


    addSale: (sale: Sale, excessHandling?: 'Change' | 'Wallet') => Promise<{ success: boolean; id?: string; message?: string }>;
    updateSale: (sale: Sale) => void;

    addSalesExchange: (exchange: Partial<SalesExchange>) => Promise<void>;
    approveSalesExchange: (id: string, comments: string) => Promise<void>;
    cancelSalesExchange: (id: string) => Promise<void>;
    deleteSalesExchange: (id: string) => Promise<void>;
    updateReprintJob: (id: string, data: Partial<ReprintJob>) => Promise<void>;

    addQuotation: (quotation: Quotation) => void;
    updateQuotation: (quotation: Quotation, reason?: string) => void;
    approveQuotation: (id: string) => Promise<ApprovedQuotationResult>;
    deleteQuotation: (id: string, reason?: string) => void;
    createQuoteRevision: (originalId: string) => void;
    convertQuotationToWorkOrder: (quotation: Quotation) => Promise<string>;
    convertQuotationToJobTicket: (quotation: Quotation) => Promise<string>;
    convertOrderToJobTicket: (order: Order) => Promise<string>;
    convertQuotationToInvoice: (quotation: Quotation) => Promise<string>;

    addJobOrder: (jobOrder: JobOrder) => void;
    updateJobOrder: (jobOrder: JobOrder, reason?: string) => void;
    deleteJobOrder: (id: string, reason?: string) => void;
    convertJobOrderToInvoice: (jobOrder: JobOrder) => Promise<string>;

    parkOrder: (order: HeldOrder) => void;
    retrieveOrder: (id: string) => void;

    addCustomerPayment: (payment: CustomerPayment) => Promise<void>;
    updateCustomerPayment: (payment: CustomerPayment, reason?: string) => Promise<void>;
    deleteCustomerPayment: (id: string, reason?: string) => Promise<void>;
    permanentlyDeleteCustomerPayment: (id: string) => Promise<void>;

    addCustomer: (customer: Customer, options?: { invite?: boolean }) => Promise<PortalCredentials | null>;
    updateCustomer: (customer: Customer) => Promise<void>;
    deleteCustomer: (id: string) => Promise<void>;

    generateZReport: (cashierId: string) => ZReport;
    processRefund: (saleId: string, items: { itemId: string, qty: number }[], reason: string, method: string) => Promise<void>;

    runRecurringBilling: () => Promise<void>;

    addSalesOrder: (order: SalesOrder) => Promise<void>;
    updateSalesOrder: (order: SalesOrder) => Promise<void>;
    deleteSalesOrder: (id: string) => Promise<void>;
}

const SalesContext = createContext<SalesContextType | undefined>(undefined);

export const SalesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const salesStore = useSalesStore();
    const [isPosModalOpen, setIsPosModalOpen] = React.useState(false);
    const inFlightApprovals = React.useRef<Set<string>>(new Set());

    const finance = useFinance();
    const productionStore = useProductionStore();
    const inventoryStore = useInventoryStore();
    const { notify, addAuditLog, companyConfig, addAlert, isInitialized, checkPermission, user } = useAuth();

    useEffect(() => {
        if (!isInitialized) return;

        salesStore.fetchSalesData().then(async () => {
            try {
                await syncExistingCustomerPaymentTerms();
            } catch (error) {
                logger.error('Failed to synchronize customer payment terms policy', error);
            }
            runRecurringBilling();
        }).catch(err => {
            notify("Failed to load sales history.", "error");
        });
    }, [isInitialized]);

    const resolveCustomerId = (customerId?: string, customerName?: string) => {
        const normalizedId = String(customerId || '').trim();
        if (normalizedId) return normalizedId;

        const normalizedName = String(customerName || '').trim().toLowerCase();
        if (!normalizedName) return undefined;

        return salesStore.customers.find(c => String(c.name || '').trim().toLowerCase() === normalizedName)?.id;
    };

    const findCustomerForNotification = (customerId?: string, customerName?: string) => {
        const resolvedId = resolveCustomerId(customerId, customerName);
        const normalizedName = String(customerName || '').trim().toLowerCase();

        return salesStore.customers.find((customer) =>
            (resolvedId && String(customer.id || '').trim() === String(resolvedId).trim())
            || (normalizedName && String(customer.name || '').trim().toLowerCase() === normalizedName)
        );
    };

    const formatNotificationAmount = (amount?: number) => {
        const numericAmount = Number(amount || 0);
        return `${companyConfig?.currencySymbol || ''}${numericAmount.toLocaleString()}`;
    };

    const triggerCustomerActivityNotification = async (
        type: NotificationActivityType,
        details: {
            id: string;
            customerId?: string;
            customerName?: string;
            amount?: string;
            dueDate?: string;
            count?: number;
        }
    ) => {
        const customer = findCustomerForNotification(details.customerId, details.customerName);
        const customerName = details.customerName || customer?.name || 'Valued Customer';

        if (!customer?.phone && !customer?.email) {
          return;
        }

        try {
            await customerNotificationService.triggerNotification(type, {
                id: details.id,
                customerName,
                phoneNumber: customer.phone,
                amount: details.amount,
                dueDate: details.dueDate,
                count: details.count
            });
        } catch (notificationError) {
            logger.error(`[SalesContext] Failed to trigger ${type} notification for ${details.id}`, notificationError);
        }
    };

    const pushTransactionAlert = async (details: {
        title: string;
        message: string;
        module?: string;
        severity?: string;
        type?: string;
        actionUrl?: string;
    }) => {
        try {
            await addAlert({
                id: `ALERT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                title: details.title,
                message: details.message,
                type: details.type || 'INFO',
                module: details.module || 'Sales',
                severity: details.severity || 'Medium',
                actionUrl: details.actionUrl,
                date: new Date().toISOString(),
                read: false
            });
        } catch (alertError) {
            logger.error('[SalesContext] Failed to publish transaction alert', alertError);
        }
    };

    const normalizeCustomerPaymentTerms = (customer: Customer, oldCustomer?: Customer): Customer => {
        const normalizedSegment = (customer.segment || oldCustomer?.segment || 'Individual') as Customer['segment'];
        const normalizedCustomer = { ...customer, segment: normalizedSegment };
        const normalizedPaymentTerms = resolveCustomerPaymentTerms({
            customer: normalizedCustomer,
            transactionType: 'invoice',
            preserveCustomTerms: true
        });

        return {
            ...normalizedCustomer,
            paymentTerms: normalizedPaymentTerms
        };
    };

    const syncExistingCustomerPaymentTerms = async () => {
        if (isSupabaseConfigured()) return;
        const currentCustomers = useSalesStore.getState().customers || [];
        const customersToUpdate = currentCustomers
            .map((customer) => {
                const normalized = normalizeCustomerPaymentTerms(customer);
                const currentPaymentTerms = String(customer.paymentTerms || '').trim();
                const normalizedPaymentTerms = String(normalized.paymentTerms || '').trim();
                const currentSegment = String(customer.segment || '').trim();
                const normalizedSegment = String(normalized.segment || '').trim();

                if (currentPaymentTerms === normalizedPaymentTerms && currentSegment === normalizedSegment) {
                    return null;
                }

                return { current: customer, normalized };
            })
            .filter(Boolean) as Array<{ current: Customer; normalized: Customer }>;

        if (customersToUpdate.length === 0) {
            return;
        }

        for (const { current, normalized } of customersToUpdate) {
            await transactionService.saveCustomer(normalized, current);
        }
    };

    const runRecurringBilling = async () => {
        const activeSubs = (finance.recurringInvoices || []).filter(s => s.status === 'Active');
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        let count = 0;

        for (const sub of activeSubs) {
            const startDate = sub.startDate ? parseISO(String(sub.startDate)) : null;
            const endDate = sub.endDate ? parseISO(String(sub.endDate)) : null;

            if (startDate && !isSameDay(startDate, today) && startDate.getTime() > today.getTime()) {
                continue;
            }

            if (endDate && !Number.isNaN(endDate.getTime()) && !isSameDay(endDate, today) && endDate.getTime() < today.getTime()) {
                await finance.updateRecurringInvoice?.({ ...sub, status: 'Expired' });
                continue;
            }

            const nextDate = parseISO(sub.nextRunDate || today.toISOString());
            const isDueToday = isSameDay(nextDate, today) || isBefore(nextDate, today);
            const isManualDateDue = sub.scheduledDates?.some(d => d === todayStr);

            if (isDueToday || isManualDateDue) {
                const dateKey = isManualDateDue ? todayStr : String(sub.nextRunDate || todayStr).split('T')[0];
                const alreadyGenerated = finance.invoices.some(i =>
                    i.customerName === sub.customerName &&
                    i.date.startsWith(dateKey) &&
                    i.id.includes('REC')
                );

                if (alreadyGenerated) continue;

                const invId = generateNextId('INV-REC', finance.invoices, companyConfig);
                const roundedTotal = roundFinancial(sub.total);

                const subCustomer = salesStore.customers.find(c => c.id === sub.customerId || c.name === sub.customerName);
                const invoice: Invoice = {
                    id: invId,
                    customerId: sub.customerId,
                    customerName: sub.customerName,
                    totalAmount: roundedTotal,
                    paidAmount: roundedTotal,
                    date: new Date().toISOString(),
                    dueDate: sub.nextRunDate,
                    status: 'Paid',
                    items: sub.items,
                    referredBy: sub.referredBy || subCustomer?.referredById || '',
                    referredByName: sub.referredByName || subCustomer?.referredByName || ''
                };

                try {
                    // Calculate next run date and updated sub object
                    let updatedSub = { ...sub };
                    if (isDueToday) {
                        let newNextRun: Date;
                        switch (String(sub.frequency || '').toLowerCase()) {
                            case 'daily': newNextRun = addDays(nextDate, 1); break;
                            case 'weekly': newNextRun = addDays(nextDate, 7); break;
                            case 'quarterly': newNextRun = addMonths(nextDate, 3); break;
                            case 'annually': newNextRun = addYears(nextDate, 1); break;
                            default: newNextRun = addMonths(nextDate, 1);
                        }

                        const nextRunDate = newNextRun.toISOString();
                        const exceededEndDate = endDate
                            && !Number.isNaN(endDate.getTime())
                            && newNextRun.getTime() > endDate.getTime();

                        if (exceededEndDate) {
                            updatedSub = {
                                ...sub,
                                status: 'Expired',
                                scheduledDates: isManualDateDue ? sub.scheduledDates?.filter(d => d !== todayStr) : sub.scheduledDates
                            };
                        } else {
                            updatedSub = {
                                ...sub,
                                nextRunDate,
                                scheduledDates: isManualDateDue ? sub.scheduledDates?.filter(d => d !== todayStr) : sub.scheduledDates
                            };
                        }
                    } else if (isManualDateDue) {
                        updatedSub = {
                            ...sub,
                            scheduledDates: sub.scheduledDates?.filter(d => d !== todayStr)
                        };
                    }

                    // Atomic transaction for recurring invoice generation + sub update
                    await transactionService.processRecurringInvoice(invoice, sub.id, updatedSub);

                    // Refresh stores
                    await salesStore.fetchSalesData();
                    await finance.fetchFinanceData?.();

                    addAuditLog({
                        action: 'CREATE',
                        entityType: 'Invoice',
                        entityId: invId,
                        details: `Auto-generated recurring invoice for ${sub.customerName}.`,
                        newValue: invoice
                    });

                    await pushTransactionAlert({
                        title: 'Recurring Invoice Generated',
                        message: `Invoice #${invId} created for ${sub.customerName}.`,
                        module: 'Subscriptions',
                        severity: 'Low',
                        type: 'SUCCESS',
                        actionUrl: '/sales-flow/subscriptions'
                    });

                    count++;
                } catch (err: any) {
                    logger.error("Recurring billing error for sub", sub.id, err);
                }
            }
        }

        if (count > 0) {
            notify(`Billing Engine: Processed ${count} subscription cycles.`, 'success');
        }
    };



    const addSale = async (sale: Sale, excessHandling?: 'Change' | 'Wallet'): Promise<{ success: boolean; id?: string; message?: string }> => {
        try {
            const id = sale.id || generateNextId('SALE', salesStore.sales, companyConfig);
            if (salesStore.sales.some(s => s.id === id)) return { success: false, message: "Transaction ID already processed." };

            // Ensure the sale object has the generated ID before processing
            const saleToProcess = { ...sale, id, cashierId: user?.username || 'System' };

            // Credit management checks (basic)
            if (saleToProcess.customerId) {
                const cust = salesStore.customers.find(c => c.id === saleToProcess.customerId);
                if (cust) {
                    const limit = Number(cust.creditLimit || 0);
                    const outstanding = Number(cust.outstandingBalance || 0);
                    const willBe = outstanding + (saleToProcess.totalAmount || 0);
                    if (cust.creditHold) {
                        return { success: false, message: 'Customer is on credit hold. Release hold to process sale.' };
                    }
                    if (limit > 0 && willBe > limit) {
                        // Allow override only for Admin/Accountant
                        if (!checkPermission('accounts.override_credit')) {
                            return { success: false, message: 'Credit limit exceeded. Request override.' };
                        }
                    }
                }
            }

            // Fast pre-check: stock availability (definitive atomic check happens inside processSale)
            const stockItems = (sale.items || []).filter((i: any) => i.type !== 'Service');
            const allowNegative = companyConfig?.inventorySettings?.allowNegativeStock === true;
            if (!allowNegative && stockItems.length > 0) {
                const { available, unavailable } = await inventoryReservationService.checkSalesOrderAvailability(
                    stockItems.map((i: any) => ({ productId: i.id || i.productId, quantity: i.quantity }))
                );
                if (!available) {
                    const details = unavailable.map(u => `"${u.productId}": need ${u.requested}, have ${u.available}`).join('; ');
                    return { success: false, message: `Insufficient stock: ${details}` };
                }
            }

            await api.sales.createSale(saleToProcess);

            // Calculate excess for audit log only (Wallet logic is handled inside processSale)
            const totalPaid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
            const excessAmount = totalPaid > sale.totalAmount ? totalPaid - sale.totalAmount : 0;

            addAuditLog({
                action: 'CREATE',
                entityType: 'POSSale',
                entityId: id,
                details: `Point of Sale transaction completed for ${sale.customerName || 'Walk-in'}. Excess: ${excessAmount} handled as ${excessHandling || 'Change'}`,
                newValue: saleToProcess
            });

            // Refresh sales and finance history after atomic process
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();

            await triggerCustomerActivityNotification('SALES_ORDER', {
                id: id,
                customerId: saleToProcess.customerId,
                customerName: saleToProcess.customerName,
                amount: formatNotificationAmount(saleToProcess.totalAmount),
            });

            await pushTransactionAlert({
                title: 'POS Sale Completed',
                message: `Sale #${id} posted for ${saleToProcess.customerName || 'Walk-in Customer'} (${formatNotificationAmount(saleToProcess.totalAmount)}).`,
                module: 'POS',
                severity: 'Low',
                type: 'SUCCESS',
                actionUrl: '/pos'
            });

            return { success: true, id: id };
        } catch (error: any) {
            logger.error("Sale Error:", error);
            return { success: false, message: error.message };
        }
    };

    const processRefund = async (saleId: string, items: { itemId: string, qty: number }[], reason: string, method: string) => {
        try {
            // Find the original sale to calculate refund amount and get item details
            const sale = salesStore.sales.find(s => s.id === saleId);
            if (!sale) throw new Error("Original sale not found");

            let calculatedRefundAmount = 0;
            const refundItems = items.map(ri => {
                const saleItem = sale.items.find(si => si.id === ri.itemId);
                const itemPrice = saleItem?.price || 0;
                calculatedRefundAmount += itemPrice * ri.qty;

                return {
                    itemId: ri.itemId,
                    quantity: ri.qty,
                    reason: reason,
                    condition: 'Sellable' as const
                };
            });

            await transactionService.processRefund({
                id: generateNextId('refund', salesStore.sales, companyConfig),
                saleId,
                date: new Date().toISOString(),
                items: refundItems,
                refundAmount: calculatedRefundAmount,
                reason,
                restock: true,
                status: 'Completed',
                refundMethod: method
            });
            notify(`Refund processed successfully for Sale #${saleId}`, 'success');

            // Refresh data
            await salesStore.fetchSalesData();
            await pushTransactionAlert({
                title: 'Refund Processed',
                message: `Refund posted for Sale #${saleId} (${formatNotificationAmount(calculatedRefundAmount)}).`,
                module: 'Sales',
                severity: 'Medium',
                type: 'INFO',
                actionUrl: '/pos'
            });
        } catch (error: any) {
            notify(`Refund Failed: ${error.message}`, 'error');
        }
    };

    const addQuotation = async (quotation: Quotation) => {
        try {
            await transactionService.processQuotation(quotation);
            await salesStore.fetchSalesData();
            addAuditLog({ action: 'CREATE', entityType: 'Quotation', entityId: quotation.id, details: `Created quote for ${quotation.customerName}. Status: ${quotation.status}`, newValue: quotation });
            notify(`Quotation ${quotation.id} saved`, "success");

            await triggerCustomerActivityNotification('QUOTATION', {
                id: quotation.id,
                customerId: quotation.customerId,
                customerName: quotation.customerName,
                amount: formatNotificationAmount(quotation.totalAmount)
            });
        } catch (err: any) {
            notify(`Failed to save quotation: ${err.message}`, "error");
        }
    };

    const updateQuotation = async (q: Quotation, reason?: string) => {
        try {
            const oldQuotation = salesStore.quotations.find(quote => quote.id === q.id);
            await transactionService.processQuotation(q);
            await salesStore.fetchSalesData();
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Quotation',
                entityId: q.id,
                details: `Updated quote`,
                reason,
                oldValue: oldQuotation,
                newValue: q
            });
            notify(`Quotation ${q.id} updated`, "success");
        } catch (err: any) {
            notify(`Update Failed: ${err.message}`, "error");
        }
    };

    const approveQuotation = async (id: string): Promise<ApprovedQuotationResult> => {
        if (inFlightApprovals.current.has(id)) {
            throw new Error('Quotation approval is already in progress');
        }
        inFlightApprovals.current.add(id);
        try {
            const quotation = salesStore.quotations.find((entry) => entry.id === id);
            if (!quotation) {
                throw new Error('Quotation not found');
            }

            const quotationType = String(quotation.quotationType || 'General').trim().toLowerCase();
            let createdBatchId = String(quotation.linkedBatchId || '').trim() || undefined;

            if (quotationType === 'examination') {
                const resolvedCustomerId = resolveCustomerId(quotation.customerId, quotation.customerName);
                if (!resolvedCustomerId) {
                    throw new Error('Examination quotation requires a valid customer before approval');
                }

                const examinationDetails = normalizeExaminationQuotationDetails(quotation.examinationDetails);
                if (!examinationDetails.batchName) {
                    throw new Error('Examination quotation is missing a batch name');
                }
                if (examinationDetails.classes.length === 0) {
                    throw new Error('Examination quotation requires at least one class');
                }

                const classNames = new Set<string>();
                for (const entry of examinationDetails.classes) {
                    if (!entry.className || entry.learners <= 0) {
                        throw new Error('Each examination class must include a class name and learner count');
                    }
                    const normalizedName = entry.className.trim().toLowerCase();
                    if (classNames.has(normalizedName)) {
                        throw new Error(`Duplicate class detected: ${entry.className}`);
                    }
                    classNames.add(normalizedName);
                }

                if (!createdBatchId) {
                    const batch = await examinationBatchService.createBatch({
                        school_id: resolvedCustomerId,
                        name: examinationDetails.batchName,
                        academic_year: examinationDetails.academicYear,
                        term: examinationDetails.term,
                        exam_type: examinationDetails.examType,
                        currency: quotation.currency || companyConfig?.currencySymbol || 'MWK',
                        sub_account_name: quotation.subAccountName || null,
                        quotation_id: quotation.id
                    });

                    createdBatchId = String(batch.id);

                    try {
                        for (const entry of examinationDetails.classes) {
                            await examinationBatchService.addClass(createdBatchId, {
                                class_name: entry.className,
                                number_of_learners: entry.learners
                            });
                        }
                    } catch (batchError) {
                        try {
                            await examinationBatchService.deleteBatch(createdBatchId);
                        } catch (cleanupError) {
                            logger.error('Failed to rollback examination batch after quotation approval error', cleanupError);
                        }
                        throw batchError;
                    }

                    try {
                        await examinationBatchService.calculateBatch(createdBatchId, {
                            roundingMethod: companyConfig?.pricingSettings?.defaultMethod,
                            roundingValue: Number(companyConfig?.pricingSettings?.customStep || 50)
                        });
                    } catch (calculationError) {
                        console.warn('Failed to calculate examination batch immediately after quotation approval', calculationError);
                    }
                }

                const approvedQuotation = {
                    ...quotation,
                    customerId: resolvedCustomerId,
                    quotationType: 'Examination',
                    examinationDetails,
                    linkedBatchId: createdBatchId,
                    linkedBatchName: examinationDetails.batchName,
                    status: 'Approved',
                    isPriceLocked: true,
                    approvedAt: new Date().toISOString()
                };

                await transactionService.processQuotation(approvedQuotation);
            } else {
                await transactionService.approveQuotation(id);
            }

            await salesStore.fetchSalesData();
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Quotation',
                entityId: id,
                details: createdBatchId
                    ? `Approved quotation ${id} and created examination batch ${createdBatchId}`
                    : `Approved Quotation ${id}`
            });
            notify(
                createdBatchId
                    ? `Quotation ${id} approved and converted to batch ${createdBatchId}`
                    : `Quotation ${id} approved`,
                "success"
            );

            return { batchId: createdBatchId };
        } catch (err: any) {
            notify(`Approval Failed: ${err.message}`, "error");
            throw err;
        } finally {
            inFlightApprovals.current.delete(id);
        }
    };

    const convertQuotationToWorkOrder = async (q: Quotation): Promise<string> => {
        const woId = generateNextId('workorder', productionStore.workOrders, companyConfig);

        // Find BOM for the first item if it exists
        const firstItem = q.items[0];
        let bomId = '';
        if (firstItem) {
            const boms = await bomService.getBOMs();
            const matchingBom = boms.find(b =>
                b.productId === firstItem.id ||
                b.id === firstItem.bomId ||
                (firstItem.parentId && b.productId === firstItem.parentId)
            );
            if (matchingBom) {
                bomId = matchingBom.id;
            }
        }

        // Map ALL items to the Work Order notes if multiple exist, 
        // or just pick the first one for the main product fields (WorkOrder is traditionally single-product)
        const itemsList = q.items.map(i => `- ${i.name} (Qty: ${i.quantity})`).join('\n');

        const workOrder: WorkOrder = {
            id: woId,
            status: 'Scheduled',
            customerName: q.customerName,
            bomId: bomId,
            productId: firstItem?.id || '',
            productName: firstItem?.name || '',
            quantityPlanned: firstItem?.quantity || 1,
            quantityCompleted: 0,
            dueDate: q.validUntil || new Date().toISOString(),
            logs: [],
            notes: `Converted from [Quotation] #[${q.id}] on [${new Date().toLocaleDateString()}] as accepted by [${q.customerName}].\n\nItems in Quotation:\n${itemsList}`
        };

        try {
            await transactionService.convertQuotationToWorkOrder(q.id, workOrder);

            // Refresh data
            await salesStore.fetchSalesData();
            await productionStore.fetchProductionData();

            notify(`Quotation ${q.id} converted to Work Order ${woId}`, "success");
            return woId;
        } catch (err: any) {
            notify(`Conversion Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const convertQuotationToJobTicket = async (q: Quotation): Promise<string> => {
        try {
            const quotationType = String(q.quotationType || 'General').trim().toLowerCase();
            const requestMetadata = {
                requestedBy: user?.username || user?.id || 'system',
                requesterRole: user?.role || 'System'
            };

            const result = quotationType === 'examination'
                ? await (() => {
                    const linkedBatchId = String(q.linkedBatchId || '').trim();
                    if (!linkedBatchId) {
                        throw new Error('Approve the examination quotation first so a batch can be created before converting to a job ticket');
                    }
                    return jobTicketConversionService.convertExaminationBatchToJobTicket(linkedBatchId, requestMetadata);
                })()
                : await jobTicketConversionService.convertQuotationToJobTicket(q.id, requestMetadata);

            await salesStore.fetchSalesData();
            await productionStore.fetchProductionData();
            notify(`Quotation ${q.id} converted to Job Ticket ${result.jobTicketId}`, "success");
            return result.jobTicketId;
        } catch (err: any) {
            notify(`Conversion Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const convertOrderToJobTicket = async (order: Order): Promise<string> => {
        try {
            const requestMetadata = {
                requestedBy: user?.username || user?.id || 'system',
                requesterRole: user?.role || 'System'
            };

            const result = await jobTicketConversionService.convertOrderToJobTicket(order.id, requestMetadata);

            await salesStore.fetchSalesData();
            await productionStore.fetchProductionData();
            notify(`Order ${order.id} converted to Job Ticket ${result.jobTicketId}`, "success");
            return result.jobTicketId;
        } catch (err: any) {
            notify(`Conversion Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const convertQuotationToInvoice = async (q: Quotation): Promise<string> => {
        const invId = await generateNextSalesInvoiceNumber(companyConfig);
        const resolvedCustomerId = resolveCustomerId(q.customerId, q.customerName);
        const issuedDate = new Date().toISOString();
        const customerProfile = salesStore.customers.find(c => c.id === resolvedCustomerId || c.name === q.customerName);
        const paymentPolicy = resolveCustomerPaymentPolicy({
            customer: customerProfile,
            transactionType: 'invoice',
            issuedDate,
            preserveCustomTerms: true
        });

        // ✅ Aggregate adjustment snapshots from all items for margin tracking
        const invoiceItems = q.items.map(item => {
            return attachPricingBreakdown({
                ...item,
                lineTotalNet: item.lineTotalNet || (item.price * item.quantity)
                // adjustmentSnapshots preserved via spread operator
            });
        });
        const pricingSummary = summarizePricingBreakdown(invoiceItems);
        const allAdjustmentSnapshots = aggregateMarketAdjustmentSnapshots(invoiceItems);

        const invoice: Invoice = {
            id: invId,
            customerId: resolvedCustomerId,
            customerName: q.customerName,
            totalAmount: q.total,
            paidAmount: 0,
            date: issuedDate,
            dueDate: paymentPolicy.dueDate,
            status: 'Unpaid',
            items: invoiceItems,
            // ✅ Add aggregate adjustment data at invoice level for margin reports
            adjustmentSnapshots: allAdjustmentSnapshots,
            adjustmentTotal: q.adjustmentTotal || pricingSummary.adjustmentTotal,
            materialTotal: q.materialTotal || pricingSummary.materialTotal,
            profitMarginTotal: q.profitMarginTotal || pricingSummary.profitMarginTotal,
            roundingTotal: q.roundingTotal || pricingSummary.roundingTotal,
            roundingDifference: q.roundingDifference || pricingSummary.roundingTotal,
            roundingMethod: q.roundingMethod || '',
            notes: `Converted from [Quotation] #[${q.id}] on [${new Date().toLocaleDateString()}] as accepted by [${q.customerName}]`,
            tax: q.tax,
            taxRate: q.taxRate,
            paymentTerms: paymentPolicy.paymentTerms,
            referredBy: customerProfile?.referredById || '',
            referredByName: customerProfile?.referredByName || ''
        };

        try {
            await transactionService.convertQuotationToInvoice(q.id, invoice);

            // Refresh data
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();

            notify(`Quotation ${q.id} converted to Invoice #${invId}`, "success");
            return invId;
        } catch (err: any) {
            notify(`Conversion Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const convertJobOrderToInvoice = async (jo: JobOrder): Promise<string> => {
        const invId = await generateNextSalesInvoiceNumber(companyConfig);
        const product = inventoryStore.inventory.find(i => i.id === jo.productId);
        const price = product?.price || 0;
        const totalAmount = jo.totalQuantity * price;
        const resolvedCustomerId = resolveCustomerId(jo.customerId, jo.customerName);
        const issuedDate = new Date().toISOString();
        const customerProfile = salesStore.customers.find(c => c.id === resolvedCustomerId || c.name === jo.customerName);
        const paymentPolicy = resolveCustomerPaymentPolicy({
            customer: customerProfile,
            subAccountName: jo.subAccountName,
            transactionType: 'invoice',
            issuedDate,
            preserveCustomTerms: true
        });

        const invoice: Invoice = {
            id: invId,
            customerId: resolvedCustomerId,
            customerName: jo.customerName,
            totalAmount: totalAmount,
            paidAmount: 0,
            date: issuedDate,
            dueDate: paymentPolicy.dueDate,
            status: 'Unpaid',
            items: product ? [{
                ...product,
                quantity: jo.totalQuantity,
                price,
                lineTotalNet: totalAmount
            }] : [],
            paymentTerms: paymentPolicy.paymentTerms,
            referredBy: customerProfile?.referredById || jo.referredBy || '',
            referredByName: customerProfile?.referredByName || jo.referredByName || ''
        };

        try {
            await transactionService.convertJobOrderToInvoice(jo.id, invoice);

            // Refresh data
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();

            notify(`Job Order ${jo.id} converted to Invoice #${invId}`, "success");
            autoWorkflowService.fireEvent('invoice.created', { invoiceId: invId, jobOrderId: jo.id, amount: totalAmount }).catch(() => {});
            return invId;
        } catch (err: any) {
            notify(`Conversion Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const addCustomerPayment = async (payment: CustomerPayment) => {
        if (salesStore.customerPayments.some(p => p.id === payment.id)) return;

        // Handle overpayment for direct payments
        const allocated = payment.allocations.reduce((s, a) => s + a.amount, 0);
        const excess = payment.amount - allocated;

        const finalPayment: CustomerPayment = {
            ...payment,
            excessAmount: excess > 0 ? roundFinancial(excess) : undefined,
            excessHandling: (excess > 0 && payment.excessHandling) ? payment.excessHandling : (excess > 0 ? 'Change' : undefined)
        };

        try {
            await transactionService.addCustomerPayment(finalPayment);

            // Refresh data
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();

            addAuditLog({
                action: 'CREATE',
                entityType: 'CustomerPayment',
                entityId: payment.id,
                details: `Posted payment from ${payment.customerName}. Excess: ${excess} (${finalPayment.excessHandling})`,
                newValue: finalPayment
            });

            notify(`Payment #${payment.id} posted successfully`, "success");
            await pushTransactionAlert({
                title: 'Customer Payment Posted',
                message: `Payment #${payment.id} received from ${payment.customerName} (${formatNotificationAmount(finalPayment.amount)}).`,
                module: 'Payments',
                severity: 'Low',
                type: 'SUCCESS',
                actionUrl: '/sales-flow/payments'
            });

            const isPosPayment = finalPayment.notes?.includes('POS') || finalPayment.reference?.includes('POS');
            if (!isPosPayment) {
                await triggerCustomerActivityNotification('RECEIPT', {
                    id: finalPayment.id,
                    customerId: finalPayment.customerId,
                    customerName: finalPayment.customerName,
                    amount: formatNotificationAmount(finalPayment.amount)
                });
            }
        } catch (err: any) {
            notify(`Failed to post payment: ${err.message}`, "error");
            throw err;
        }
    };

    const deleteCustomerPayment = async (id: string, reason: string = "Manual deletion") => {
        try {
            const oldPayment = salesStore.customerPayments.find(p => p.id === id);
            await transactionService.voidCustomerPayment(id, reason);
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();
            notify(`Payment #${id} voided successfully`, "success");
            await pushTransactionAlert({
                title: 'Customer Payment Voided',
                message: `Payment #${id} was voided.`,
                module: 'Payments',
                severity: 'Medium',
                type: 'WARNING',
                actionUrl: '/sales-flow/payments'
            });
            addAuditLog({
                action: 'DELETE',
                entityType: 'CustomerPayment',
                entityId: id,
                details: `Voided payment: ${reason}`,
                oldValue: oldPayment
            });
        } catch (err: any) {
            notify(`Failed to void payment: ${err.message}`, "error");
            throw err;
        }
    };

    const permanentlyDeleteCustomerPayment = async (id: string) => {
        try {
            const oldPayment = salesStore.customerPayments.find(p => p.id === id);
            await salesStore.permanentlyDeleteCustomerPayment(id);
            await salesStore.fetchSalesData();
            notify(`Payment #${id} deleted permanently`, "success");
            await pushTransactionAlert({
                title: 'Customer Payment Deleted',
                message: `Voided payment #${id} was permanently deleted.`,
                module: 'Payments',
                severity: 'High',
                type: 'WARNING',
                actionUrl: '/sales-flow/payments'
            });
            addAuditLog({
                action: 'DELETE',
                entityType: 'CustomerPayment',
                entityId: id,
                details: `Permanently deleted voided payment`,
                oldValue: oldPayment
            });
        } catch (err: any) {
            notify(`Failed to delete payment: ${err.message}`, "error");
            throw err;
        }
    };

    const addCustomer = async (customer: Customer, options?: { invite?: boolean }): Promise<PortalCredentials | null> => {
        try {
            const id = customer.id || generateCustomerId(salesStore.customers);
            const finalCustomer = normalizeCustomerPaymentTerms({ ...customer, id });
            await transactionService.saveCustomer(finalCustomer);
            await salesStore.fetchSalesData();
            notify(`Client ${customer.name} added successfully`, "success");
            addAuditLog({
                action: 'CREATE',
                entityType: 'Client',
                entityId: id,
                details: `Added client: ${customer.name}`,
                newValue: finalCustomer
            });
            let credentials: PortalCredentials | null = null;
            try {
                const portalAccount = await adminLifecycle.users.autoCreate({
                    customer_id: id,
                    name: finalCustomer.name,
                    email: finalCustomer.email,
                    phone: finalCustomer.phone,
                    invite: options?.invite,
                });
                if (portalAccount?.user) {
                    const isInvite = options?.invite && !!portalAccount.invite_code;
                    credentials = {
                        email: portalAccount.user.email,
                        password: isInvite ? null : portalAccount.generated_password,
                        inviteCode: portalAccount.invite_code ?? null,
                        userId: portalAccount.user.id,
                    };
                    const enriched = {
                        ...finalCustomer,
                        portalUserId: portalAccount.user.id,
                        portalEmail: portalAccount.user.email,
                        portalStatus: portalAccount.user.status || (isInvite ? 'invited' : 'active'),
                    };
                    await transactionService.saveCustomer(enriched);
                    await salesStore.fetchSalesData();
                }
            } catch (portalErr: any) {
                console.warn(`Portal provisioning skipped for ${id}:`, portalErr?.message || portalErr);
            }
            return credentials;
        } catch (err: any) {
            notify(`Failed to add client: ${err.message}`, "error");
            return null;
        }
    };

    const updateCustomer = async (customer: Customer) => {
        try {
            const oldCustomer = salesStore.customers.find(c => c.id === customer.id);
            const normalizedCustomer = normalizeCustomerPaymentTerms(customer, oldCustomer);
            await transactionService.saveCustomer(normalizedCustomer, oldCustomer);
            await salesStore.fetchSalesData();
            notify(`Client ${customer.name} updated successfully`, "success");
            addAuditLog({
                action: 'UPDATE',
                entityType: 'Client',
                entityId: customer.id,
                details: `Updated client: ${customer.name}`,
                oldValue: oldCustomer,
                newValue: normalizedCustomer
            });
        } catch (err: any) {
            notify(`Failed to update client: ${err.message}`, "error");
        }
    };

    const deleteCustomer = async (id: string) => {
        try {
            const customer = salesStore.customers.find(c => c.id === id);
            await salesStore.deleteCustomer(id);
            notify(`Client deleted successfully`, "success");
            addAuditLog({
                action: 'DELETE',
                entityType: 'Client',
                entityId: id,
                details: `Deleted client: ${customer?.name || id}`,
                oldValue: customer
            });
        } catch (err: any) {
            notify(`Failed to delete client: ${err.message}`, "error");
        }
    };

    const updateSale = async (sale: Sale) => {
        try {
            const oldSale = salesStore.sales.find(s => s.id === sale.id);
            await transactionService.updateSale(sale);
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();
            notify(`Sale #${sale.id} updated successfully`, "success");
            await pushTransactionAlert({
                title: 'POS Sale Updated',
                message: `Sale #${sale.id} was updated.`,
                module: 'POS',
                severity: 'Low',
                type: 'INFO',
                actionUrl: '/pos'
            });
            addAuditLog({
                action: 'UPDATE',
                entityType: 'POSSale',
                entityId: sale.id,
                details: `Updated POS sale record`,
                oldValue: oldSale,
                newValue: sale
            });
        } catch (err: any) {
            notify(`Update Failed: ${err.message}`, "error");
        }
    };

    const updateCustomerPayment = async (payment: CustomerPayment, reason?: string) => {
        try {
            const oldPayment = salesStore.customerPayments.find(p => p.id === payment.id);
            await transactionService.updateCustomerPayment(payment);
            await salesStore.fetchSalesData();
            await finance.fetchFinanceData?.();
            notify(`Payment #${payment.id} updated successfully`, "success");
            await pushTransactionAlert({
                title: 'Customer Payment Updated',
                message: `Payment #${payment.id} for ${payment.customerName} was updated.`,
                module: 'Payments',
                severity: 'Low',
                type: 'INFO',
                actionUrl: '/sales-flow/payments'
            });
            addAuditLog({
                action: 'UPDATE',
                entityType: 'CustomerPayment',
                entityId: payment.id,
                details: `Updated payment: ${reason || 'No reason provided'}`,
                oldValue: oldPayment,
                newValue: payment
            });
        } catch (err: any) {
            notify(`Update Failed: ${err.message}`, "error");
            throw err;
        }
    };

    const deleteQuotation = async (id: string, reason?: string) => {
        try {
            const oldQuotation = salesStore.quotations.find(q => q.id === id);
            await salesStore.deleteQuotation(id);
            addAuditLog({
                action: 'DELETE',
                entityType: 'Quotation',
                entityId: id,
                details: `Deleted quotation: ${reason || 'No reason provided'}`,
                oldValue: oldQuotation
            });
            notify(`Quotation ${id} deleted`, "success");
        } catch (err: any) {
            notify(`Delete Failed: ${err.message}`, "error");
        }
    };

    const generateZReport = (cashierId: string): ZReport => {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        
        const allSales = salesStore.sales;
        
        const todaySales = allSales.filter(sale => {
            const saleDate = sale.date ? new Date(sale.date) : null;
            if (!saleDate || !Number.isFinite(saleDate.getTime())) {
                console.log('[Z-Report] Sale missing/invalid date:', sale.id, sale.date);
                return false;
            }
            
            const isToday = saleDate >= todayStart && saleDate <= todayEnd;
            const status = String(sale.status || '').toLowerCase();
            const isPaid = status === 'paid' || status === 'completed';
            const matchesCashier = cashierId === '' || sale.cashierId === cashierId || sale.cashierId === 'unknown' || !sale.cashierId;
            
            return isToday && isPaid && matchesCashier;
        });

        console.log('[Z-Report] Filtering sales:', {
            totalSalesInStore: allSales.length,
            todaySalesCount: todaySales.length,
            cashierId,
            today: today.toISOString()
        });

        const totals = todaySales.reduce((acc, sale) => {
            acc.total += sale.totalAmount;

            // Calculate cash sales (including cash portion of split payments)
            const cashAmount = sale.payments
                .filter(p => p.method === 'Cash')
                .reduce((sum, p) => sum + p.amount, 0);

            // Calculate card sales (including card portion of split payments)
            const cardAmount = sale.payments
                .filter(p => p.method === 'Card')
                .reduce((sum, p) => sum + p.amount, 0);

            acc.cash += cashAmount;
            acc.card += cardAmount;
            acc.other += (sale.totalAmount - cashAmount - cardAmount);

            return acc;
        }, { total: 0, cash: 0, card: 0, other: 0 });

        return {
            id: `Z-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            date: today.toISOString(),
            cashierId,
            totalSales: roundFinancial(totals.total),
            cashSales: roundFinancial(totals.cash),
            cardSales: roundFinancial(totals.card),
            otherSales: roundFinancial(totals.other),
            openingCash: 0, // Should be fetched from shift/drawer session if implemented
            closingCash: roundFinancial(totals.cash), // Simplified for now
            variance: 0,
            generatedAt: new Date().toISOString()
        };
    };

    return (
        <SalesContext.Provider value={{
            ...salesStore,
            invoices: finance.invoices,
            isPosModalOpen,
            setIsPosModalOpen,
            fetchSalesData: salesStore.fetchSalesData,

            addSale,
            updateSale,
            addCustomerPayment,
            processRefund,
            updateQuotation,
            deleteQuotation,
            approveQuotation,
            isLoading: salesStore.isLoading,
            addSalesExchange: async (exchange: any) => {
                try {
                    await salesStore.createSalesExchange(exchange);
                    // Restock returned items to inventory
                    if (exchange.items && exchange.items.length > 0) {
                        for (const item of exchange.items) {
                            if (item.qtyReturned > 0 && item.productId) {
                                await inventoryTransactionService.addInventory({
                                    itemId: item.productId,
                                    warehouseId: '',
                                    quantity: item.qtyReturned,
                                    unitCost: 0,
                                    reason: `Sales exchange return: ${exchange.id}`,
                                    reference: exchange.id,
                                    performedBy: user?.username || 'system'
                                });
                            }
                        }
                    }
                    notify("Exchange request created and inventory adjusted", "success");
                } catch (err: any) {
                    notify(`Failed to create exchange: ${err.message}`, "error");
                }
            },
            approveSalesExchange: async (id: string, comments: string) => {
                try {
                    await salesStore.approveSalesExchange(id, comments);
                    notify("Exchange approved", "success");
                } catch (err: any) {
                    notify(`Approval Failed: ${err.message}`, "error");
                }
            },
            cancelSalesExchange: async (id: string) => {
                try {
                    await salesStore.cancelSalesExchange(id);
                    notify("Exchange request cancelled", "success");
                } catch (err: any) {
                    notify(`Cancel Failed: ${err.message}`, "error");
                }
            },
            deleteSalesExchange: async (id: string) => {
                try {
                    await salesStore.deleteSalesExchange(id);
                    notify("Exchange record marked as deleted", "success");
                } catch (err: any) {
                    notify(`Delete Failed: ${err.message}`, "error");
                }
            },
            updateReprintJob: async (id: string, data: Partial<ReprintJob>) => {
                try {
                    await salesStore.updateReprintJob(id, data);
                    notify("Reprint job updated", "success");
                } catch (err: any) {
                    notify(`Update Failed: ${err.message}`, "error");
                }
            },
                addSalesOrder: async (order: SalesOrder) => {
                    try {
                        const orderToSave: SalesOrder = {
                            ...order,
                            id: order.id || salesOrderService.generateProvisionalOrderId(salesStore.salesOrders, 'SO')
                        };

                        // Check availability before confirming
                        if (orderToSave.status === 'Confirmed') {
                            const { available, unavailable } = await inventoryReservationService.checkSalesOrderAvailability(
                                (orderToSave.items || []).map(i => ({ productId: i.productId, quantity: i.quantity }))
                            );
                            if (!available) {
                                const details = unavailable.map(u => `"${u.productId}": need ${u.requested}, have ${u.available}`).join('; ');
                                notify(`Cannot confirm — insufficient stock: ${details}`, 'error');
                                return;
                            }
                        }

                        await salesStore.addSalesOrder(orderToSave);

                        // Reserve inventory on confirmation
                        if (orderToSave.status === 'Confirmed') {
                            await inventoryReservationService.createSalesOrderReservations(
                                orderToSave.id,
                                (orderToSave.items || []).map(i => ({
                                    productId: i.productId,
                                    productName: i.description,
                                    quantity: i.quantity,
                                    unitPrice: i.unitPrice
                                }))
                            );
                        }

                        notify('Sales order saved', 'success');
                        await triggerCustomerActivityNotification('SALES_ORDER', {
                            id: orderToSave.id,
                            customerId: orderToSave.customerId || undefined,
                            customerName: (orderToSave as SalesOrder & { customerName?: string }).customerName,
                            amount: formatNotificationAmount(orderToSave.total)
                        });
                    } catch (err: any) {
                        notify(`Failed to save sales order: ${err.message}`, 'error');
                    }
                },
                updateSalesOrder: async (order: SalesOrder) => {
                    const oldVal = salesStore.salesOrders.find(o => o.id === order.id);
                    try {
                        // Release reservations if cancelling
                        if (order.status === 'Cancelled' && oldVal && oldVal.status !== 'Cancelled') {
                            await inventoryReservationService.releaseSalesOrderReservations(order.id);
                        }

                        // Reserve inventory if newly confirmed
                        if (order.status === 'Confirmed' && oldVal && oldVal.status !== 'Confirmed') {
                            const { available, unavailable } = await inventoryReservationService.checkSalesOrderAvailability(
                                (order.items || []).map(i => ({ productId: i.productId, quantity: i.quantity }))
                            );
                            if (!available) {
                                const details = unavailable.map(u => `"${u.productId}": need ${u.requested}, have ${u.available}`).join('; ');
                                notify(`Cannot confirm — insufficient stock: ${details}`, 'error');
                                return;
                            }
                            await inventoryReservationService.createSalesOrderReservations(
                                order.id,
                                (order.items || []).map(i => ({
                                    productId: i.productId,
                                    productName: i.description,
                                    quantity: i.quantity,
                                    unitPrice: i.unitPrice
                                }))
                            );
                        }

                        // Release reservations on fulfill (stock already deducted via sale)
                        if (order.status === 'Fulfilled' && oldVal && oldVal.status !== 'Fulfilled') {
                            await inventoryReservationService.releaseSalesOrderReservations(order.id, true);
                        }

                        await salesStore.updateSalesOrder(order);
                        addAuditLog({
                            action: 'UPDATE',
                            entityType: 'SalesOrder',
                            entityId: order.id,
                            details: `Updated sales order for ${order.customerId || 'Unknown'}`,
                            oldValue: oldVal,
                            newValue: order
                        });
                        notify('Sales order updated', 'success');
                    } catch (err: any) {
                        notify(`Failed to update sales order: ${err.message}`, 'error');
                    }
                },
                deleteSalesOrder: async (id: string) => {
                    const oldVal = salesStore.salesOrders.find(o => o.id === id);
                    try {
                        // Release any active reservations
                        await inventoryReservationService.releaseSalesOrderReservations(id);
                        await salesStore.deleteSalesOrder(id);
                        addAuditLog({
                            action: 'DELETE',
                            entityType: 'SalesOrder',
                            entityId: id,
                            details: `Deleted sales order ${id}`,
                            oldValue: oldVal
                        });
                        notify('Sales order deleted', 'success');
                    } catch (err: any) {
                        notify(`Failed to delete sales order: ${err.message}`, 'error');
                    }
                },
            addJobOrder: async (jo: JobOrder) => {
                try {
                    await salesStore.addJobOrder(jo);
                    addAuditLog({
                        action: 'CREATE',
                        entityType: 'JobOrder',
                        entityId: jo.id,
                        details: `Created job order for ${jo.customerName}`,
                        newValue: jo
                    });
                } catch (err: any) {
                    notify(`Failed to add job order: ${err.message}`, 'error');
                }
            },
            updateJobOrder: async (jo: JobOrder, reason?: string) => {
                const oldVal = salesStore.jobOrders.find(prev => prev.id === jo.id);
                try {
                    await salesStore.updateJobOrder(jo);
                    addAuditLog({
                        action: 'UPDATE',
                        entityType: 'JobOrder',
                        entityId: jo.id,
                        details: `Updated job order for ${jo.customerName}`,
                        oldValue: oldVal,
                        newValue: jo,
                        reason: reason
                    });
                } catch (err: any) {
                    notify(`Failed to update job order: ${err.message}`, 'error');
                }
            },
            deleteJobOrder: async (id: string, reason?: string) => {
                const oldVal = salesStore.jobOrders.find(prev => prev.id === id);
                try {
                    await salesStore.deleteJobOrder(id);
                    addAuditLog({
                        action: 'DELETE',
                        entityType: 'JobOrder',
                        entityId: id,
                        details: `Deleted job order for ${oldVal?.customerName || id}`,
                        oldValue: oldVal,
                        reason: reason
                    });
                } catch (err: any) {
                    notify(`Failed to delete job order: ${err.message}`, 'error');
                }
            },
            parkOrder: (o: HeldOrder) => salesStore.addHeldOrder(o), retrieveOrder: (id: string) => salesStore.deleteHeldOrder(id),
            generateZReport,
            addCustomer: async (c: Customer, options?: { invite?: boolean }) => {
                try {
                    const credentials = await salesStore.addCustomer(c, options);
                    addAuditLog({
                        action: 'CREATE',
                        entityType: 'Customer',
                        entityId: c.id,
                        details: `Created new customer profile: ${c.name}`,
                        newValue: c
                    });
                    return credentials;
                } catch (err: any) {
                    notify(`Failed to add customer: ${err.message}`, 'error');
                    return null;
                }
            },
            updateCustomer: async (c: Customer) => {
                const oldVal = salesStore.customers.find(prev => prev.id === c.id);
                try {
                    await salesStore.updateCustomer(c);
                    addAuditLog({
                        action: 'UPDATE',
                        entityType: 'Customer',
                        entityId: c.id,
                        details: `Updated customer profile: ${c.name}`,
                        oldValue: oldVal,
                        newValue: c
                    });
                } catch (err: any) {
                    notify(`Failed to update customer: ${err.message}`, 'error');
                }
            },
            deleteCustomer: async (id: string) => {
                const oldVal = salesStore.customers.find(c => c.id === id);
                try {
                    await salesStore.deleteCustomer(id);
                    addAuditLog({
                        action: 'DELETE',
                        entityType: 'Customer',
                        entityId: id,
                        details: `Deleted customer profile: ${oldVal?.name || id}`,
                        oldValue: oldVal
                    });
                } catch (err: any) {
                    notify(`Failed to delete customer: ${err.message}`, 'error');
                }
            },
            createQuoteRevision: async (originalId: string) => {
                const original = salesStore.quotations.find(q => q.id === originalId);
                if (!original) {
                    notify("Original quotation not found", "error");
                    return;
                }

                // Generate revision ID (e.g., Q-100-REV1)
                let revNumber = 1;
                const baseId = originalId.split('-REV')[0];
                const existingRevisions = salesStore.quotations.filter(q => q.id.startsWith(`${baseId}-REV`));
                if (existingRevisions.length > 0) {
                    revNumber = existingRevisions.length + 1;
                }
                const revisionId = `${baseId}-REV${revNumber}`;

                const revision: Quotation = {
                    ...original,
                    id: revisionId,
                    date: new Date().toISOString(),
                    status: 'Sent',
                    notes: `Revision of ${originalId}. ${original.notes || ''}`
                };

                try {
                    await transactionService.processQuotationRevision(originalId, revision);
                    await salesStore.fetchSalesData();
                    notify(`Created revision ${revisionId}`, "success");
                    addAuditLog({
                        action: 'CREATE',
                        entityType: 'Quotation',
                        entityId: revisionId,
                        details: `Created revision of ${originalId}`,
                        newValue: revision
                    });
                } catch (err: any) {
                    notify(`Revision failed: ${err.message}`, "error");
                }
            },
            convertQuotationToWorkOrder,
            convertQuotationToJobTicket,
            convertOrderToJobTicket,
            convertQuotationToInvoice,
            convertJobOrderToInvoice,
            updateCustomerPayment, deleteCustomerPayment,
            permanentlyDeleteCustomerPayment,
            runRecurringBilling
        }}>
            {children}
        </SalesContext.Provider>
    );
};

export const useSales = () => {
    const context = useContext(SalesContext);
    if (!context) throw new Error('useSales must be used within SalesProvider');
    return context;
};
