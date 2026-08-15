import { ExaminationInvoiceSchema, FinancialDocSchema, LogisticsDocSchema, PrimeDocData, SalesExchangeSchema, SubscriptionDocSchema } from '../views/shared/components/PDF/schemas';
import { bomService } from '../services/bomService';
import { currencyService } from '../services/currencyService';
import { inferSignatureInputMode, resolveSignatureDataUrl } from './signatureUtils';

/**
 * Maps various document types (Invoice, Quotation, Subscription, Sales Order, Sales Exchange) 
 * to the unified format required by the PDF components.
 */
const ensureItems = (items: any[] | undefined | null, label = 'Item'): any[] => {
  const safe = items || [];
  // Filter out completely empty items (no desc, no name, no id)
  const valid = safe.filter((i: any) => i && (i.desc || i.name || i.productName || i.description || i.id));
  if (valid.length === 0) {
    return [{ desc: `No ${label.toLowerCase()} available`, qty: 0, price: 0, total: 0 }];
  }
  return valid;
};

export const generateAccountSummary = (item: any, companyConfig: any, customers: any[] = []) => {
    const walletBalance = Number(item.walletBalance || 0);
    let outstandingBalance = Number(item.totalCustomerOutstanding || 0);
    
    // Compute outstanding balance from customer's live outstandingBalance if not present in payload
    if (outstandingBalance === 0) {
        const customerId = item.customerId || item.customer_id || item.customer?.id || item.clientId || item.client_id;
        if (customerId) {
            const customer = customers.find((c: any) => c.id === customerId || c.customerId === customerId);
            if (customer?.outstandingBalance) {
                outstandingBalance = Number(customer.outstandingBalance);
            }
        }
    }
    
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
    const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    
    const fmt = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    return {
        outstandingBalance,
        walletBalance,
        statement: `Your outstanding balance is ${currency} ${fmt(outstandingBalance)} and wallet balance of ${currency} ${fmt(walletBalance)} as of ${todayStr}.`
    };
};

