const { sendEmail } = require('./emailService.cjs');

const NOTIFICATION_EVENTS = {
  LOW_STOCK: 'low_stock',
  APPROVAL_REQUESTED: 'approval_requested',
  APPROVAL_RESOLVED: 'approval_resolved',
  ORDER_CONFIRMED: 'order_confirmed',
  PAYMENT_RECEIVED: 'payment_received',
  INVOICE_READY: 'invoice_ready',
  SYSTEM_ALERT: 'system_alert',
};

const dispatchLowStockAlert = async ({ items, recipients }) => {
  const itemList = items.map(i => `  • ${i.name} (SKU: ${i.sku || 'N/A'}) — Stock: ${i.stock}, Reorder Point: ${i.reorderPoint}`).join('\n');
  const subject = `[Prime ERP] Low Stock Alert — ${items.length} item(s) need reorder`;
  const text = `The following inventory items are at or below their reorder point:\n\n${itemList}\n\nPlease review and place purchase orders as needed.\n\n— Prime ERP System`;
  const html = `<div style="font-family:system-ui;max-width:600px;margin:0 auto;padding:20px;background:#f8fafc;border-radius:12px;">
    <div style="background:#dc2626;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">⚠️ Low Stock Alert</h2>
    </div>
    <div style="background:white;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
      <p style="margin:0 0 16px;color:#475569;">The following inventory items are at or below their reorder point:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f1f5f9;"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Item</th><th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;">Stock</th><th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0;">Reorder At</th></tr></thead>
        <tbody>${items.map(i => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;"><strong>${i.name}</strong><br/><span style="font-size:12px;color:#94a3b8;">SKU: ${i.sku || 'N/A'}</span></td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:600;">${i.stock}</td><td style="padding:8px 12px;text-align:center;border-bottom:1px solid #e2e8f0;">${i.reorderPoint}</td></tr>`).join('')}</tbody>
      </table>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">Please review and place purchase orders as needed.</p>
    </div>
    <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;text-align:center;">— Prime ERP System</p>
  </div>`;
  const results = [];
  for (const email of recipients) {
    try {
      await sendEmail({ to: email, subject, text, html });
      results.push({ email, success: true });
    } catch (err) {
      results.push({ email, success: false, error: err.message });
    }
  }
  return { event: NOTIFICATION_EVENTS.LOW_STOCK, results };
};

const dispatchApprovalNotification = async ({ type, entityType, entityId, entityName, requestedBy, approverEmail, action }) => {
  const isRequest = action === 'request';
  const subject = isRequest
    ? `[Prime ERP] ${entityType} Approval Request — ${entityName}`
    : `[Prime ERP] ${entityType} ${action} — ${entityName}`;
  const text = isRequest
    ? `${requestedBy} is requesting approval for ${entityType}: ${entityName} (ID: ${entityId}).\n\nPlease review in Prime ERP.`
    : `${entityType} ${entityName} (ID: ${entityId}) has been ${action} by ${requestedBy}.`;
  const html = `<div style="font-family:system-ui;max-width:500px;margin:0 auto;padding:20px;">
    <div style="background:${isRequest ? '#f59e0b' : '#10b981'};color:white;padding:16px 24px;border-radius:8px;"><h2 style="margin:0;font-size:16px;">${isRequest ? '📋' : '✅'} ${entityType} ${isRequest ? 'Approval Request' : action}</h2></div>
    <div style="background:white;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">
      <p style="margin:0 0 12px;color:#334155;"><strong>${entityName}</strong></p>
      <p style="margin:0 0 8px;color:#64748b;font-size:13px;">ID: ${entityId} | ${isRequest ? `Requested by: ${requestedBy}` : `Action by: ${requestedBy}`}</p>
      <p style="margin:12px 0 0;padding:12px;background:#f8fafc;border-radius:6px;font-size:13px;color:#475569;">Please review in Prime ERP to take action.</p>
    </div>
  </div>`;
  try {
    const result = await sendEmail({ to: approverEmail, subject, text, html });
    return { event: isRequest ? NOTIFICATION_EVENTS.APPROVAL_REQUESTED : NOTIFICATION_EVENTS.APPROVAL_RESOLVED, success: true, messageId: result.messageId };
  } catch (err) {
    return { event: isRequest ? NOTIFICATION_EVENTS.APPROVAL_REQUESTED : NOTIFICATION_EVENTS.APPROVAL_RESOLVED, success: false, error: err.message };
  }
};

module.exports = {
  NOTIFICATION_EVENTS,
  dispatchLowStockAlert,
  dispatchApprovalNotification,
};
