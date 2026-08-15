export interface AIQuoteResult {
  documentType: 'quotation' | 'invoice';
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
  }>;
  discount: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  notes: string;
  dueDate: string;
  paymentTerms: string;
}

export function parseAIResponse(raw: string): AIQuoteResult {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      documentType: 'quotation',
      customer: { name: '', email: '', phone: '', address: '' },
      items: [],
      discount: { type: 'percentage', value: 0 },
      notes: '',
      dueDate: '',
      paymentTerms: '',
    };
  }

  const result: AIQuoteResult = {
    documentType: parsed.documentType === 'invoice' ? 'invoice' : 'quotation',
    customer: {
      name: String(parsed.customer?.name || parsed.customerName || parsed.client?.name || '').trim(),
      email: String(parsed.customer?.email || parsed.email || '').trim(),
      phone: String(parsed.customer?.phone || parsed.phone || '').trim(),
      address: String(parsed.customer?.address || parsed.address || '').trim(),
    },
    items: Array.isArray(parsed.items) ? parsed.items.map(normalizeItem) : [],
    discount: {
      type: parsed.discount?.type === 'fixed' ? 'fixed' : 'percentage',
      value: Math.max(0, Number(parsed.discount?.value) || 0),
    },
    notes: String(parsed.notes || parsed.note || '').trim(),
    dueDate: String(parsed.dueDate || parsed.due_date || parsed.due || '').trim(),
    paymentTerms: String(parsed.paymentTerms || parsed.payment_terms || parsed.terms || '').trim(),
  };

  return result;
}

function normalizeItem(item: any) {
  return {
    description: String(
      item.description || item.name || item.productName || item.product || item.desc || ''
    ).trim(),
    quantity: Math.max(1, Math.floor(Number(item.quantity || item.qty || item.q || 1)) || 1),
    unitPrice: Math.max(0, Number(item.unitPrice || item.unit_price || item.price || item.cost || item.rate || 0)),
    taxRate: Math.max(0, Number(item.taxRate || item.tax_rate || item.tax || item.vat || 0)),
  };
}
