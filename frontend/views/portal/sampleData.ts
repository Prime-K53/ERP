// Sample data for portal modules

export const sampleDeliveries = [
  {
    id: 'del-001',
    order_number: 'ORD-88210',
    tracking_number: 'TRK-889021',
    status: 'out_for_delivery',
    customerName: 'Acme Corporation',
    driver_name: 'Robert Chen',
    driver_phone: '+265 991 234 567',
    vehicle_no: 'Truck TX-908',
    shipping_address: '123 Business Park, Lilongwe, Malawi',
    estimated_delivery: new Date(Date.now() + 2 * 86400000).toISOString(),
    orderDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    carrier: 'Prime Logistics',
  },
  {
    id: 'del-002',
    order_number: 'ORD-88211',
    tracking_number: 'TRK-889022',
    status: 'in_transit',
    customerName: 'Tech Solutions Ltd',
    driver_name: 'James Mwangi',
    driver_phone: '+265 992 345 678',
    vehicle_no: 'Van VT-456',
    shipping_address: '456 Industrial Area, Blantyre, Malawi',
    estimated_delivery: new Date(Date.now() + 3 * 86400000).toISOString(),
    orderDate: new Date(Date.now() - 4 * 86400000).toISOString(),
    carrier: 'Fast Delivery Co',
  },
  {
    id: 'del-003',
    order_number: 'ORD-88212',
    tracking_number: 'TRK-889023',
    status: 'delivered',
    customerName: 'Global Imports',
    driver_name: 'Sarah Banda',
    driver_phone: '+265 993 456 789',
    vehicle_no: 'Truck TR-789',
    shipping_address: '789 Market Street, Mzuzu, Malawi',
    estimated_delivery: new Date(Date.now() - 1 * 86400000).toISOString(),
    orderDate: new Date(Date.now() - 7 * 86400000).toISOString(),
    carrier: 'Prime Logistics',
  },
];

export const sampleAccountStatements = {
  opening_balance: 0,
  closing_balance: 1240,
  outstanding_balance: 1240,
  credit_limit: 10000,
  transactions: [
    { date: new Date(Date.now() - 30 * 86400000).toISOString(), description: 'IT Infrastructure Server Rack & Cabling', reference: 'INV-2026-003', debit: 1250, credit: 0, balance: 1250, type: 'INVOICE' },
    { date: new Date(Date.now() - 25 * 86400000).toISOString(), description: 'Payment received - Visa ****4920', reference: 'PAY INV 2026 003', debit: 0, credit: 1250, balance: 0, type: 'PAYMENT' },
    { date: new Date(Date.now() - 20 * 86400000).toISOString(), description: 'Warehouse storage bins & pallets order', reference: 'INV-2026-001', debit: 840.5, credit: 0, balance: 840.5, type: 'INVOICE' },
    { date: new Date(Date.now() - 15 * 86400000).toISOString(), description: 'Office expansion furniture batch order', reference: 'INV-2026-002', debit: 399.5, credit: 0, balance: 1240, type: 'INVOICE' },
  ],
};

