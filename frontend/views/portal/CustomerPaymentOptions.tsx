import React from 'react';
import { CreditCard, Building2, Smartphone, Banknote } from 'lucide-react';
import PortalPageHeader from './components/PortalPageHeader';
import PortalCard from './components/PortalCard';
import { F } from './portalStyles';

interface PaymentMethod {
  id: string;
  type: 'bank' | 'mobile' | 'cash';
  name: string;
  enabled: boolean;
  displayOrder: number;
  details: { label: string; value: string }[];
  instructions?: string;
}

const paymentMethods: PaymentMethod[] = [
  {
    id: 'bank-national',
    type: 'bank',
    name: 'National Bank',
    enabled: true,
    displayOrder: 1,
    details: [
      { label: 'Account Name', value: 'Prime Media' },
      { label: 'Account Number', value: '1010182286' },
    ],
  },
  {
    id: 'bank-fcb',
    type: 'bank',
    name: 'First Capital Bank',
    enabled: true,
    displayOrder: 2,
    details: [
      { label: 'Account Name', value: 'Prime Media' },
      { label: 'Account Number', value: '1036047166312' },
    ],
  },
  {
    id: 'mobile-airtel',
    type: 'mobile',
    name: 'Airtel Money',
    enabled: true,
    displayOrder: 3,
    details: [
      { label: 'Number', value: '0992 528 222' },
      { label: 'Account Name', value: 'Prime Media' },
    ],
  },
  {
    id: 'mobile-tnm',
    type: 'mobile',
    name: 'TNM Mpamba',
    enabled: true,
    displayOrder: 4,
    details: [
      { label: 'Number', value: '0992 528 222' },
      { label: 'Account Name', value: 'Prime Media' },
    ],
  },
  {
    id: 'cash',
    type: 'cash',
    name: 'Cash',
    enabled: true,
    displayOrder: 5,
    details: [],
    instructions: 'Pay at Prime Printing Services office. Request a receipt upon payment.',
  },
];

const typeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  bank: {
    icon: <Building2 size={18} />,
    color: '#2563eb',
    bg: '#eff6ff',
    label: 'Bank Transfer',
  },
  mobile: {
    icon: <Smartphone size={18} />,
    color: '#059669',
    bg: '#ecfdf5',
    label: 'Mobile Money',
  },
  cash: {
    icon: <Banknote size={18} />,
    color: '#d99a3f',
    bg: '#fffbeb',
    label: 'Cash',
  },
};

const CustomerPaymentOptions: React.FC = () => {
  const enabledMethods = paymentMethods.filter((m) => m.enabled).sort((a, b) => a.displayOrder - b.displayOrder);

  const grouped = enabledMethods.reduce<Record<string, PaymentMethod[]>>((acc, method) => {
    const key = method.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(method);
    return acc;
  }, {});

  return (
    <div style={{ fontFamily: F, fontSize: 13.5, lineHeight: 1.45, color: '#1E293B' }}>
      <div style={{ padding: '0 28px 28px' }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
            Use the details below to make payments. After transferring, please send proof of payment via WhatsApp or email so we can allocate it to your account.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(grouped).map(([type, methods]) => {
            const config = typeConfig[type];
            return (
              <div key={type}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: config.bg, color: config.color,
                  }}>
                    {config.icon}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.06 }}>
                    {config.label}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {methods.map((method) => (
                    <PortalCard key={method.id} style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: method.details.length > 0 ? 10 : 0 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: `linear-gradient(135deg, ${config.color}15, ${config.color}08)`,
                            color: config.color,
                            border: `1px solid ${config.color}20`,
                          }}>
                            {config.icon}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0b3e39' }}>{method.name}</div>
                          </div>
                        </div>

                        {method.details.length > 0 && (
                          <div style={{
                            background: '#f8fafc',
                            borderRadius: 8,
                            border: '1px solid rgba(16,24,40,0.06)',
                            overflow: 'hidden',
                          }}>
                            {method.details.map((detail, i) => (
                              <div key={i} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '9px 14px',
                                borderBottom: i < method.details.length - 1 ? '1px solid rgba(16,24,40,0.06)' : 'none',
                              }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.04 }}>
                                  {detail.label}
                                </span>
                                <span style={{
                                  fontSize: 13, fontWeight: 700, color: '#0b3e39',
                                  fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                  {detail.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {method.instructions && (
                          <div style={{
                            marginTop: method.details.length > 0 ? 8 : 0,
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            fontSize: 12,
                            color: '#92400e',
                            lineHeight: 1.5,
                          }}>
                            {method.instructions}
                          </div>
                        )}
                      </div>
                    </PortalCard>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 24,
          padding: '14px 18px',
          borderRadius: 12,
          background: '#eef7f6',
          border: '1px solid #d3ece9',
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#0f544c', margin: 0, lineHeight: 1.5 }}>
            After making a payment, please send the proof (screenshot or receipt) via WhatsApp or email to ensure timely allocation to your account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CustomerPaymentOptions;