export const mapToInvoiceData = (item: any, companyConfig: any, targetType?: string, boms?: any[], inventory?: any[]): PrimeDocData => {
    const toNum = (val: any, fallback = 0) => {
        if (typeof val === 'number') return isNaN(val) ? fallback : val;
        if (!val) return fallback;
        const cleaned = String(val).replace(/[^0-9.-]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? fallback : n;
    };
    const toIsoDateTime = (value?: string) => {
        const parsed = value ? new Date(value) : new Date();
        if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
        return parsed.toISOString();
    };
    const normalizeDateInputValue = (value?: string) => {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString().split('T')[0];
    };
    const subtractOneDay = (value?: string) => {
        const normalized = normalizeDateInputValue(value);
        if (!normalized) return '';
        const parsed = new Date(normalized);
        parsed.setDate(parsed.getDate() - 1);
        return parsed.toISOString().split('T')[0];
    };
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || 'K';
    const fmt = (val: any) => toNum(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const resolveFirstText = (...candidates: any[]) => {
        for (const candidate of candidates) {
            const normalized = String(candidate ?? '').trim();
            if (normalized) return normalized;
        }

        return '';
    };
    const resolveAcceptedBy = (...candidates: any[]) => {
        const preferred = String(
            item.customerName
            || item.customer_name
            || item.schoolName
            || item.school_name
            || ''
        ).trim();

        if (preferred) return preferred;

        for (const candidate of candidates) {
            const normalized = String(candidate || '').trim();
            if (normalized) return normalized;
        }

        return 'N/A';
    };
    const buildServiceDescription = (line: any) => {
        const base = line?.name || line?.productName || line?.description || 'N/A';
        const service = line?.serviceDetails;
        if (!service) return base;

        return `${base} (${toNum(service.pages)} pages)`;
    };
    const normalizeProofOfDelivery = (proof: any) => {
        if (!proof) return undefined;

        const signatureDataUrl = resolveSignatureDataUrl(proof);
        if (!signatureDataUrl) return undefined;

        return {
            ...proof,
            signatureDataUrl,
            signatureInputMode: inferSignatureInputMode(proof.signatureInputMode, signatureDataUrl),
            notes: proof.notes || proof.remarks,
            remarks: proof.remarks || proof.notes,
        };
    };

    if (targetType === 'SALES_EXCHANGE') {
        const exchangeItems = Array.isArray(item.items)
            ? item.items
            : (Array.isArray(item.exchange_items) ? item.exchange_items : []);

        const exchangeData = {
            exchangeNumber: item.exchange_number || item.exchangeNumber || item.id || 'SE-00000',
            date: new Date(item.exchange_date || item.exchangeDate || item.date || Date.now()).toLocaleDateString(),
            customerName: item.customer_name || item.customerName || 'N/A',
            address: resolveFirstText(
                item.customerAddress,
                item.customer_address,
                item.shippingAddress,
                item.shipping_address,
                item.billingAddress,
                item.billing_address,
                item.schoolAddress,
                item.school_address,
                item.address
            ),
            phone: resolveFirstText(
                item.customerPhone,
                item.customer_phone,
                item.schoolPhone,
                item.school_phone,
                item.phone
            ),
            invoiceNumber: item.invoice_id || item.invoiceId || 'N/A',
            reason: item.reason || item.exchange_reason || 'N/A',
            remarks: item.remarks || '',
            items: exchangeItems.map((i: any) => ({
                desc: i.product_name || i.productName || i.description || i.name || i.desc || 'Item',
                qtyReturned: toNum(i.qty_returned ?? i.qtyReturned ?? i.quantityReturned),
                qtyReplaced: toNum(i.qty_replaced ?? i.qtyReplaced ?? i.quantityReplaced),
                priceDiff: toNum(i.price_difference ?? i.priceDifference ?? i.priceDiff),
                replacedProductName: i.replaced_product_name || i.replacedProductName || i.product_name || i.productName || i.description || i.name || 'Same Product'
            })),
            totalPriceDiff: toNum(item.total_price_difference || item.totalPriceDiff ||
                exchangeItems.reduce((sum: number, i: any) => sum + toNum(i.price_difference ?? i.priceDifference ?? i.priceDiff), 0))
        };
        return SalesExchangeSchema.parse(exchangeData);
    }

    // Check if frequency exists and has a valid value (not null, undefined, or empty string)
    const hasValidFrequency = item.frequency != null &&
                              item.frequency !== '' &&
                              typeof item.frequency !== 'undefined';
    
    const originModule = String(item.originModule || item.origin_module || '').toLowerCase();
    const isExaminationInvoice = targetType === 'EXAMINATION_INVOICE'
        || originModule === 'examination'
        || String(item.documentTitle || item.document_title || '').toLowerCase().includes('examination invoice');
    const isInvoice = (('invoiceNumber' in item || (item.id && item.id.toString().startsWith('INV'))) && !hasValidFrequency) || isExaminationInvoice;
    const isSubscription = hasValidFrequency;
    const isOrder = targetType === 'ORDER' || targetType === 'SALES_ORDER' || (('orderNumber' in item || (item.id && item.id.toString().startsWith('SO'))) && !('invoiceNumber' in item));
    const isDeliveryNote = targetType === 'DELIVERY_NOTE' || 'invoiceId' in item;
    const isJobOrder = 'jobTitle' in item && !isInvoice;
    const isWorkOrder = targetType === 'WORK_ORDER' || 'quantityPlanned' in item;
    const isPurchaseOrder = targetType === 'PO';
    const isQuotation = targetType === 'QUOTATION' || (!isInvoice && !isSubscription && !isDeliveryNote && !isJobOrder && !isWorkOrder && !isPurchaseOrder && !isOrder && !('totalAmount' in item));

    const docType = targetType || (isExaminationInvoice ? 'EXAMINATION_INVOICE' :
        isSubscription ? 'SUBSCRIPTION' :
        isDeliveryNote ? 'DELIVERY_NOTE' :
            isJobOrder ? 'WORK_ORDER' :
                isWorkOrder ? 'WORK_ORDER' :
                    isInvoice ? 'INVOICE' :
                        isOrder ? 'SALES_ORDER' : 'QUOTATION');

    const resolvedNumber = (docType === 'INVOICE' || docType === 'EXAMINATION_INVOICE')
        ? (item.invoiceNumber || item.id?.toString() || 'TBD')
        : ((docType === 'ORDER' || docType === 'SALES_ORDER' || docType === 'WORK_ORDER')
            ? (item.orderNumber || item.id?.toString() || 'TBD')
            : (docType === 'DELIVERY_NOTE'
                ? (item.dnNumber || item.deliveryNoteNumber || item.id?.toString() || 'TBD')
                : (item.id?.toString() || item.invoiceNumber || item.orderNumber || 'TBD')));

    const explicitConversionDetails = item.conversionDetails ? {
        sourceType: item.conversionDetails.sourceType || item.conversionDetails.source_type || 'Quotation',
        sourceNumber: item.conversionDetails.sourceNumber || item.conversionDetails.source_number || item.quotationId || item.quotation_id || item.orderNumber || item.invoiceNumber || item.invoiceId || 'N/A',
        date: item.conversionDetails.date || item.conversionDetails.convertedAt || item.conversionDetails.converted_at || new Date(item.date || Date.now()).toLocaleDateString(),
        acceptedBy: resolveAcceptedBy(item.conversionDetails.acceptedBy, item.conversionDetails.accepted_by),
        locationStamp: item.conversionDetails.locationStamp || item.conversionDetails.location_stamp
    } : undefined;

    const parsedConversionDetails = (item.notes || item.instructions) && (item.notes?.includes('Converted from') || item.instructions?.includes('Converted from')) ? (() => {
        const combinedNotes = `${item.notes || ''} ${item.instructions || ''}`;
        const detailedMatch = combinedNotes.match(/Converted from \[(.*?)\] #\[(.*?)\] on \[(.*?)\](?: as accepted by \[(.*?)\])?(?: with GPS \[(.*?), (.*?)\])?/);
        if (detailedMatch) {
            return {
                sourceType: detailedMatch[1],
                sourceNumber: detailedMatch[2],
                date: detailedMatch[3],
                acceptedBy: resolveAcceptedBy(detailedMatch[4]),
                locationStamp: detailedMatch[5] && detailedMatch[6] ? {
                    lat: parseFloat(detailedMatch[5]),
                    lng: parseFloat(detailedMatch[6])
                } : undefined
            };
        }

        const simpleMatch = combinedNotes.match(/Converted from \[(.*?)\] on \[(.*?)\](?: as accepted by \[(.*?)\])?/);
        if (simpleMatch) {
            return {
                sourceType: 'Source',
                sourceNumber: simpleMatch[1],
                date: simpleMatch[2],
                acceptedBy: resolveAcceptedBy(simpleMatch[3])
            };
        }

        return undefined;
    })() : undefined;

    const inferredConversionDetails = (() => {
        if (docType === 'EXAMINATION_INVOICE') {
            const sourceNumber = String(item.batchId || item.originBatchId || item.origin_batch_id || '').trim();
            if (!sourceNumber) return undefined;
            return {
                sourceType: 'Examination Batch',
                sourceNumber,
                date: new Date(item.date || Date.now()).toLocaleDateString(),
                acceptedBy: resolveAcceptedBy()
            };
        }

        if (docType === 'ORDER' || docType === 'SALES_ORDER') {
            const sourceNumber = String(item.quotationId || item.quotation_id || '').trim();
            if (!sourceNumber) return undefined;
            return {
                sourceType: 'Quotation',
                sourceNumber,
                date: new Date(item.orderDate || item.date || Date.now()).toLocaleDateString(),
                acceptedBy: resolveAcceptedBy()
            };
        }

        return undefined;
    })();

    const baseData = {
        number: resolvedNumber,
        date: new Date(item.orderDate || item.date || item.nextRunDate || Date.now()).toLocaleDateString(),
        dueDate: normalizeDateInputValue(item.dueDate || item.validUntil || item.expiryDate || ''),
        paymentTerms: resolveFirstText(
            item.paymentTerms,
            item.payment_terms
        ),
        clientName: resolveFirstText(
            item.customerName,
            item.customer_name,
            item.schoolName,
            item.school_name,
            item.vendorName,
            item.vendor_name,
            item.supplierName,
            item.supplier_name,
            item.supplierId,
            item.customerId
        ) || 'N/A',
        address: resolveFirstText(
            item.shippingAddress,
            item.shipping_address,
            item.billingAddress,
            item.billing_address,
            item.customerAddress,
            item.customer_address,
            item.vendorAddress,
            item.vendor_address,
            item.supplierAddress,
            item.supplier_address,
            item.schoolAddress,
            item.school_address,
            item.address
        ),
        phone: resolveFirstText(
            item.customerPhone,
            item.customer_phone,
            item.vendorPhone,
            item.vendor_phone,
            item.supplierPhone,
            item.supplier_phone,
            item.schoolPhone,
            item.school_phone,
            item.phone
        ),
        createdAtIso: toIsoDateTime(item.createdAt || item.created_at || item.orderDate || item.date || item.issuedAt || item.issued_at),
        createdByName: String(
            item.createdBy
            || item.created_by
            || item.updatedBy
            || item.updated_by
            || item.cashierName
            || item.cashier_name
            || item.operatorName
            || item.operator_name
            || item.userName
            || item.user_name
            || ''
        ).trim() || 'System User',
        isConverted: Boolean(
            explicitConversionDetails ||
            inferredConversionDetails ||
            item.status === 'Converted' ||
            item.status === 'Accepted' ||
            item.status === 'Completed' ||
            (item.notes && item.notes.includes('Converted from')) ||
            (item.instructions && item.instructions.includes('Converted from')) ||
            (item.proofOfDelivery && item.proofOfDelivery.locationStamp)
        ),
        conversionDetails: explicitConversionDetails || parsedConversionDetails || inferredConversionDetails,
        items: ensureItems(item.items, 'items').map((i: any) => ({
            desc: buildServiceDescription(i) || (isJobOrder ? item.jobTitle : 'N/A'),
            qty: toNum(i.quantity || i.qty || item.totalQuantity),
        }))
    };
    const explicitStatus = String(item.status || '').trim().toLowerCase();

    const isCancelledStatus = (s: string) => s === 'cancelled' || s === 'canceled' || s === 'void' || s === 'voided';

    const resolvedFinancialStatus = (() => {
        if (docType === 'SUBSCRIPTION') {
            return item.status || 'Active';
        }

        if (docType === 'INVOICE' || docType === 'EXAMINATION_INVOICE' || docType === 'ORDER' || docType === 'SALES_ORDER') {
            if (isCancelledStatus(explicitStatus)) return 'Cancelled';

            const totalAmount = toNum(item.totalAmount || item.total || item.total_amount || item.total_cost || 0);
            const paidAmount = toNum(item.paidAmount || item.amountPaid || item.paid_amount || 0);

            if (paidAmount >= totalAmount && totalAmount > 0) return 'Paid';
            if (paidAmount > 0) return 'Partially Paid';
            if (explicitStatus === 'paid') return 'Paid';
            if (explicitStatus === 'partial' || explicitStatus === 'partially paid' || explicitStatus === 'partially_paid') return 'Partially Paid';
            if (explicitStatus === 'overdue') return 'Overdue';
            return 'Unpaid';
        }

        return item.status || 'Pending';
    })();

    if (docType === 'INVOICE' || docType === 'EXAMINATION_INVOICE' || docType === 'SALES_ORDER' || docType === 'PO' || docType === 'QUOTATION' || docType === 'ORDER' || docType === 'SUBSCRIPTION') {
        const financialData = {
            ...baseData,
            items: ensureItems(item.items, 'line items').map((i: any) => ({
                desc: buildServiceDescription(i),
                qty: toNum(i.quantity || i.qty, 1),
                price: toNum(i.price || i.unitPrice || i.cost),
                total: toNum(i.total || i.subtotal || (toNum(i.quantity || i.qty, 1) * toNum(i.price || i.unitPrice || i.cost))),
            })),
            subtotal: toNum(item.totalAmount || item.total || item.total_amount || item.total_cost || item.subtotal || 0),
            discount: toNum(item.discount || item.totalDiscount || 0),
            discountType: item.discountType || 'fixed',
            discountRaw: toNum(item.discountRaw || 0),
            roundingDifference: toNum(item.roundingDifference || item.roundingTotal || item.rounding_difference || 0),
            roundingMethod: String(item.roundingMethod || item.rounding_method || ''),
            amountPaid: toNum(item.paidAmount || item.amountPaid || item.paid_amount || 0),
            totalAmount: toNum(item.totalAmount || item.total || item.total_amount || item.total_cost || 0),
            invoiceNumber: item.invoiceNumber || (docType === 'INVOICE' ? item.id : undefined),
            orderNumber: item.orderNumber || (['ORDER', 'SALES_ORDER'].includes(docType) ? item.id : undefined),
            status: resolvedFinancialStatus,
            isCancelled: isCancelledStatus(explicitStatus) || item.isCancelled === true || item.cancelled === true,
            walletBalance: toNum(item.walletBalance ?? item.wallet_balance ?? 0),
            totalCustomerOutstanding: item.totalCustomerOutstanding !== undefined ? toNum(item.totalCustomerOutstanding) : undefined,
        };

        if (docType === 'EXAMINATION_INVOICE') {
            const classBreakdownRaw = Array.isArray(item.classBreakdown) ? item.classBreakdown : [];

            const examData = {
                ...financialData,
                batchId: String(item.batchId || item.originBatchId || item.origin_batch_id || ''),
                schoolName: item.schoolName || item.customerName || item.clientName || '',
                academicYear: item.academicYear || item.academic_year || '',
                term: item.term || '',
                examType: item.examType || item.exam_type || '',
                subAccountName: item.subAccountName || item.sub_account_name || '',
                classBreakdown: classBreakdownRaw.map((cls: any) => ({
                    className: String(cls?.className || cls?.class_name || 'Class'),
                    subjects: Array.isArray(cls?.subjects) ? cls.subjects.map((subject: any) => String(subject)) : [],
                    totalCandidates: toNum(cls?.totalCandidates ?? cls?.total_candidates),
                    chargePerLearner: toNum(cls?.chargePerLearner ?? cls?.charge_per_learner),
                    classTotal: toNum(cls?.classTotal ?? cls?.class_total)
                })),
                materialTotal: toNum(item.materialTotal),
                adjustmentTotal: toNum(item.adjustmentTotal),
                roundingDifference: toNum(item.roundingDifference || item.roundingTotal),
                preRoundingTotalAmount: toNum(item.preRoundingTotalAmount || item.subtotal),
            };
            return ExaminationInvoiceSchema.parse(examData);
        }

        if (docType === 'SUBSCRIPTION') {
            const nextBillingDate = normalizeDateInputValue(item.nextBillingDate || item.nextRunDate || '');
            const billingPeriodStart = normalizeDateInputValue(item.billingPeriodStart || item.date || '');
            const billingPeriodEnd = normalizeDateInputValue(item.billingPeriodEnd || subtractOneDay(nextBillingDate));

            const subscriptionData = {
                ...financialData,
                frequency: item.frequency || item.billingCycle || 'N/A',
                nextRunDate: normalizeDateInputValue(item.nextRunDate || ''),
                nextBillingDate,
                billingPeriodStart,
                billingPeriodEnd,
                totalCycles: item.totalCycles || undefined,
                walletBalance: toNum(item.walletBalance || 0),
                autoDeductWallet: !!item.autoDeductWallet,
                autoEmail: !!item.autoEmail,
                scheduledDates: item.scheduledDates || [],
                adjustmentSnapshots: item.adjustmentSnapshots || []
            };
            return SubscriptionDocSchema.parse(subscriptionData);
        }

        return FinancialDocSchema.parse(financialData);
    } else {
        const techSpecs: Record<string, string> = {};
        if (item.attributes) {
            Object.entries(item.attributes).forEach(([k, v]) => {
                if (k !== 'variantId' && k !== 'id') techSpecs[k] = String(v);
            });
        }

        let materialChecklist: string[] = [];
        if (item.bomId) {
            // Using a simple cache/lookup if boms/inventory are provided
            if (boms && inventory) {
                const bom = boms.find(b => b.id === item.bomId);
                if (bom) {
                    materialChecklist = bom.components.map((c: any) => {
                        const m = inventory.find(inv => inv.id === (c.materialId || c.itemId));
                        return m ? `${m.name} (${c.quantity} ${m.unit})` : `Material ${c.materialId || c.itemId}`;
                    });
                }
            } else {
                // Future enhancement: Fetch dynamically if not provided
                // Note: Current PDF components usually pass pre-fetched data
            }
        }

        const normalizedProof = normalizeProofOfDelivery(item.proofOfDelivery);
        const receivedAt = item.receivedAt || item.actualArrival || normalizedProof?.timestamp;

        const logisticsData = {
            ...baseData,
            status: item.status || undefined,
            technician: (item.technician || item.assignedTo) || undefined,
            receivedBy: (item.receivedBy || normalizedProof?.receivedBy) || undefined,
            receivedAt: receivedAt || undefined,
            driverName: (item.driverName || item.carrier) || undefined,
            vehicleNo: item.vehicleNo || undefined,
            signatureDataUrl: normalizedProof?.signatureDataUrl || undefined,
            proofOfDelivery: normalizedProof || undefined,
            notes: item.specialInstructions || item.notes || normalizedProof?.remarks || '',
            priority: item.priority || 'Normal',
            technicalSpecs: techSpecs,
            materialChecklist: materialChecklist.length > 0 ? materialChecklist : undefined,
            conversionDetails: baseData.conversionDetails || (normalizedProof?.locationStamp ? {
                sourceType: 'Sale',
                sourceNumber: item.orderId || item.invoiceNumber || item.invoiceId || item.orderNumber || 'N/A',
                date: new Date(normalizedProof.timestamp || Date.now()).toLocaleDateString(),
                acceptedBy: normalizedProof.receivedBy || 'N/A',
                locationStamp: normalizedProof.locationStamp
            } : undefined)
        };
        return LogisticsDocSchema.parse(logisticsData);
    }
};
