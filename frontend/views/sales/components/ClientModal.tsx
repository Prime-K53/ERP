import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, MapPin, CreditCard, FileText, Building, Plus, Trash2, AlertTriangle, Search, User, ChevronRight, KeyRound, Copy, Check } from 'lucide-react';
import { Customer } from '../../../types';
import { getDefaultPaymentTermsForSegment } from '../../../utils/helpers';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useSales } from '../../../context/SalesContext';
import { getPlaceholder } from '../../../constants/placeholders';
import { currencyService } from '../../../services/currencyService';
import type { PortalCredentials } from '../../../services/adminPortalClient';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (customer: Customer) => Promise<PortalCredentials | null>;
  customer?: Customer;
  initialSegment?: string;
}

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const tabs = [
  { id: 'Address' as const, label: 'Address Info', icon: MapPin },
  { id: 'Payment' as const, label: 'Payment & Billing', icon: CreditCard },
  { id: 'Additional' as const, label: 'Additional Info', icon: FileText },
  { id: 'Branches' as const, label: 'Branches', icon: Building },
];

export const ClientModal: React.FC<ClientModalProps> = ({ isOpen, onClose, onSave, customer, initialSegment }) => {
  const [formData, setFormData] = useState({
    name: '', phone: '', address: '', city: '', billingAddress: '', shippingAddress: '',
    balance: 0, walletBalance: 0, creditLimit: 0, notes: '', subAccounts: [] as any[],
    segment: initialSegment || 'Individual',
    paymentTerms: getDefaultPaymentTermsForSegment(initialSegment || 'Individual'),
    assignedSalesperson: '', creditHold: false, tags: [] as string[], avgPaymentDays: 0,
    leadSource: '', pipelineStage: 'New', leadScore: 0, nextFollowUpDate: '', estimatedDealValue: 0,
    referredById: '', referredByName: ''
  });

  const [useBillingForShipping, setUseBillingForShipping] = useState(true);
  const [activeTab, setActiveTab] = useState<typeof tabs[number]['id']>('Address');
  const [referrerSearchOpen, setReferrerSearchOpen] = useState(false);
  const [referrerQuery, setReferrerQuery] = useState('');
  const [referrerDropdownOpen, setReferrerDropdownOpen] = useState(false);
  const [referrerHoveredIdx, setReferrerHoveredIdx] = useState(-1);
  const referrerRef = useRef<HTMLDivElement>(null);
  const [portalCredentials, setPortalCredentials] = useState<PortalCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<'email' | 'password' | null>(null);

  const copyCredential = async (field: 'email' | 'password') => {
    if (!portalCredentials) return;
    try {
      await navigator.clipboard.writeText(portalCredentials[field]);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const { invoices } = useFinance();
  const { companyConfig } = useAuth();
  const { customers } = useSales();

  useEffect(() => {
    if (customer) {
      setFormData({
        ...customer,
        name: customer.name || '', phone: customer.phone || '', address: customer.address || '',
        city: customer.city || '', billingAddress: customer.billingAddress || '',
        shippingAddress: customer.shippingAddress || '', balance: customer.balance ?? 0,
        walletBalance: customer.walletBalance ?? 0, creditLimit: customer.creditLimit ?? 0,
        notes: customer.notes || '', subAccounts: customer.subAccounts || [],
        segment: (customer.segment as string) || 'Individual',
        paymentTerms: customer.paymentTerms || getDefaultPaymentTermsForSegment(customer.segment || 'Individual'),
        assignedSalesperson: customer.assignedSalesperson || '', creditHold: Boolean(customer.creditHold),
        tags: customer.tags || [], avgPaymentDays: customer.avgPaymentDays ?? 0,
        leadSource: (customer as any).leadSource || '', pipelineStage: (customer as any).pipelineStage || 'New',
        leadScore: (customer as any).leadScore ?? 0, nextFollowUpDate: (customer as any).nextFollowUpDate || '',
        estimatedDealValue: (customer as any).estimatedDealValue ?? 0,
        referredById: (customer as any).referredById || '', referredByName: (customer as any).referredByName || '',
      });
      setUseBillingForShipping(customer.billingAddress === customer.shippingAddress);
    } else {
      setFormData({
        name: '', phone: '', address: '', city: '', billingAddress: '', shippingAddress: '',
        balance: 0, walletBalance: 0, creditLimit: 0, notes: '', subAccounts: [],
        paymentTerms: getDefaultPaymentTermsForSegment('Individual'), segment: 'Individual',
        assignedSalesperson: '', creditHold: false, tags: [], avgPaymentDays: 0,
        leadSource: '', pipelineStage: 'New', leadScore: 0, nextFollowUpDate: '', estimatedDealValue: 0,
        referredById: '', referredByName: ''
      });
      setUseBillingForShipping(true);
    }
  }, [customer, isOpen]);

  useEffect(() => {
    if (useBillingForShipping) {
      setFormData(prev => ({ ...prev, shippingAddress: prev.billingAddress }));
    }
  }, [useBillingForShipping, formData.billingAddress]);

  // Close referrer dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (referrerRef.current && !referrerRef.current.contains(e.target as Node)) {
        setReferrerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calcOutstanding = (custId: string | undefined) => {
    if (!custId) return 0;
    const invs = (invoices || []).filter((inv: any) =>
      (inv.customerId === custId || inv.customerName === formData.name) &&
      inv.status !== 'Paid' && inv.status !== 'Cancelled'
    );
    return invs.reduce((sum: number, inv: any) => sum + ((inv.totalAmount || 0) - (inv.paidAmount || 0)), 0);
  };

  const outstandingBalance = calcOutstanding((customer as any)?.id || (formData as any).id);
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const getFilteredReferrers = useMemo(() => {
    if (!referrerQuery.trim()) return customers || [];
    const q = referrerQuery.trim().toLowerCase();
    return (customers || []).filter((c: any) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [customers, referrerQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    // Auto-prefix +265 to phone number if not already present
    if (dataToSave.phone && !dataToSave.phone.startsWith('+265')) {
      dataToSave.phone = '+265' + dataToSave.phone.replace(/^\+?/, '');
    }
    if (useBillingForShipping) dataToSave.shippingAddress = dataToSave.billingAddress;
    if (!dataToSave.paymentTerms) {
      dataToSave.paymentTerms = getDefaultPaymentTermsForSegment(dataToSave.segment || 'Individual');
    }
    const credentials = await onSave(dataToSave as Customer);
    onClose();
    if (credentials) {
      setPortalCredentials(credentials);
      setCopiedField(null);
    }
  };

  const handleAddSubAccount = () => {
    setFormData(prev => ({
      ...prev,
      subAccounts: [...(prev.subAccounts || []), {
        id: `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: '', balance: 0, walletBalance: 0, status: 'Active'
      }]
    }));
  };

  const handleRemoveSubAccount = (id: string) =>
    setFormData(prev => ({ ...prev, subAccounts: (prev.subAccounts || []).filter(s => s.id !== id) }));

  const handleSubAccountChange = (id: string, field: string, value: any) =>
    setFormData(prev => ({
      ...prev,
      subAccounts: (prev.subAccounts || []).map(s => s.id === id ? { ...s, [field]: value } : s)
    }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (name === 'segment') {
      const newSegment = value as 'Individual' | 'School Account' | 'Institution' | 'Government';
      setFormData(prev => ({ ...prev, [name]: newSegment, paymentTerms: getDefaultPaymentTermsForSegment(newSegment) }));
    } else {
      // Strip +265 from phone if user pastes it, to avoid duplication
      const cleanedValue = name === 'phone' ? value.replace(/^\+265/, '') : value;
      setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(cleanedValue) : cleanedValue }));
    }
  };

  if (!isOpen) return null;

  const stepNumber = tabs.findIndex(t => t.id === activeTab) + 1;
  const totalSteps = tabs.length;

  return (
    <div className="client-modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)',
      padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div className="client-modal-content" style={{
        width: 920, maxWidth: '100%', maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }}>
        {/* Accent stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${hairline}`,
          background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <User size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                {customer ? `Edit Customer: ${customer.name}` : 'Add New Customer'}
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                New client record &mdash; Clients ledger #0148
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${hairline}`, background: paper, color: inkSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
          }}
            onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; }}
            onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* Sidebar Nav */}
          <div style={{
            width: 212, flexShrink: 0,
            background: `linear-gradient(180deg, ${teal[800]}, ${teal[900]})`,
            padding: '18px 12px', position: 'relative'
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 10,
              backgroundImage: 'radial-gradient(circle, rgba(254,253,251,.9) 2.2px, transparent 2.3px)',
              backgroundSize: '10px 16px', backgroundPosition: '4px 8px', opacity: 0.12
            }} />
            <div style={{
              color: 'rgba(255,255,255,.4)', fontSize: 10, letterSpacing: 0.16,
              textTransform: 'uppercase', fontWeight: 600, padding: '4px 12px 10px'
            }}>
              Customer Setup
            </div>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  color: isActive ? '#fff' : 'rgba(255,255,255,.62)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 2,
                  transition: 'all .15s ease', position: 'relative',
                  width: '100%', border: 'none', background: 'transparent', textAlign: 'left',
                  ...(isActive ? {
                    background: `linear-gradient(90deg, rgba(217,154,63,.18), rgba(217,154,63,.05))`,
                    boxShadow: `inset 3px 0 0 ${amber[500]}`
                  } : {})
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,.62)'; } }}
                >
                  <Icon size={16} style={{ flexShrink: 0, opacity: 0.85 }} />
                  {tab.label}
                  <span style={{
                    marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%',
                    background: isActive ? amber[500] : 'rgba(255,255,255,.12)',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? teal[900] : 'rgba(255,255,255,.55)',
                    fontWeight: isActive ? 600 : 400
                  }}>
                    {tabs.indexOf(tab) + 1}
                  </span>
                </button>
              );
            })}
            <div style={{
              position: 'absolute', bottom: 18, left: 12, right: 22,
              padding: 12, borderRadius: 8,
              background: 'rgba(255,255,255,.045)',
              border: '1px dashed rgba(255,255,255,.14)'
            }}>
              <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5 }}>
                Fields marked <b style={{ color: amber[300], fontWeight: 600 }}>*</b> are required before this record can be saved to the ledger.
              </p>
            </div>
          </div>

          {/* Form Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px 8px' }}>
            <form id="client-form" onSubmit={handleSubmit}>

              {/* Basic Info (always visible) */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>
                  Customer Name / Company <span style={{ color: danger, fontWeight: 700 }}>*</span>
                </label>
                <input
                  required type="text" name="name" value={formData.name} onChange={handleChange}
                  placeholder={getPlaceholder.company()}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>
                    Phone Number <span style={{ color: danger, fontWeight: 700 }}>*</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <span style={{
                      display: 'flex', alignItems: 'center', padding: '0 10px',
                      border: `1.4px solid ${hairline}`, borderRight: 'none',
                      borderRadius: '9px 0 0 9px', background: teal[50], color: teal[700],
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600
                    }}>+265</span>
                    <input
                      type="text" name="phone" value={formData.phone} onChange={handleChange}
                      placeholder="888 123 456"
                      style={{
                        ...inputStyle,
                        borderRadius: '0 9px 9px 0',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontVariantNumeric: 'tabular-nums', letterSpacing: 0.01
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Segment</label>
                  <select name="segment" value={formData.segment} onChange={handleChange} style={selectStyle}>
                    <option value="Individual">Individual</option>
                    <option value="School Account">School Account</option>
                    <option value="Institution">Institution</option>
                    <option value="Government">Government</option>
                  </select>
                </div>
              </div>

              {/* Address Tab */}
              {activeTab === 'Address' && (
                <>
                  <div style={sectionLabelStyle}><span>Location</span></div>

                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Billing Address</label>
                    <textarea
                      name="billingAddress" value={formData.billingAddress} onChange={handleChange}
                      rows={3} placeholder="123 Business Rd, Area 47"
                      style={textareaStyle}
                    />
                  </div>

                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Shipping Address</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: inkSoft, cursor: 'pointer', marginBottom: 0 }}>
                        <input
                          type="checkbox" checked={useBillingForShipping}
                          onChange={(e) => setUseBillingForShipping(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }}
                        />
                        Same as Billing
                      </label>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <textarea
                        name="shippingAddress" value={formData.shippingAddress} onChange={handleChange}
                        rows={3} disabled={useBillingForShipping}
                        placeholder={useBillingForShipping ? '' : 'Enter shipping address'}
                        style={{
                          ...textareaStyle,
                          ...(useBillingForShipping ? { background: teal[50], color: inkSoft, cursor: 'not-allowed' } : {})
                        }}
                      />
                      {useBillingForShipping && (
                        <div style={{
                          position: 'absolute', top: 8, right: 10, fontSize: 9.5, color: '#b7afa4', fontStyle: 'italic'
                        }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}>
                            <path d="M4 12h16M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Inherited from Billing Address
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle}>City / Region</label>
                      <input type="text" name="city" value={formData.city} onChange={handleChange}
                        placeholder={getPlaceholder.city()} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Postal / Box No.
                        <span style={{
                          fontSize: 9.5, fontWeight: 600, color: inkSoft,
                          background: teal[50], padding: '1px 6px', borderRadius: 20,
                          letterSpacing: 0.03, textTransform: 'uppercase', marginLeft: 6
                        }}>Optional</span>
                      </label>
                      <input type="text" placeholder="P.O. Box 1420" style={inputStyle} />
                    </div>
                  </div>
                </>
              )}

              {/* Payment Tab */}
              {activeTab === 'Payment' && (
                <>
                  <div style={sectionLabelStyle}><span>Payment &amp; Billing</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle}>Opening Balance</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, fontWeight: 700, fontSize: 13 }}>{currency}</span>
                        <input type="number" name="balance" value={formData.balance} onChange={handleChange}
                          placeholder="0.00" style={{ ...inputStyle, paddingLeft: 28 }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Wallet Balance</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: teal[500], fontWeight: 700, fontSize: 13 }}>{currency}</span>
                        <input type="number" name="walletBalance" value={formData.walletBalance} onChange={handleChange}
                          placeholder="0.00"
                          style={{ ...inputStyle, paddingLeft: 28, background: 'rgba(31,133,119,.04)', borderColor: teal[200], color: teal[700] }} />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Payment Terms</label>
                      <select name="paymentTerms" value={formData.paymentTerms} onChange={handleChange} style={selectStyle}>
                        <option value="Net 7">Net 7 Days</option>
                        <option value="Net 30">Net 30 Days</option>
                        <option value="Net 365">Net 365 Days</option>
                        <option value="Due on Receipt">Due on Receipt</option>
                        <option value="Net 15">Net 15 Days</option>
                        <option value="Net 60">Net 60 Days</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Credit Limit</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, fontWeight: 700, fontSize: 13 }}>{currency}</span>
                        <input type="number" name="creditLimit" value={formData.creditLimit} onChange={handleChange}
                          placeholder="0.00" style={{ ...inputStyle, paddingLeft: 28 }} />
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: 16, background: teal[50], borderRadius: 9, border: `1px solid ${teal[100]}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        padding: 8, borderRadius: 8,
                        background: formData.creditHold ? `${danger}15` : teal[100],
                        color: formData.creditHold ? danger : teal[600]
                      }}>
                        <AlertTriangle size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: teal[800] }}>Credit Hold</div>
                        <div style={{ fontSize: 10, color: inkSoft, fontWeight: 500 }}>Temporarily suspend all credit transactions</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginBottom: 0 }}>
                        <input type="checkbox" name="creditHold" checked={formData.creditHold} onChange={handleChange}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                        <div style={{
                          width: 40, height: 20, background: formData.creditHold ? danger : teal[200],
                          borderRadius: 10, position: 'relative', transition: 'background .2s'
                        }}>
                          <div style={{
                            content: '', position: 'absolute', top: 2, left: formData.creditHold ? 22 : 2,
                            width: 16, height: 16, background: '#fff', borderRadius: '50%',
                            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)'
                          }} />
                        </div>
                      </label>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 0.1 }}>Outstanding</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: teal[800] }}>
                          {currency}{outstandingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Additional Info Tab */}
              {activeTab === 'Additional' && (
                <>
                  <div style={sectionLabelStyle}><span>Additional Information</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                    <div>
                      <label style={labelStyle}>Lead Source</label>
                      <select name="leadSource" value={formData.leadSource || ''} onChange={handleChange} style={selectStyle}>
                        <option value="">Not Set</option>
                        <option value="Website">Website</option>
                        <option value="Walk-in">Walk-in</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Field Sales">Field Sales</option>
                        <option value="Email Campaign">Email Campaign</option>
                      </select>
                    </div>
                    <div ref={referrerRef} style={{ position: 'relative' }}>
                      <label style={labelStyle}>Referred By</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={referrerDropdownOpen ? referrerQuery : (formData.referredByName || formData.referredById || '')}
                          onChange={(e) => {
                            setReferrerQuery(e.target.value);
                            setReferrerDropdownOpen(true);
                            setReferrerHoveredIdx(-1);
                          }}
                          onFocus={() => {
                            if (!formData.referredById) {
                              setReferrerQuery('');
                              setReferrerDropdownOpen(true);
                            }
                          }}
                            onKeyDown={(e) => {
                            if (!referrerDropdownOpen) return;
                            const filtered = getFilteredReferrers;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setReferrerHoveredIdx(prev => Math.min(prev + 1, filtered.length - 1));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setReferrerHoveredIdx(prev => Math.max(prev - 1, 0));
                            } else if (e.key === 'Enter' && referrerHoveredIdx >= 0 && filtered[referrerHoveredIdx]) {
                              e.preventDefault();
                              const c = filtered[referrerHoveredIdx];
                              setFormData(prev => ({ ...prev, referredById: c.id, referredByName: c.name }));
                              setReferrerDropdownOpen(false);
                              setReferrerQuery('');
                            } else if (e.key === 'Escape') {
                              setReferrerDropdownOpen(false);
                            }
                          }}
                          placeholder="Type to search referrer..."
                          style={{ ...inputStyle, flex: 1 }} />
                        {formData.referredById && (
                          <button type="button" onClick={() => { setFormData(prev => ({ ...prev, referredById: '', referredByName: '' })); setReferrerDropdownOpen(true); setReferrerQuery(''); }}
                            style={{ ...btnGhostStyle, padding: '0 12px', color: danger }}>
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      {referrerDropdownOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
                          borderRadius: 10, boxShadow: '0 16px 36px -12px rgba(0,0,0,.28)',
                          background: paper, border: `1.4px solid ${hairline}`,
                          maxHeight: 220, overflowY: 'auto'
                        }}>
                          {getFilteredReferrers.length === 0 ? (
                            <div style={{ padding: '16px 14px', fontSize: 12.5, color: inkSoft, textAlign: 'center' }}>
                              No matching customers found
                            </div>
                          ) : (
                            getFilteredReferrers.map((c: any, idx: number) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, referredById: c.id, referredByName: c.name }));
                                  setReferrerDropdownOpen(false);
                                  setReferrerQuery('');
                                }}
                                onMouseEnter={() => setReferrerHoveredIdx(idx)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  width: '100%', textAlign: 'left', padding: '10px 14px',
                                  border: 'none', background: referrerHoveredIdx === idx ? teal[50] : 'transparent',
                                  cursor: 'pointer', fontSize: 13, color: ink,
                                  borderBottom: idx < getFilteredReferrers.length - 1 ? `1px solid ${hairline}` : 'none',
                                  transition: 'background .1s'
                                }}
                              >
                                <div style={{
                                  width: 28, height: 28, borderRadius: 6,
                                  background: referrerHoveredIdx === idx ? teal[500] : teal[100],
                                  color: referrerHoveredIdx === idx ? '#fff' : teal[700],
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 12, fontWeight: 700, flexShrink: 0
                                }}>
                                  {(c.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                                  {c.phone && <div style={{ fontSize: 11, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{c.phone}</div>}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={labelStyle}>Pipeline Stage</label>
                      <select name="pipelineStage" value={formData.pipelineStage || 'New'} onChange={handleChange} style={selectStyle}>
                        <option value="New">New</option>
                        <option value="Qualified">Qualified</option>
                        <option value="Proposal">Proposal</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Lead Score</label>
                      <input type="number" min={0} max={100} name="leadScore" value={formData.leadScore ?? 0} onChange={handleChange}
                        placeholder="e.g. 85" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Next Follow-Up</label>
                      <input type="date" name="nextFollowUpDate" value={formData.nextFollowUpDate || ''} onChange={handleChange}
                        style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Estimated Deal Value</label>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, fontWeight: 700, fontSize: 13 }}>{currency}</span>
                        <input type="number" min={0} name="estimatedDealValue" value={formData.estimatedDealValue ?? 0} onChange={handleChange}
                          placeholder="0.00" style={{ ...inputStyle, paddingLeft: 28 }} />
                      </div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Tags</label>
                    <input type="text" value={(formData.tags || []).join(', ')}
                      onChange={(e) => setFormData(p => ({ ...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                      placeholder="e.g. VIP, Retail" style={inputStyle} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>Internal Notes</label>
                    <textarea name="notes" value={formData.notes} onChange={handleChange}
                      rows={4} placeholder="e.g. Prefers morning deliveries" style={textareaStyle} />
                  </div>
                </>
              )}

              {/* Branches Tab */}
              {activeTab === 'Branches' && (
                <>
                  <div style={sectionLabelStyle}><span>Branches</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: teal[800] }}>Branch Accounts</div>
                      <p style={{ margin: '2px 0 0', fontSize: 10, color: inkSoft, fontWeight: 500 }}>Manage multiple locations or sub-entities</p>
                    </div>
                    <button type="button" onClick={handleAddSubAccount}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', background: teal[500], color: '#fff',
                        borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)`
                      }}>
                      <Plus size={15} />
                      Add Branch
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {(formData.subAccounts || []).length === 0 ? (
                      <div style={{
                        textAlign: 'center', padding: 32,
                        border: `2px dashed ${teal[100]}`, borderRadius: 12, background: teal[50]
                      }}>
                        <Building size={32} style={{ margin: '0 auto 12', color: teal[200] }} />
                        <p style={{ fontSize: 13, fontWeight: 700, color: teal[300], margin: 0 }}>No branch accounts added yet</p>
                      </div>
                    ) : (
                      (formData.subAccounts || []).map((sub) => (
                        <div key={sub.id} style={{
                          padding: 16, background: paper, border: `1px solid ${hairline}`,
                          borderRadius: 12, position: 'relative', transition: 'all .15s'
                        }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = teal[200]}
                          onMouseLeave={e => e.currentTarget.style.borderColor = hairline}
                        >
                          <button type="button" onClick={() => handleRemoveSubAccount(sub.id)}
                            style={{
                              position: 'absolute', top: 12, right: 12,
                              padding: 6, background: 'transparent', border: 'none',
                              color: inkSoft, cursor: 'pointer', borderRadius: 6
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${danger}15`; e.currentTarget.style.color = danger; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = inkSoft; }}
                          >
                            <Trash2 size={14} />
                          </button>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{
                                fontSize: 10, fontWeight: 700, color: inkSoft,
                                textTransform: 'uppercase', letterSpacing: 0.08, marginBottom: 6, display: 'block'
                              }}>Branch Name</label>
                              <input type="text" value={sub.name}
                                onChange={(e) => handleSubAccountChange(sub.id, 'name', e.target.value)}
                                placeholder="e.g. Blantyre Branch"
                                style={{ ...inputStyle, background: teal[50], borderColor: teal[100] }} />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}

            </form>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: inkSoft }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: amber[500] }} />
            Step {stepNumber} of {totalSteps} &mdash; {tabs.find(t => t.id === activeTab)?.label}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
                display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = teal[800]; e.currentTarget.style.borderColor = teal[200]; }}
              onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
              Cancel
            </button>
            <button type="submit" form="client-form"
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                transition: 'all .15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}>
              {customer ? 'Update Customer' : 'Save Customer'}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {portalCredentials && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)', padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: paper, borderRadius: 14,
            border: `1px solid ${hairline}`,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35)',
            overflow: 'hidden', position: 'relative'
          }}>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)` }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 24px 14px' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <KeyRound size={16} color="#fff" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: teal[800] }}>Customer Portal Account Created</h3>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft }}>
                  Share these credentials with the customer. The password is shown only once.
                </p>
              </div>
            </div>
            <div style={{ padding: '6px 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: teal[50], border: `1px solid ${teal[100]}`, borderRadius: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: inkSoft }}>Portal Email</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>{portalCredentials.email}</div>
                </div>
                <button onClick={() => copyCredential('email')} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: `1px solid ${teal[200]}`, background: paper, color: teal[700], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {copiedField === 'email' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: amber[100], border: `1px solid ${amber[300]}`, borderRadius: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.08, textTransform: 'uppercase', color: '#8a5a1a' }}>Temporary Password</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis' }}>{portalCredentials.password}</div>
                </div>
                <button onClick={() => copyCredential('password')} style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, border: `1px solid ${amber[300]}`, background: paper, color: amber[600], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {copiedField === 'password' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: inkSoft, lineHeight: 1.5 }}>
                The customer signs in at <b>#/portal/login</b> with the Email &amp; Password method. You can regenerate the password anytime from the customer's card in the Clients module.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${hairline}`, background: paper }}>
              <button onClick={() => setPortalCredentials(null)}
                style={btnGhostStyle}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'none', minHeight: 66, lineHeight: 1.5
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};

const sectionLabelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  margin: '26px 0 14px'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

export default ClientModal;