import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Inbox, FileText, PackageCheck, HandCoins, History } from 'lucide-react';
import GenericHub from '../GenericHub';
import QuotationRequests from './QuotationRequests';
import { adminLifecycle } from '../../services/adminPortalClient';
import { getJsonRequestHeaders } from '../../services/requestHeaders';
import { API_BASE_URL } from '../../config/api.js';
import { markAlertsReadForActionUrl } from '../../services/systemAlertService';

const QuotationRequestsHub: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const targetTab = (location.state as any)?.tab;

  const [inboxCount, setInboxCount] = useState(0);
  const [quotationCount, setQuotationCount] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Opening the hub acknowledges its notifications: request-pipeline
        // admin notifications are marked read server-side and the matching
        // bell alerts locally, so this badge (and the dashboard/topbar dot)
        // disappear.
        await adminLifecycle.requests.markInboxRead().catch(() => {});
        await markAlertsReadForActionUrl('/sales-flow/requests').catch(() => {});

        const [reqs, inboxReqs, quotes, orderList, paymentReqs] = await Promise.all([
          adminLifecycle.requests.list(),
          adminLifecycle.requests.inbox().catch(() => []),
          adminLifecycle.quotations.list(),
          adminLifecycle.orders.list().catch(() => []),
          fetch(`${API_BASE_URL}/payment-requests`, { headers: await getJsonRequestHeaders() }).then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        if (cancelled) return;
        setInboxCount((inboxReqs || []).length);
        setQuotationCount((quotes || []).length);
        setOrderCount((orderList || []).length);
        setPaymentCount(Array.isArray(paymentReqs) ? paymentReqs.length : 0);
        const history = (reqs || []).filter((r: any) => ['rejected', 'cancelled', 'converted'].includes(String(r.status || '')));
        setHistoryCount(history.length);
      } catch {
        if (!cancelled) {
          setInboxCount(0);
          setQuotationCount(0);
          setOrderCount(0);
          setPaymentCount(0);
          setHistoryCount(0);
        }
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (targetTab) {
    return <QuotationRequests />;
  }

  const options = [
    {
      label: 'Inbox',
      description: 'Review new customer requests, assign staff, and triage submissions.',
      onClick: () => navigate('/sales-flow/requests', { state: { tab: 'inbox' } }),
      icon: Inbox,
      badge: inboxCount || undefined,
    },
    {
      label: 'Quotations',
      description: 'Review official quotations, track versions, signatures, and conversions.',
      onClick: () => navigate('/sales-flow/requests', { state: { tab: 'quotations' } }),
      icon: FileText,
      badge: quotationCount || undefined,
    },
    {
      label: 'Orders',
      description: 'Manage sales orders, track fulfillment status, and advance production milestones.',
      onClick: () => navigate('/sales-flow/requests', { state: { tab: 'orders' } }),
      icon: PackageCheck,
      badge: orderCount || undefined,
    },
    {
      label: 'Payment Requests',
      description: 'Manage bank-transfer payment intents linked to requests and orders.',
      onClick: () => navigate('/sales-flow/requests', { state: { tab: 'payments' } }),
      icon: HandCoins,
      badge: paymentCount || undefined,
    },
    {
      label: 'History',
      description: 'Audit trail of rejected, cancelled, and converted requests.',
      onClick: () => navigate('/sales-flow/requests', { state: { tab: 'history' } }),
      icon: History,
      badge: historyCount || undefined,
    },
  ];

  return (
    <GenericHub
      title="Quotation Requests"
      subtitle="Review customer requests, issue quotations, and convert accepted quotes into orders."
      options={options}
      accentColor="#146b60"
    />
  );
};

export default QuotationRequestsHub;
