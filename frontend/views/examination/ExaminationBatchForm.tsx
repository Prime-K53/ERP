import React, { useState, useEffect, useMemo, useRef } from 'react';
import { logger } from '@/services/logger';
import { useNavigate } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';
import { ArrowLeft, Save, Plus, Search, Building2, ChevronDown, X, Users, ChevronRight } from 'lucide-react';
import { useSales } from '../../context/SalesContext';
import { Customer } from '../../types';
import { dbService } from '../../services/db';
import { toast } from '../../components/Toast';
import { getPlaceholder } from '../../constants/placeholders';
import { format, addDays } from 'date-fns';

const teal: Record<string, string> = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber: Record<string, string> = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

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
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer'
};
const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const ExaminationBatchForm: React.FC = () => {
  const navigate = useNavigate();
  const { createBatch, loadAllData, customers, loading: contextLoading } = useExamination();
  const { companyConfig = { currencySymbol: '$', pricingSettings: { defaultMethod: 'ALWAYS_UP_50', customStep: 50 } } as { currencySymbol: string; pricingSettings: { defaultMethod: string; customStep: number } }, addAuditLog } = useAuth();
  const { accounts = [] } = useFinance() as { accounts: Array<Record<string, unknown>> };
  const [loading, setLoading] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultValidUntil = format(addDays(new Date(), 30), 'yyyy-MM-dd');
  const [formData, setFormData] = useState({
    school_id: '',
    academic_year: new Date().getFullYear().toString(),
    term: '1',
    exam_type: 'Mid-Term',
    batch_date: today,
    valid_until: defaultValidUntil,
    sales_account_id: '',
    sub_account_name: ''
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: ''
  });
  const [addingCustomer, setAddingCustomer] = useState(false);
  useEffect(() => {
    if (companyConfig?.currencySymbol) {
      setFormData((prev) => ({ ...prev, currency: companyConfig.currencySymbol }));
    }
  }, [companyConfig?.currencySymbol]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const sortedCustomers = React.useMemo(() => {
    if (!customers || customers.length === 0) {
      return [];
    }
    return [...customers].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }, [customers]);

  const selectedCustomerFull = React.useMemo(() => {
    if (!formData.school_id) return null;
    return customers.find((customer) => String(customer.id) === String(formData.school_id));
  }, [customers, formData.school_id]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return sortedCustomers;
    const q = customerSearch.toLowerCase();
    return sortedCustomers.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
    );
  }, [sortedCustomers, customerSearch]);

  const handleAddNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;

    setAddingCustomer(true);
    try {
      const customerId = `CUS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const customer: Customer = {
        id: customerId,
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim() || '',
        phone: newCustomer.phone.trim() || '',
        address: newCustomer.address.trim() || '',
        city: newCustomer.city.trim() || '',
        balance: 0,
        walletBalance: 0,
        creditLimit: 0,
        status: 'Active',
        category: 'School',
        segment: 'School Account',
        paymentTerms: 'Net 365'
      };

      await dbService.put('customers', customer);

      if (addAuditLog) {
        addAuditLog({
          action: 'CREATE',
          entityType: 'Customer',
          entityId: customerId,
          details: `Created new customer: ${customer.name}`,
          newValue: customer
        });
      }

      await loadAllData();
      setFormData((prev) => ({ ...prev, school_id: customer.id, sub_account_name: '' }));
      setNewCustomer({ name: '', email: '', phone: '', address: '', city: '' });
      setShowAddCustomer(false);
    } catch (error) {
      logger.error('Failed to add customer:', error);
    } finally {
      setAddingCustomer(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    const schoolId = String(formData.school_id ?? '').trim();
    const academicYear = String(formData.academic_year ?? '').trim();

    if (!schoolId) {
      if (contextLoading && sortedCustomers.length === 0) {
        toast.info('Customers are still loading. Please wait a moment and try again.');
        return;
      }
      toast.error('Please select a school from the dropdown');
      return;
    }
    if (!academicYear) {
      toast.error('Please enter an academic year');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        school_id: schoolId,
        academic_year: academicYear,
        sub_account_name: formData.sub_account_name.trim(),
        rounding_method: companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50',
        rounding_value: Number(companyConfig?.pricingSettings?.customStep || 50)
      };

      const newBatch = await createBatch(payload);
      toast.success('Examination batch created successfully');
      const batchRef = String(newBatch.batch_number || newBatch.batchNumber || newBatch.id || '').trim();
      navigate(`/examination/batches/${newBatch.id}`, { state: { name: batchRef } });
    } catch (error: any) {
      logger.error('Failed to create batch:', error);
      const errorMessage = error?.message || 'Failed to create examination batch. Please try again.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      padding: '16px 24px', maxWidth: 1600, margin: '0 auto',
      width: '100%', fontFamily: "'Inter','DM Sans',sans-serif",
      fontWeight: 400, overflowY: 'auto', color: ink, fontSize: 13.5
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: teal[800], letterSpacing: 0.2, margin: 0 }}>
            Create Examination Batch
          </h1>
          <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>Set school, term, exam type, and billing profile</p>
        </div>
        <button type="button" onClick={() => navigate('/examination/batches')}
          style={btnGhostStyle}>
          <ArrowLeft size={16} />
          Back to Batches
        </button>
      </div>

      <div style={{
        background: paper, borderRadius: 12,
        border: `1.4px solid ${hairline}`, padding: '20px 24px'
      }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: ink, margin: 0 }}>Batch Details</h2>
          <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>Create a new examination batch and assign it to a school account.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>School / Client</label>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06 }}>School / Client</span>
                <button type="button" onClick={() => setShowAddCustomer(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: teal[500], background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Plus size={12} />
                  Add New
                </button>
              </div>
              <div style={{ position: 'relative' }} ref={customerRef}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', borderRadius: 9, border: `1.4px solid ${showCustomerDropdown ? teal[200] : hairline}`,
                  background: paper, padding: '7px 12px', cursor: 'text',
                  transition: 'border-color .15s ease'
                }}
                  onClick={() => { customerInputRef.current?.focus(); setShowCustomerDropdown(true); }}>
                  <Search size={14} color={inkSoft} />
                  <input
                    ref={customerInputRef}
                    type="text"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder={
                      contextLoading && sortedCustomers.length === 0
                        ? 'Loading customers...'
                        : formData.school_id && !showCustomerDropdown
                          ? selectedCustomerFull?.name || 'Search customers...'
                          : 'Search customers...'
                    }
                    style={{
                      flex: 1, outline: 'none', background: 'transparent',
                      fontSize: 13, color: ink, border: 'none',
                      fontFamily: "'Inter', sans-serif"
                    }}
                  />
                  {formData.school_id && !showCustomerDropdown ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleChange('school_id', ''); setCustomerSearch(''); }}
                      style={{ color: inkSoft, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  ) : (
                    <ChevronDown size={14} color={inkSoft} />
                  )}
                </div>

                {showCustomerDropdown && (
                  <div style={{
                    position: 'absolute', zIndex: 50, marginTop: 4, width: '100%',
                    background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                    maxHeight: 240, overflowY: 'auto'
                  }}>
                    {filteredCustomers.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 13, color: inkSoft, textAlign: 'center' }}>
                        {customerSearch.trim() ? 'No customers found' : 'No customers available'}
                      </div>
                    ) : (
                      filteredCustomers.map((customer) => {
                        const isSelected = String(customer.id) === String(formData.school_id);
                        const hasSubAccounts = customer.subAccounts && customer.subAccounts.length > 0;
                        return (
                          <button key={customer.id} type="button"
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                              padding: '8px 12px', textAlign: 'left', border: 'none',
                              background: isSelected ? teal[50] : 'transparent',
                              color: isSelected ? teal[800] : ink,
                              cursor: 'pointer', transition: 'background .1s'
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = teal[50]; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            onClick={() => {
                              handleChange('school_id', customer.id);
                              handleChange('sub_account_name', '');
                              setCustomerSearch('');
                              setShowCustomerDropdown(false);
                            }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8,
                              background: teal[50], display: 'flex',
                              alignItems: 'center', justifyContent: 'center',
                              color: inkSoft, flexShrink: 0
                            }}>
                              <Building2 size={14} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name}</span>
                                {hasSubAccounts && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '1px 6px', borderRadius: 12,
                                    background: amber[100], color: '#92400e', fontSize: 10, fontWeight: 600
                                  }}>
                                    <Users size={10} />
                                    {customer.subAccounts.length}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {customer.email || customer.phone || 'No contact info'}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedCustomerFull && selectedCustomerFull.subAccounts && selectedCustomerFull.subAccounts.length > 0 ? (
              <div>
                <label style={labelStyle}>Sub Account</label>
                <select
                  id="sub-account"
                  name="sub_account_name"
                  value={formData.sub_account_name}
                  onChange={(event) => handleChange('sub_account_name', event.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select sub-account (or leave for main account)</option>
                  {selectedCustomerFull.subAccounts.map((sub: any) => (
                    <option key={sub.id} value={sub.name}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Creation Date</label>
                <input
                  id="batch-date"
                  name="batch_date"
                  type="date"
                  value={formData.batch_date}
                  onChange={(event) => handleChange('batch_date', event.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>Valid Until</label>
              <input
                id="valid-until"
                name="valid_until"
                type="date"
                value={formData.valid_until}
                onChange={(event) => handleChange('valid_until', event.target.value)}
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Academic Year</label>
              <input
                id="academic-year"
                name="academic_year"
                value={formData.academic_year}
                onChange={(event) => handleChange('academic_year', event.target.value)}
                placeholder="e.g. 2026"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Term</label>
              <select
                id="term"
                name="term"
                value={formData.term}
                onChange={(event) => handleChange('term', event.target.value)}
                required
                style={selectStyle}
              >
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Exam Type</label>
              <select
                id="exam-type"
                name="exam_type"
                value={formData.exam_type}
                onChange={(event) => handleChange('exam_type', event.target.value)}
                required
                style={selectStyle}
              >
                <option value="Mid-Term">Mid-Term</option>
                <option value="End-of-Term">End-of-Term</option>
                <option value="Mock">Mock</option>
                <option value="Assessment">Assessment</option>
              </select>
            </div>

            <div style={{ display: 'none' }}>
              <input
                type="hidden"
                value={formData.sales_account_id}
                onChange={(event) => handleChange('sales_account_id', event.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, marginTop: 8, borderTop: `1px solid ${hairline}` }}>
            <button type="submit" disabled={loading}
              style={{
                fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                transition: 'all .15s ease', opacity: loading ? 0.6 : 1
              }}>
              <Save size={16} />
              {loading ? 'Creating...' : 'Create Batch'}
            </button>
          </div>
        </form>
      </div>

      {showAddCustomer && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }} onClick={() => { if (!addingCustomer) setShowAddCustomer(false); }}>
          <div style={{
            width: 560, maxWidth: '100%', maxHeight: '92vh',
            background: paper, borderRadius: 14,
            boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
          }} onClick={(e) => e.stopPropagation()}>
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
                  <Plus size={19} color="#fff" />
                </div>
                <div>
                  <h1 style={{
                    fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                    fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                  }}>
                    Add New Customer
                  </h1>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                    Create a new customer or school record
                  </p>
                </div>
              </div>
              <button onClick={() => { if (!addingCustomer) setShowAddCustomer(false); }} aria-label="Close" style={{
                width: 32, height: 32, borderRadius: 8,
                border: `1px solid ${hairline}`, background: paper, color: inkSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all .15s ease', fontSize: 16
              }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ padding: '24px 28px 8px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Customer Name <span style={{ color: danger, fontWeight: 700 }}>*</span></label>
                <input value={newCustomer.name} onChange={(event) => setNewCustomer((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter customer/school name" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="customer@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={newCustomer.phone} onChange={(event) => setNewCustomer((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder={getPlaceholder.phone()} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input value={newCustomer.address} onChange={(event) => setNewCustomer((prev) => ({ ...prev, address: event.target.value }))}
                    placeholder="Street address" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={newCustomer.city} onChange={(event) => setNewCustomer((prev) => ({ ...prev, city: event.target.value }))}
                    placeholder="City" style={inputStyle} />
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 10, padding: '16px 28px',
              borderTop: `1px solid ${hairline}`, background: paper
            }}>
              <button type="button" onClick={() => setShowAddCustomer(false)} disabled={addingCustomer} style={btnGhostStyle}>
                Cancel
              </button>
              <button onClick={handleAddNewCustomer} disabled={addingCustomer || !newCustomer.name.trim()} type="button"
                style={{
                  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
                  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                  transition: 'all .15s ease', opacity: (addingCustomer || !newCustomer.name.trim()) ? 0.6 : 1
                }}>
                <Plus size={14} />
                {addingCustomer ? 'Adding...' : 'Add Customer'}
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExaminationBatchForm;