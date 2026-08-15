import React, { useState, useMemo, useEffect, useRef } from 'react';
import { logger } from '@/services/logger';
import { 
  Search, AlertTriangle, Plus, Minus, X,
  ChevronRight, Info, CheckCircle2, ShoppingCart, FileText, RefreshCw 
} from 'lucide-react';
import { useSalesStore } from '../../../stores/salesStore';
import { useFinanceStore } from '../../../stores/financeStore';
import { useAuth } from '../../../context/AuthContext';
import { Sale, SalesExchange, SalesExchangeItem } from '../../../types';
import { format } from 'date-fns';

interface ExchangeRequestModalProps {
  onClose: () => void;
  initialInvoice?: any;
}

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const inputRest: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

export const ExchangeRequestModal: React.FC<ExchangeRequestModalProps> = ({ onClose, initialInvoice }) => {
  const { createSalesExchange, customers } = useSalesStore();
  const { invoices } = useFinanceStore();
  const { user } = useAuth();
  
  const [step, setStep] = useState<1 | 2>(initialInvoice ? 2 : 1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(initialInvoice || null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [returnItems, setReturnItems] = useState<any[]>(
    initialInvoice?.items?.map((item: any) => ({
      ...item,
      qty_to_return: 0,
      qty_to_replace: 0,
      condition: 'damaged'
    })) || []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredResults = useMemo(() => {
    if (!searchTerm) return { invoices: [], customers: [] };
    const searchLower = searchTerm.toLowerCase();
    const matchedCustomers = customers.filter(c => 
      (c.name || '').toLowerCase().includes(searchLower) ||
      (c.email || '').toLowerCase().includes(searchLower) ||
      (c.phone || '').toLowerCase().includes(searchLower)
    ).slice(0, 3);
    const matchedInvoices = invoices.filter(inv => {
      const matchesSearch = (inv.id || '').toLowerCase().includes(searchLower) ||
        (inv.customerName || '').toLowerCase().includes(searchLower);
      const matchesCustomer = selectedCustomer ? inv.customerId === selectedCustomer.id : true;
      return matchesSearch && matchesCustomer;
    }).slice(0, 5);
    return { invoices: matchedInvoices, customers: matchedCustomers };
  }, [invoices, customers, searchTerm, selectedCustomer]);

  const handleSelectInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    setShowDropdown(false);
    const items = inv.items?.map((item: any) => ({
      ...item,
      qty_to_return: 0,
      qty_to_replace: 0,
      condition: 'damaged'
    })) || [];
    setReturnItems(items);
    setStep(2);
  };

  const handleSelectCustomer = (customer: any) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.name);
    setShowDropdown(false);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...returnItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setReturnItems(newItems);
  };

  const handleSubmit = async () => {
    if (!reason || returnItems.filter(i => i.qty_to_return > 0).length === 0) {
      alert('Please provide a reason and at least one item to return');
      return;
    }
    setIsSubmitting(true);
    try {
      const exchangeData = {
        invoice_id: selectedInvoice.id,
        customer_id: selectedInvoice.customerId || '',
        customer_name: selectedInvoice.customerName,
        reason,
        remarks,
        created_by: user?.id || user?.username || 'system',
        items: returnItems
          .filter(i => i.qty_to_return > 0)
          .map((i, idx) => {
            const unitPrice = i.rate || i.price || 0;
            const priceDiff = (i.qty_to_replace - i.qty_to_return) * unitPrice;
            return {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${idx}`,
              product_id: i.id || i.productId,
              product_name: i.description || i.name,
              qty_returned: i.qty_to_return,
              qty_replaced: i.qty_to_replace,
              unit_price: unitPrice,
              price_difference: priceDiff,
              condition: i.condition,
              reprint_required: i.qty_to_replace > 0,
              replaced_product_id: i.replaced_product_id || (i.qty_to_replace > 0 ? i.id || i.productId : undefined),
              replaced_product_name: i.replaced_product_name || (i.qty_to_replace > 0 ? i.description || i.name : undefined)
            };
          }),
        total_price_difference: returnItems
          .filter(i => i.qty_to_return > 0)
          .reduce((acc, i) => acc + ((i.qty_to_replace - i.qty_to_return) * (i.rate || i.price || 0)), 0)
      };
      await createSalesExchange(exchangeData);
      onClose();
    } catch (error: any) {
      logger.error('Failed to create exchange', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to create exchange request: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sales-modal-backdrop" style={{
      fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div className="sales-modal-panel" style={{
        maxWidth: 920,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: `1px solid ${hairline}`, background: paper
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 10px -3px rgba(15,84,76,.6)`, flexShrink: 0
            }}>
              <ShoppingCart size={19} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
              }}>
                New Sales Exchange Request
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                Step {step} of 2: {step === 1 ? 'Select Invoice' : 'Exchange Details'}
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

        <div style={{ padding: '24px 28px 8px', overflowY: 'auto', flex: 1 }}>
          {step === 1 ? (
            <div>
              <div className="relative" ref={dropdownRef}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by Invoice ID or Customer Name..."
                  className="w-full pl-12 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  autoFocus
                />
                {searchTerm && (
                  <button 
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCustomer(null);
                      setShowDropdown(false);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}

                {showDropdown && (filteredResults.invoices.length > 0 || filteredResults.customers.length > 0) && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 z-[110] max-h-[400px] overflow-y-auto">
                    {filteredResults.customers.length > 0 && (
                      <div className="p-2 border-b border-gray-50">
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customers</div>
                        {filteredResults.customers.map(customer => (
                          <div 
                            key={customer.id}
                            onClick={() => handleSelectCustomer(customer)}
                            className="flex items-center space-x-3 p-3 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                              {customer.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold text-gray-900 truncate">{customer.name}</div>
                              <div className="text-[11px] text-gray-500 truncate">{customer.email || customer.phone || 'No contact info'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredResults.invoices.length > 0 && (
                      <div className="p-2">
                        <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Invoices</div>
                        {filteredResults.invoices.map(inv => (
                          <div 
                            key={inv.id}
                            onClick={() => handleSelectInvoice(inv)}
                            className="flex items-center justify-between p-3 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-900">Invoice #{inv.id}</div>
                                <div className="text-[11px] text-gray-500">{inv.customerName}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">${inv.totalAmount?.toLocaleString()}</div>
                              <div className="text-[10px] text-gray-400">{format(new Date(inv.date), 'MMM dd, yyyy')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedCustomer && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl mt-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Filtering by Customer</div>
                      <div className="font-bold text-indigo-900">{selectedCustomer.name}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedCustomer(null);
                      setSearchTerm('');
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline"
                  >
                    Clear Filter
                  </button>
                </div>
              )}

              {!showDropdown && filteredResults.invoices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {filteredResults.invoices.map((inv) => (
                    <div 
                      key={inv.id}
                      onClick={() => handleSelectInvoice(inv)}
                      className="group flex flex-col p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">Invoice #{inv.id}</div>
                            <div className="text-xs text-gray-500">{format(new Date(inv.date), 'MMM dd, yyyy')}</div>
                          </div>
                        </div>
                        <div className={`text-xs font-medium px-2 py-1 rounded-full ${
                          inv.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {inv.status}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50">
                        <div>
                          <div className="text-xs text-gray-400">Customer</div>
                          <div className="text-sm font-semibold text-gray-700 truncate max-w-[150px]">{inv.customerName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-400">Amount</div>
                          <div className="text-lg font-black text-indigo-600">${inv.totalAmount?.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !searchTerm ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl mt-4">
                  <ShoppingCart className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">Enter an invoice number or customer name to start</p>
                </div>
              ) : !showDropdown && filteredResults.invoices.length === 0 && (
                <div className="text-center py-12 mt-4">
                  <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No invoices found matching "{searchTerm}"</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Selected Invoice Summary */}
              <div style={{
                padding: 16, background: teal[50], borderRadius: 12, border: `1px solid ${teal[100]}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ padding: 8, borderRadius: 8, background: paper }}>
                    <FileText size={20} color={teal[600]} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: teal[600], fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.06 }}>Original Invoice</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: teal[800] }}>#{selectedInvoice.id} - {selectedInvoice.customerName}</div>
                  </div>
                </div>
                <button onClick={() => setStep(1)}
                  style={{
                    fontSize: 12, color: teal[600], fontWeight: 600, background: 'none', border: 'none',
                    textDecoration: 'underline', cursor: 'pointer'
                  }}>
                  Change Invoice
                </button>
              </div>

              <div style={{ display: 'grid', gap: 20, marginBottom: 20 }} className="grid-cols-1 md:grid-cols-2">
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal[800], marginBottom: 6, letterSpacing: 0.01 }}>
                      Reason for Exchange <span style={{ color: danger, fontWeight: 700 }}>*</span>
                    </label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)}
                      style={{
                        ...inputRest, appearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer'
                      }}>
                      <option value="">Select a reason...</option>
                      <option value="Color mismatch">Color mismatch</option>
                      <option value="Poor print quality">Poor print quality</option>
                      <option value="Incorrect size">Incorrect size</option>
                      <option value="Damaged before delivery">Damaged before delivery</option>
                      <option value="Wrong content printed">Wrong content printed</option>
                      <option value="Customer change request">Customer change request</option>
                      <option value="Other">Other (specify in remarks)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: teal[800], marginBottom: 6, letterSpacing: 0.01 }}>
                      Additional Remarks
                    </label>
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)}
                      placeholder="Provide more details about the exchange..."
                      style={{ ...inputRest, resize: 'none', minHeight: 80, lineHeight: 1.5 }} />
                  </div>
                </div>

                <div style={{ padding: 16, borderRadius: 12, background: `${amber[100]}80`, border: `1px solid ${amber[300]}` }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <AlertTriangle size={20} color={amber[600]} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#92400e' }}>Exchange Policy Note</h4>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
                        Exchanges require supervisor approval. Returned items should be verified for quantity and condition. 
                        Reprints will be auto-queued once approved.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div style={{ borderRadius: 12, border: `1px solid ${hairline}`, overflow: 'hidden', background: paper }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: hairline, borderBottom: `1px solid ${hairline}` }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Product Item</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: inkSoft }}>Original Qty</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: inkSoft }}>Qty to Return</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: inkSoft }}>Qty to Replace</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: inkSoft }}>Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, idx) => (
                      <tr key={idx} style={{ background: item.qty_to_return > 0 ? `${teal[50]}80` : 'transparent', borderBottom: `1px solid ${hairline}` }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 500, color: ink }}>{item.description || item.name}</div>
                          <div style={{ fontSize: 11, color: inkSoft }}>Unit Price: ${item.rate?.toLocaleString()}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 500 }}>{item.quantity}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <button onClick={() => updateItem(idx, 'qty_to_return', Math.max(0, item.qty_to_return - 1))}
                              style={{ padding: 4, borderRadius: 4, border: `1px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                              <Minus size={14} />
                            </button>
                            <input type="number" value={item.qty_to_return}
                              onChange={(e) => updateItem(idx, 'qty_to_return', Math.min(item.quantity, parseInt(e.target.value) || 0))}
                              style={{
                                width: 56, textAlign: 'center', padding: '4px 6px', fontSize: 13,
                                border: `1.4px solid ${hairline}`, borderRadius: 6, outline: 'none',
                                fontFamily: "'JetBrains Mono', monospace"
                              }} />
                            <button onClick={() => updateItem(idx, 'qty_to_return', Math.min(item.quantity, item.qty_to_return + 1))}
                              style={{ padding: 4, borderRadius: 4, border: `1px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28 }}>
                              <Plus size={14} />
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <input type="number" value={item.qty_to_replace}
                            onChange={(e) => updateItem(idx, 'qty_to_replace', parseInt(e.target.value) || 0)}
                            style={{
                              width: 56, textAlign: 'center', padding: '4px 6px', fontSize: 13,
                              border: `1.4px solid ${hairline}`, borderRadius: 6, outline: 'none',
                              fontFamily: "'JetBrains Mono', monospace", display: 'block', margin: '0 auto'
                            }} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <select value={item.condition} onChange={(e) => updateItem(idx, 'condition', e.target.value)}
                            style={{
                              ...inputRest, appearance: 'none',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28, cursor: 'pointer', fontSize: 12
                            }}>
                            <option value="damaged">Damaged</option>
                            <option value="wrong_color">Wrong Color</option>
                            <option value="wrong_size">Wrong Size</option>
                            <option value="wrong_content">Wrong Content</option>
                            <option value="customer_request">Customer Req</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 10, padding: '16px 28px',
          borderTop: `1px solid ${hairline}`, background: paper
        }}>
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
          {step === 2 && (
            <button type="button" onClick={handleSubmit}
              disabled={isSubmitting || !reason || returnItems.filter(i => i.qty_to_return > 0).length === 0}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                transition: 'all .15s ease', opacity: (isSubmitting || !reason || returnItems.filter(i => i.qty_to_return > 0).length === 0) ? 0.6 : 1
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
              {isSubmitting ? (
                <><RefreshCw size={14} className="animate-spin" /> Creating...</>
              ) : (
                <><CheckCircle2 size={14} /> Submit Exchange Request <ChevronRight size={14} /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