export const sampleInvoices = [
  { id: 'inv-001', invoice_number: 'INV-2026-001', customer_name: 'Acme Corporation', total_amount: 45000, paid_amount: 20000, status: 'partial', due_date: new Date(Date.now() + 15 * 86400000).toISOString(), created_at: new Date(Date.now() - 30 * 86400000).toISOString(), description: '2x Ergonomic Office Chairs, 4x Dual Monitor Arms', reference: 'Office furniture expansion request #50211.' },
  { id: 'inv-002', invoice_number: 'INV-2026-002', customer_name: 'Tech Solutions Ltd', total_amount: 62500, paid_amount: 0, status: 'unpaid', due_date: new Date(Date.now() + 20 * 86400000).toISOString(), created_at: new Date(Date.now() - 20 * 86400000).toISOString(), description: '50x Heavy Duty Storage Containers, 10x Industrial Pallets', reference: 'Monthly warehouse materials batch order #4491C2' },
  { id: 'inv-003', invoice_number: 'INV-2026-003', customer_name: 'Global Imports', total_amount: 35000, paid_amount: 35000, status: 'paid', due_date: new Date(Date.now() - 10 * 86400000).toISOString(), created_at: new Date(Date.now() - 45 * 86400000).toISOString(), description: 'A4 Bond Paper 80gsm x 15 reams', reference: 'Q3 office supplies batch' },
  { id: 'inv-004', invoice_number: 'INV-2026-004', customer_name: 'Media Producers', total_amount: 28000, paid_amount: 0, status: 'overdue', due_date: new Date(Date.now() - 5 * 86400000).toISOString(), created_at: new Date(Date.now() - 35 * 86400000).toISOString(), description: 'Vinyl Banners 3x6ft x 8 pcs', reference: 'Event branding order #EVT-2026-08' },
  { id: 'inv-005', invoice_number: 'INV-2026-005', customer_name: 'Acme Corporation', total_amount: 18240, paid_amount: 0, status: 'overdue', due_date: new Date(Date.now() - 2 * 86400000).toISOString(), created_at: new Date(Date.now() - 25 * 86400000).toISOString(), description: 'Business cards 500 pcs', reference: 'Re-order batch #BC-500' },
  { id: 'inv-006', invoice_number: 'INV-2026-006', customer_name: 'Tech Solutions Ltd', total_amount: 12400, paid_amount: 0, status: 'unpaid', due_date: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: new Date(Date.now() - 12 * 86400000).toISOString(), description: 'Letterheads 1000 pcs', reference: 'Stationery reorder #LH-1K' },
];

export const sampleUnpaidInvoices = [
  { id: 'inv-002', invoice_number: 'INV-2026-002', total_amount: 62500, status: 'unpaid', due_date: new Date(Date.now() + 20 * 86400000).toISOString(), created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
  { id: 'inv-004', invoice_number: 'INV-2026-004', total_amount: 28000, status: 'overdue', due_date: new Date(Date.now() - 5 * 86400000).toISOString(), created_at: new Date(Date.now() - 35 * 86400000).toISOString() },
  { id: 'inv-005', invoice_number: 'INV-2026-005', total_amount: 18240, status: 'overdue', due_date: new Date(Date.now() - 2 * 86400000).toISOString(), created_at: new Date(Date.now() - 25 * 86400000).toISOString() },
  { id: 'inv-006', invoice_number: 'INV-2026-006', total_amount: 12400, status: 'unpaid', due_date: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: new Date(Date.now() - 12 * 86400000).toISOString() },
];

export const samplePayments = [
  { id: 'pay-001', amount: 20000, payment_method: 'Credit Card', date: new Date(Date.now() - 25 * 86400000).toISOString(), reference: 'PAY-99231', invoice_number: 'INV-2026-001', order_number: 'ORD-88210' },
  { id: 'pay-002', amount: 35000, payment_method: 'Mobile Money', date: new Date(Date.now() - 5 * 86400000).toISOString(), reference: 'PAY-99233', invoice_number: 'INV-2026-010', order_number: 'ORD-88211' },
  { id: 'pay-003', amount: 15000, payment_method: 'Bank Transfer', date: new Date(Date.now() - 15 * 86400000).toISOString(), reference: 'PAY-99234', invoice_number: 'INV-2026-002' },
];

export const sampleShipments = [
  { id: 'ship-001', order_number: 'ORD-88210', tracking_number: 'TRK-889021', status: 'shipped', carrier: 'Prime Logistics', driver_name: 'Robert Chen', vehicle_no: 'Truck TX-908', orderDate: new Date(Date.now() - 5 * 86400000).toISOString(), estimated_delivery: new Date(Date.now() + 2 * 86400000).toISOString() },
  { id: 'ship-002', order_number: 'ORD-88211', tracking_number: 'TRK-889022', status: 'in_transit', carrier: 'Fast Delivery Co', driver_name: 'James Mwangi', vehicle_no: 'Van VT-456', orderDate: new Date(Date.now() - 4 * 86400000).toISOString(), estimated_delivery: new Date(Date.now() + 3 * 86400000).toISOString() },
];

export const sampleRequests = [
  { id: 'req-001', request_number: 'REQ-2026-001', status: 'submitted', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), subtotal: 25000, items: [{ name: 'Business Cards', quantity: 500 }] },
  { id: 'req-002', request_number: 'REQ-2026-002', status: 'under_review', created_at: new Date(Date.now() - 5 * 86400000).toISOString(), subtotal: 48000, items: [{ name: 'Brochures', quantity: 1000 }] },
];

