import React, { useState, useEffect, useRef } from 'react';
import { logger } from '@/services/logger';
import { X, Save, Plus, Search, ChevronDown, Building2, Calendar, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useExamination } from '../../../context/ExaminationContext';
import { useAuth } from '../../../context/AuthContext';
import { Input } from '../../../components/Input';
import { toast } from '../../../components/Toast';
import { Customer } from '../../../types';
import { getPlaceholder } from '../../../constants/placeholders';
import { dbService } from '../../../services/db';
import { currencyService } from '../../../services/currencyService';

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

interface ExaminationBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (batch: any) => void;
}

const ExaminationBatchModal: React.FC<ExaminationBatchModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const { createBatch, loadAllData, schools, customers, loading: contextLoading } = useExamination();
  const { companyConfig, addAuditLog } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    school_id: '', name: '',
    academic_year: new Date().getFullYear().toString(),
    term: '1', exam_type: 'Mid-Term', sub_account_name: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '', city: '' });
  const [addingCustomer, setAddingCustomer] = useState(false);

  useEffect(() => { if (isOpen) loadAllData(); }, [isOpen, loadAllData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setShowDropdown(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside); };
  }, []);

  const filteredSchools = React.useMemo(() => {
    if (!schools || schools.length === 0) return [];
    if (!searchQuery.trim()) return schools.slice(0, 20);
    const query = searchQuery.toLowerCase();
    return schools.filter(school =>
      school.name?.toLowerCase().includes(query) ||
      school.email?.toLowerCase().includes(query) ||
      school.phone?.toLowerCase().includes(query)
    );
  }, [schools, searchQuery]);

  const handleSelectSchool = (school: any) => {
    setSelectedSchool(school);
    setFormData(prev => ({ ...prev, school_id: school.id, sub_account_name: '' }));
    setSearchQuery(school.name);
    setShowDropdown(false);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (!showDropdown) setShowDropdown(true);
    if (selectedSchool && value !== selectedSchool.name) {
      setSelectedSchool(null);
      setFormData(prev => ({ ...prev, school_id: '', sub_account_name: '' }));
    }
  };

  const selectedCustomerFull = React.useMemo(() => {
    if (!formData.school_id) return null;
    return customers.find(c => String(c.id) === String(formData.school_id));
  }, [customers, formData.school_id]);

  const selectedCustomerSubAccounts = React.useMemo(() => selectedCustomerFull?.subAccounts || [], [selectedCustomerFull]);
  const hasSubAccounts = selectedCustomerSubAccounts.length > 0;

  const handleAddNewCustomer = async () => {
    if (!newCustomer.name.trim()) return;
    setAddingCustomer(true);
    try {
      const customerId = `CUS-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const customer: Customer = {
        id: customerId, name: newCustomer.name.trim(), email: newCustomer.email.trim() || '',
        phone: newCustomer.phone.trim() || '', address: newCustomer.address.trim() || '',
        city: newCustomer.city.trim() || '', balance: 0, walletBalance: 0, creditLimit: 0,
        status: 'Active', category: 'School', segment: 'School Account', paymentTerms: 'Net 365'
      };
      await dbService.put('customers', customer);
      if (addAuditLog) addAuditLog({ action: 'CREATE', entityType: 'Customer', entityId: customerId, details: `Created new customer: ${customer.name}`, newValue: customer });
      await loadAllData();
      handleSelectSchool(customer);
      setNewCustomer({ name: '', email: '', phone: '', address: '', city: '' });
      setShowAddCustomer(false);
    } catch (error) {
      logger.error('Failed to add customer:', error);
    } finally { setAddingCustomer(false); }
  };

  const handleChange = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!formData.school_id) { toast.error('Please select a school or customer from the list'); return; }
    if (!formData.name.trim()) { toast.error('Please enter a batch name'); return; }
    if (hasSubAccounts && !formData.sub_account_name.trim()) { toast.error('Please select a billed sub-account'); return; }
    setLoading(true);
    try {
      const payload = {
        ...formData,
        school_id: String(formData.school_id || '').trim(),
        name: formData.name.trim(),
        academic_year: formData.academic_year.trim(),
        currency: companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$',
        sub_account_name: hasSubAccounts ? formData.sub_account_name.trim() : '',
        rounding_method: companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50',
        rounding_value: Number(companyConfig?.pricingSettings?.customStep || 50)
      };
      const newBatch = await createBatch(payload);
      toast.success('Examination batch created successfully');
      try { onSuccess?.(newBatch); } catch (callbackError) { logger.error('Batch success callback failed:', callbackError); }
      onClose();
    } catch (error: any) {
      logger.error('Failed to create batch:', error);
      toast.error(error?.message || 'Failed to create examination batch. Please try again.');
    } finally { setLoading(false); }
  };

  const billedAccountLabel = React.useMemo(() => {
    if (!selectedSchool) return 'Not selected';
    if (hasSubAccounts) return formData.sub_account_name || 'Select sub-account';
    return 'Main account';
  }, [selectedSchool, hasSubAccounts, formData.sub_account_name]);

  if (!isOpen) return null;

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
      }} onClick={onClose}>
        <div style={{
          width: 1100, maxWidth: '100%', maxHeight: '92vh',
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
                <Building2 size={19} color="#fff" />
              </div>
              <div>
                <h1 style={{
                  fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
                  fontSize: 22, margin: 0, color: teal[800], letterSpacing: 0.2
                }}>
                  Create New Examination Batch
                </h1>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: inkSoft, letterSpacing: 0.02 }}>
                  {formData.name ? `Batch: ${formData.name}` : 'Secure Document Terminal'}
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

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left: Form Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 8px' }}>
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>
                  Batch Name <span style={{ color: danger, fontWeight: 700 }}>*</span>
                </label>
                <input type="text" value={formData.name} onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g. Term 1 Examinations 2026" style={inputStyle} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Academic Year</label>
                  <input type="text" value={formData.academic_year} onChange={(e) => handleChange('academic_year', e.target.value)}
                    placeholder="e.g. 2026" style={inputStyle} required />
                </div>
                <div>
                  <label style={labelStyle}>Billed Account</label>
                  <div style={{ position: 'relative' }}>
                    <select value={formData.sub_account_name} onChange={(e) => handleChange('sub_account_name', e.target.value)}
                      disabled={!selectedSchool || !hasSubAccounts} style={selectStyle}>
                      {!selectedSchool && <option value="">Select customer first</option>}
                      {selectedSchool && !hasSubAccounts && <option value="">Main account billing (no sub-accounts)</option>}
                      {hasSubAccounts && <option value="">Select billed sub-account</option>}
                      {selectedCustomerSubAccounts.map((sub: any) => (
                        <option key={sub.id || sub.name} value={sub.name}>{sub.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Term</label>
                  <div style={{ position: 'relative' }}>
                    <select value={formData.term} onChange={(e) => handleChange('term', e.target.value)} style={selectStyle}>
                      <option value="1">Term 1</option>
                      <option value="2">Term 2</option>
                      <option value="3">Term 3</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Exam Type</label>
                  <div style={{ position: 'relative' }}>
                    <select value={formData.exam_type} onChange={(e) => handleChange('exam_type', e.target.value)} style={selectStyle}>
                      <option value="Mid-Term">Mid-Term</option>
                      <option value="End-of-Term">End-of-Term</option>
                      <option value="Mock">Mock</option>
                      <option value="National">National</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* School / Client Search */}
              <div style={{ marginBottom: 18 }} ref={dropdownRef}>
                <label style={labelStyle}>
                  School / Client <span style={{ color: danger, fontWeight: 700 }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                    onFocus={() => setShowDropdown(true)} onClick={() => setShowDropdown(true)}
                    placeholder="Search schools or customers..."
                    style={{ ...inputStyle, paddingLeft: 36, paddingRight: 32 }} />
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                  <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
                  {selectedSchool && (
                    <button type="button" onClick={() => { setSelectedSchool(null); setSearchQuery(''); setFormData(prev => ({ ...prev, school_id: '', sub_account_name: '' })); }}
                      style={{ position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: inkSoft }}>
                      <X size={14} />
                    </button>
                  )}
                  {showDropdown && (
                    <div style={{
                      position: 'absolute', zIndex: 60, marginTop: 4, width: '100%',
                      background: paper, border: `1px solid ${hairline}`, borderRadius: 12,
                      boxShadow: '0 10px 40px -8px rgba(0,0,0,.2)',
                      maxHeight: 240, overflowY: 'auto'
                    }}>
                      <button type="button" onClick={() => { setShowDropdown(false); setShowAddCustomer(true); }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: teal[500], borderBottom: `1px solid ${hairline}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Plus size={14} /> Add New Customer / School
                      </button>
                      {contextLoading ? (
                        <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: inkSoft }}>Loading...</div>
                      ) : filteredSchools.length === 0 ? (
                        <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: inkSoft }}>No matches found.</div>
                      ) : (
                        filteredSchools.map((school) => (
                          <button key={school.id} type="button" onClick={() => handleSelectSchool(school)}
                            style={{
                              width: '100%', padding: '10px 14px', textAlign: 'left', fontSize: 13,
                              border: 'none', background: selectedSchool?.id === school.id ? teal[50] : 'transparent',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                              borderBottom: `1px solid ${hairline}`
                            }}>
                            <Building2 size={14} style={{ color: inkSoft }} />
                            <div>
                              <div style={{ fontWeight: 500, color: ink }}>{school.name}</div>
                              {school.email && <div style={{ fontSize: 11, color: inkSoft }}>{school.email}</div>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Summary Sidebar */}
            <div style={{
              width: 260, flexShrink: 0,
              background: `linear-gradient(180deg, ${teal[800]}, ${teal[900]})`,
              padding: '18px 16px', position: 'relative', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0, width: 10,
                backgroundImage: 'radial-gradient(circle, rgba(254,253,251,.9) 2.2px, transparent 2.3px)',
                backgroundSize: '10px 16px', backgroundPosition: '4px 8px', opacity: 0.12
              }} />
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={16} color="rgba(255,255,255,.7)" />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>Configuration</span>
                </div>

                <div style={{ padding: 14, borderRadius: 8, background: 'rgba(255,255,255,.06)', marginBottom: 12 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Batch Name</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{formData.name || 'Untitled'}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Academic Year</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{formData.academic_year}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Term</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>Term {formData.term}</div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Exam Type</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{formData.exam_type}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Billed Account</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{billedAccountLabel}</div>
                  </div>
                  {selectedSchool && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Selected School</div>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{selectedSchool.name}</div>
                      {selectedSchool.email && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{selectedSchool.email}</div>}
                    </div>
                  )}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.1, marginBottom: 4 }}>Status</div>
                    <div style={{ fontSize: 13, color: amber[300], fontWeight: 500 }}>Draft</div>
                  </div>
                </div>

                <div style={{
                  padding: 12, borderRadius: 8,
                  background: 'rgba(255,255,255,.045)',
                  border: '1px dashed rgba(255,255,255,.14)'
                }}>
                  <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,.42)', lineHeight: 1.5 }}>
                    After creating this batch, you can add classes and subjects to configure the examination details.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: 12, space: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button type="button" onClick={handleSubmit} disabled={loading}
                  style={{
                    width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
                    padding: '10px 14px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                    background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
                    transition: 'all .15s ease', opacity: loading ? 0.6 : 1
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <Save size={14} />
                  {loading ? 'Creating...' : 'Create Batch'}
                  <ChevronRight size={14} />
                </button>
                <button onClick={onClose} style={{
                  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500,
                  padding: '8px', borderRadius: 8, cursor: 'pointer', border: 'none',
                  background: 'transparent', color: 'rgba(255,255,255,.4)', transition: 'color .15s ease'
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = danger; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,.4)'; }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add New Customer Dialog */}
      {showAddCustomer && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '40px 20px', fontFamily: "'Inter','DM Sans',sans-serif", fontSize: 13.5, color: ink,
        }} onClick={() => { if (!addingCustomer) setShowAddCustomer(false); }}>
          <div style={{
            width: 520, maxWidth: '100%', maxHeight: '92vh',
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
                <input value={newCustomer.name} onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter customer/school name" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={newCustomer.email} onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="customer@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input value={newCustomer.phone} onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder={getPlaceholder.phone()} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input value={newCustomer.address} onChange={(e) => setNewCustomer(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Street address" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={newCustomer.city} onChange={(e) => setNewCustomer(prev => ({ ...prev, city: e.target.value }))}
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
              <button type="button" onClick={handleAddNewCustomer} disabled={addingCustomer || !newCustomer.name.trim()}
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
    </>
  );
};

export default ExaminationBatchModal;