export const sampleQuotations = [
  { id: 'qt-001', quotation_number: 'QT-2026-001', status: 'ready', created_at: new Date(Date.now() - 3 * 86400000).toISOString(), total_amount: 32000 },
  { id: 'qt-002', quotation_number: 'QT-2026-002', status: 'accepted', created_at: new Date(Date.now() - 10 * 86400000).toISOString(), total_amount: 55000 },
];

export const sampleWallet = {
  balance: 15000,
  transactions: [
    { date: new Date(Date.now() - 20 * 86400000).toISOString(), amount: 10000, type: 'credit', reference: 'Deposit via Mobile Money' },
    { date: new Date(Date.now() - 15 * 86400000).toISOString(), amount: -5000, type: 'debit', reference: 'Payment for INV-2026-001' },
    { date: new Date(Date.now() - 5 * 86400000).toISOString(), amount: 10000, type: 'credit', reference: 'Deposit via Bank Transfer' },
  ],
};

export const sampleDocuments = [
  { id: 'doc-001', type: 'invoice', title: 'Invoice INV-2026-001', date: new Date(Date.now() - 30 * 86400000).toISOString(), url: '#/portal/invoices/inv-001', amount: 45000 },
  { id: 'doc-002', type: 'receipt', title: 'Payment Receipt PAY-99231', date: new Date(Date.now() - 25 * 86400000).toISOString(), url: '#/portal/payments/pay-001', amount: 20000 },
  { id: 'doc-003', type: 'statement', title: 'Account Statement - August 2026', date: new Date(Date.now() - 1 * 86400000).toISOString(), url: '#/portal/account-statements' },
];

export const sampleNotifications = [
  { id: 'notif-001', type: 'invoice', title: 'New Invoice', body: 'Invoice INV-2026-002 has been issued for K 62,500', created_at: new Date(Date.now() - 2 * 86400000).toISOString(), is_read: false, link: '#/portal/invoices/inv-002' },
  { id: 'notif-002', type: 'payment', title: 'Payment Received', body: 'K 35,000 payment received via Mobile Money', created_at: new Date(Date.now() - 5 * 86400000).toISOString(), is_read: true, link: '#/portal/payments/pay-002' },
  { id: 'notif-003', type: 'order', title: 'Order Shipped', body: 'Your order ORD-88210 has been shipped', created_at: new Date(Date.now() - 6 * 86400000).toISOString(), is_read: true, link: '#/portal/deliveries' },
];

export const sampleLoyalty = {
  points: 2500,
  cashback: 5000,
  tier: 'Gold',
  pointsHistory: [
    { date: new Date(Date.now() - 30 * 86400000).toISOString(), description: 'Purchase - INV-2026-001', points: 450, balance: 2050 },
    { date: new Date(Date.now() - 15 * 86400000).toISOString(), description: 'Referral Bonus', points: 500, balance: 2550 },
    { date: new Date(Date.now() - 5 * 86400000).toISOString(), description: 'Redeemed - K 500 Discount', points: -50, balance: 2500 },
  ],
};

export const sampleSupport = {
  contactItems: [
    { label: 'Customer Support', value: '+265 992 528 222' },
    { label: 'Sales Email', value: 'info.primemw@gmail.com' },
    { label: 'Support Email', value: 'chiwaturhonald@gmail.com' },
    { label: 'WhatsApp', value: '+265 992 528 222' },
    { label: 'Business Hours', value: 'Monday–Friday, 8:00 AM–5:00 PM' },
    { label: 'Office Address', value: 'Along M5 road Mtakataka, Malawi' },
  ],
};

// ── Sample catalog products (Orders · Catalog tab) ─────────────────────
// Used as a fallback when the catalog endpoint returns no data, so the
// catalog tab always has printable content to demo.
export const sampleCatalogProducts = [
  {
    id: 'smp-prod-001',
    name: 'Business Cards Premium 350gsm',
    sku: 'PRNT-BC-001',
    unit: 'pack',
    description: 'Double-sided, matte laminate business cards with rounded corners. Includes free digital proof.',
    unitPrice: 45000,
    price: 45000,
    quantity: 120,
    category: 'Business Cards',
    status: 'active',
  },
  {
    id: 'smp-prod-002',
    name: 'A4 Bond Paper 80gsm',
    sku: 'PRNT-PAP-001',
    unit: 'ream',
    description: 'High-brightness multi-purpose bond paper, ideal for everyday printing and photocopying.',
    unitPrice: 12500,
    price: 12500,
    quantity: 500,
    category: 'Paper & Stock',
    status: 'active',
  },
  {
    id: 'smp-prod-003',
    name: 'A5 Glossy Brochures',
    sku: 'PRNT-BR-001',
    unit: 'set',
    description: 'Tri-fold A5 brochures printed on 170gsm glossy art paper, full colour both sides.',
    unitPrice: 85000,
    price: 85000,
    quantity: 80,
    category: 'Brochures',
    status: 'active',
  },
  {
    id: 'smp-prod-004',
    name: 'Vinyl Banner 3×6ft',
    sku: 'PRNT-BN-001',
    unit: 'pc',
    description: 'Weather-resistant 440gsm vinyl banner with hemmed edges and eyelets, full colour.',
    unitPrice: 95000,
    price: 95000,
    quantity: 45,
    category: 'Banners',
    status: 'active',
  },
  {
    id: 'smp-prod-005',
    name: 'Die-Cut Stickers',
    sku: 'PRNT-ST-001',
    unit: 'sheet',
    description: 'Custom die-cut vinyl stickers, waterproof with gloss finish. Minimum 100 per sheet.',
    unitPrice: 22000,
    price: 22000,
    quantity: 200,
    category: 'Stickers & Labels',
    status: 'active',
  },
  {
    id: 'smp-prod-006',
    name: 'Letterheads 120gsm',
    sku: 'PRNT-LH-001',
    unit: 'pack',
    description: 'Premium cotton-fibre letterheads, full colour with your logo, 120gsm stock.',
    unitPrice: 38000,
    price: 38000,
    quantity: 160,
    category: 'Stationery',
    status: 'active',
  },
  {
    id: 'smp-prod-007',
    name: 'Hardcover Book Binding',
    sku: 'PRNT-BK-001',
    unit: 'copy',
    description: 'Professional hardcover binding with foil-stamped spine and printed endpapers.',
    unitPrice: 65000,
    price: 65000,
    quantity: 60,
    category: 'Books & Binding',
    status: 'active',
  },
  {
    id: 'smp-prod-008',
    name: 'Envelopes DL Window',
    sku: 'PRNT-EN-001',
    unit: 'pack',
    description: 'DL window envelopes, 100 per pack, white 100gsm with security tint lining.',
    unitPrice: 28000,
    price: 28000,
    quantity: 0,
    category: 'Stationery',
    status: 'active',
  },
];

// ── Sample product orders (Orders · Order History tab) ─────────────────
// Used as a fallback when the orders endpoint returns no data. Matches the
// OrderRow shape used by the Orders module (camelCase fields).
export const sampleOrders = [
  {
    id: 'smp-order-001',
    orderNumber: 'ORD-2026-001',
    orderDate: new Date(Date.now() - 2 * 86400000).toISOString(),
    totalAmount: 128000,
    status: 'Confirmed',
    items: [
      { name: 'Business Cards Premium 350gsm', quantity: 2, unitPrice: 45000, lineTotal: 90000 },
      { name: 'Letterheads 120gsm', quantity: 1, unitPrice: 38000, lineTotal: 38000 },
    ],
    shippingAddress: '123 Business Park, Lilongwe, Malawi',
    trackingNumber: 'TRK-889021',
    carrier: 'Prime Logistics',
    driverName: 'Robert Chen',
    vehicleNo: 'Truck TX-908',
    currentLocation: 'Distribution Center',
    estimatedDelivery: new Date(Date.now() + 1 * 86400000).toISOString(),
  },
  {
    id: 'smp-order-002',
    orderNumber: 'ORD-2026-002',
    orderDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    totalAmount: 265000,
    status: 'Processing',
    items: [
      { name: 'A5 Glossy Brochures', quantity: 2, unitPrice: 85000, lineTotal: 170000 },
      { name: 'Vinyl Banner 3×6ft', quantity: 1, unitPrice: 95000, lineTotal: 95000 },
    ],
    shippingAddress: '456 Industrial Area, Blantyre, Malawi',
    trackingNumber: null,
    carrier: null,
    driverName: null,
    vehicleNo: null,
    currentLocation: null,
    estimatedDelivery: null,
  },
  {
    id: 'smp-order-003',
    orderNumber: 'ORD-2026-003',
    orderDate: new Date(Date.now() - 10 * 86400000).toISOString(),
    totalAmount: 187500,
    status: 'Delivered',
    items: [
      { name: 'A4 Bond Paper 80gsm', quantity: 15, unitPrice: 12500, lineTotal: 187500 },
    ],
    shippingAddress: '789 Market Street, Mzuzu, Malawi',
    trackingNumber: 'TRK-889019',
    carrier: 'Fast Delivery Co',
    driverName: 'Sarah Banda',
    vehicleNo: 'Van VT-456',
    currentLocation: 'Delivered',
    estimatedDelivery: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'smp-order-004',
    orderNumber: 'ORD-2026-004',
    orderDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    totalAmount: 44000,
    status: 'Shipped',
    items: [
      { name: 'Die-Cut Stickers', quantity: 2, unitPrice: 22000, lineTotal: 44000 },
    ],
    shippingAddress: '12 Chipembere Highway, Lilongwe, Malawi',
    trackingNumber: 'TRK-889025',
    carrier: 'Prime Logistics',
    driverName: 'James Mwangi',
    vehicleNo: 'Truck TX-910',
    currentLocation: 'In Transit',
    estimatedDelivery: new Date(Date.now() + 2 * 86400000).toISOString(),
  },
  {
    id: 'smp-order-005',
    orderNumber: 'ORD-2026-005',
    orderDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    totalAmount: 91000,
    status: 'Pending',
    items: [
      { name: 'Letterheads 120gsm', quantity: 1, unitPrice: 38000, lineTotal: 38000 },
      { name: 'Envelopes DL Window', quantity: 1, unitPrice: 28000, lineTotal: 28000 },
      { name: 'A4 Bond Paper 80gsm', quantity: 2, unitPrice: 12500, lineTotal: 25000 },
    ],
    shippingAddress: '300 Presidential Way, Lilongwe, Malawi',
    trackingNumber: null,
    carrier: null,
    driverName: null,
    vehicleNo: null,
    currentLocation: null,
    estimatedDelivery: null,
  },
  {
    id: 'smp-order-006',
    orderNumber: 'ORD-2026-006',
    orderDate: new Date(Date.now() - 12 * 86400000).toISOString(),
    totalAmount: 130000,
    status: 'Cancelled',
    items: [
      { name: 'Hardcover Book Binding', quantity: 2, unitPrice: 65000, lineTotal: 130000 },
    ],
    shippingAddress: '55 Kamuzu Road, Blantyre, Malawi',
    trackingNumber: null,
    carrier: null,
    driverName: null,
    vehicleNo: null,
    currentLocation: null,
    estimatedDelivery: null,
  },
];

export const sampleReferralSettings = {
  enabled: true,
  rewardType: 'credit',
  rewardValue: 50,
  rewardPercentage: 5,
  minimumPurchase: 100000,
  maxRewardAmount: 150000,
  expiryDays: 90,
  requireApproval: true,
  shareMessage: 'I highly recommend Prime Printing for quality, affordable, and reliable printing services. Simply mention that you were referred by an existing customer, and you\'ll receive a discount on your first order.',
};

export const sampleReferralFunnel = {
  total: 12,
  qualified: 8,
  paid: 5,
  totalEarned: 375000,
};

export const sampleReferrals = [
  {
    id: 'ref-001',
    referredCustomerId: 'cust-101',
    referredCustomerName: 'Acme Corporation',
    referredCustomerEmail: 'procurement@acme.co.mw',
    status: 'converted',
    pendingInvoiceId: 'inv-101',
    pendingInvoiceAmount: 125000,
    convertedInvoiceId: 'inv-101',
    convertedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    notes: 'Met at business expo',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'ref-002',
    referredCustomerId: 'cust-102',
    referredCustomerName: 'Tech Solutions Ltd',
    referredCustomerEmail: 'orders@techsolutions.mw',
    status: 'active',
    pendingInvoiceId: 'inv-102',
    pendingInvoiceAmount: 84000,
    convertedInvoiceId: null,
    convertedAt: null,
    notes: 'Follow up next week',
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'ref-003',
    referredCustomerId: 'cust-103',
    referredCustomerName: 'Global Imports',
    referredCustomerEmail: 'info@globalimports.mw',
    status: 'pending',
    pendingInvoiceId: null,
    pendingInvoiceAmount: 0,
    convertedInvoiceId: null,
    convertedAt: null,
    notes: '',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: 'ref-004',
    referredCustomerId: 'cust-104',
    referredCustomerName: 'Media Producers',
    referredCustomerEmail: 'creative@mediaproducers.mw',
    status: 'expired',
    pendingInvoiceId: null,
    pendingInvoiceAmount: 0,
    convertedInvoiceId: null,
    convertedAt: null,
    notes: 'Did not place order within 90 days',
    createdAt: new Date(Date.now() - 120 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 95 * 86400000).toISOString(),
  },
];

export const sampleReferralRewards = [
  {
    id: 'rew-001',
    referralId: 'ref-001',
    referralCode: 'REF-88210',
    referredCustomerId: 'cust-101',
    referredCustomerName: 'Acme Corporation',
    invoiceId: 'inv-101',
    invoiceAmount: 125000,
    amount: 6250,
    status: 'paid',
    approvedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    cancelledAt: null,
    cancelReason: null,
    walletTransactionId: 'wal-001',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: 'rew-002',
    referralId: 'ref-001',
    referralCode: 'REF-88210',
    referredCustomerId: 'cust-101',
    referredCustomerName: 'Acme Corporation',
    invoiceId: 'inv-105',
    invoiceAmount: 85000,
    amount: 4250,
    status: 'pending',
    approvedAt: null,
    cancelledAt: null,
    cancelReason: null,
    walletTransactionId: null,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'rew-003',
    referralId: 'ref-002',
    referralCode: 'REF-88211',
    referredCustomerId: 'cust-102',
    referredCustomerName: 'Tech Solutions Ltd',
    invoiceId: 'inv-102',
    invoiceAmount: 84000,
    amount: 4200,
    status: 'approved',
    approvedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    cancelledAt: null,
    cancelReason: null,
    walletTransactionId: null,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];
