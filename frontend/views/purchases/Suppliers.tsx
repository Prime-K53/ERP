import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, Plus, Filter, Download, MoreHorizontal, Phone, 
  MapPin, ChevronRight, Truck, Trash2, Edit, ExternalLink,
  DollarSign, Clock, CheckCircle, AlertCircle, Building2, AlertTriangle
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProcurement } from '../../context/ProcurementContext';
import { useAuth } from '../../context/AuthContext';
import { Supplier, Purchase } from '../../types';
import { SupplierModal } from './components/SupplierModal';
import { SupplierWorkspace } from './components/SupplierWorkspace';
import { isAfter, parseISO, subDays, format } from 'date-fns';
import { exportToCSV } from '../../utils/helpers';
import { currencyService } from '../../services/currencyService';
import { useFinance } from '../../context/FinanceContext';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '6px 12px', outline: 'none', transition: 'border-color .15s,box-shadow .15s' };
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 30, cursor: 'pointer' };

const Suppliers: React.FC = () => {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, isLoading, purchases } = useProcurement();
  const { supplierPayments = [] } = useFinance();
  const { companyConfig } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | undefined>();
  const [selectedWorkspaceSupplier, setSelectedWorkspaceSupplier] = useState<Supplier | null>(null);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [selectedMetric, setSelectedMetric] = useState<'All' | 'Overdue' | 'Open' | 'Paid'>('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    type?: ConfirmDialogType;
    onConfirm?: () => void;
  }>({ open: false, title: '', message: '' });

  useEffect(() => {
      const handleClickOutside = () => setActiveMenuId(null);
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
      if (location.state?.action === 'create') {
        handleAddNew();
        window.history.replaceState({}, document.title);
      }
    }, [location.state]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const name = s.name || '';
      const email = s.email || '';
      const phone = s.phone || '';
      const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          phone.includes(searchQuery);
      const matchesStatus = filterStatus === 'All' || s.status === filterStatus;
      let matchesMetric = true;
      if (selectedMetric === 'Overdue') { const hasOverdue = (purchases || []).some(p => p.supplierName === s.name && p.paymentStatus !== 'Paid' && p.paymentStatus !== 'Cancelled' && p.dueDate && isAfter(new Date(), parseISO(p.dueDate))); matchesMetric = hasOverdue; }
      else if (selectedMetric === 'Open') { const hasOpen = (purchases || []).some(p => p.supplierName === s.name && (p.paymentStatus === 'Unpaid' || p.paymentStatus === 'Partial')); matchesMetric = hasOpen; }
      else if (selectedMetric === 'Paid') { const hasPaid = supplierPayments.some(p => p.supplierId === s.id); matchesMetric = hasPaid; }
      return matchesSearch && matchesStatus && matchesMetric;
    });
  }, [suppliers, searchQuery, filterStatus, selectedMetric, purchases, supplierPayments]);

  const stats = useMemo(() => {
    const getNumber = (value: any, fallback = 0) => (typeof value === 'number' && !isNaN(value) ? value : fallback);
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    const totalBalance = suppliers.reduce((sum, s) => sum + getNumber(s.balance), 0);
    const overduePayables = (purchases || []).filter(p => p.paymentStatus !== 'Paid' && p.paymentStatus !== 'Cancelled' && p.dueDate && isAfter(today, parseISO(p.dueDate))).reduce((sum, p) => sum + (getNumber(p.total) - getNumber(p.paidAmount)), 0);
    const openBillsTotal = (purchases || []).filter(p => p.paymentStatus === 'Unpaid' || p.paymentStatus === 'Partial').reduce((sum, p) => sum + (getNumber(p.total) - getNumber(p.paidAmount)), 0);
    const paidLast30Days = supplierPayments.filter(p => isAfter(parseISO(p.date), thirtyDaysAgo)).reduce((sum, p) => sum + getNumber(p.amount), 0);
    const activeCount = suppliers.filter(s => s.status === 'Active').length;
    return { totalBalance, overduePayables, openBillsTotal, paidLast30Days, activeCount };
  }, [suppliers, purchases, supplierPayments]);

  const handleEdit = (supplier: Supplier) => { setSelectedSupplier(supplier); setIsModalOpen(true); };
  const handleAddNew = () => { setSelectedSupplier(undefined); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedSupplier(undefined); };

  const handleDelete = async (id: string) => {
    setConfirmState({ open: true, title: 'Delete Supplier', message: 'Are you sure you want to delete this supplier?', type: 'danger', confirmText: 'Delete', onConfirm: async () => { await deleteSupplier(id); } });
  };

  const handleBatchDelete = async () => {
    setConfirmState({ open: true, title: 'Delete Suppliers', message: `Are you sure you want to delete ${selectedIds.length} suppliers?`, type: 'danger', confirmText: 'Delete', onConfirm: async () => { for (const id of selectedIds) await deleteSupplier(id); setSelectedIds([]); } });
  };

  const handleBatchStatusUpdate = async (status: 'Active' | 'Inactive') => {
    for (const id of selectedIds) { const s = suppliers.find(s => s.id === id); if (s) await updateSupplier({ ...s, status }); }
    setSelectedIds([]);
  };

  const toggleSelectAll = () => { setSelectedIds(selectedIds.length === filteredSuppliers.length ? [] : filteredSuppliers.map(s => s.id)); };
  const toggleSelect = (id: string) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };

  const getLastTransaction = (supplierId: string) => {
    const supplierPurchases = (purchases || []).filter(p => p.supplierName === suppliers.find(s => s.id === supplierId)?.name);
    if (supplierPurchases.length === 0) return 'No transactions';
    const latest = supplierPurchases.reduce((prev, current) => isAfter(parseISO(current.date), parseISO(prev.date)) ? current : prev);
    return format(parseISO(latest.date), 'MMM dd, yyyy');
  };

  if (selectedWorkspaceSupplier) {
    return (<SupplierWorkspace supplier={selectedWorkspaceSupplier} onBack={() => setSelectedWorkspaceSupplier(null)} onEdit={(s) => { setSelectedSupplier(s); setIsModalOpen(true); }} />);
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px 24px', background: teal[50], minHeight: '100vh', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, letterSpacing: -0.02 }}>Suppliers</h1>
            <p style={{ fontSize: 13, color: inkSoft, fontWeight: 500, margin: '2px 0 0' }}>Manage your vendors and procurement relationships</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => exportToCSV(suppliers, 'Suppliers')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, color: inkSoft, fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
              <Download size={16} /> Export
            </button>
            <button onClick={handleAddNew}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 9, fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: 13, boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)` }}>
              <Plus size={18} /> New Supplier
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Overdue', value: stats.overduePayables, icon: AlertTriangle, borderColor: danger, iconBg: `${danger}15`, iconColor: danger, metric: 'Overdue' as const },
          { label: 'Open Bills', value: stats.openBillsTotal, icon: Clock, borderColor: amber[500], iconBg: amber[100], iconColor: amber[500], metric: 'Open' as const },
          { label: 'Paid (30 Days)', value: stats.paidLast30Days, icon: CheckCircle, borderColor: teal[500], iconBg: teal[50], iconColor: teal[500], metric: 'Paid' as const },
        ].map(item => (
          <div key={item.label} onClick={() => setSelectedMetric(selectedMetric === item.metric ? 'All' : item.metric)}
            style={{ cursor: 'pointer', background: paper, padding: '12px 16px', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, borderLeft: `4px solid ${item.borderColor}`, display: 'flex', alignItems: 'center', gap: 16, transition: 'all .2s', ...(selectedMetric === item.metric ? { boxShadow: `0 4px 12px rgba(0,0,0,.08)`, transform: 'scale(1.01)', borderColor: item.borderColor } : {}) }}>
            <div style={{ padding: 10, borderRadius: 9, background: item.iconBg, color: item.iconColor }}>
              <item.icon size={20} />
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: -0.01, margin: '0 0 4px' }}>{item.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0 }}>{currency}{(item.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: paper, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
        <div style={{ padding: 12, borderBottom: `1.4px solid ${teal[100]}`, background: teal[50], display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
              <Search style={{ position: 'absolute', left: 10, top: 10, color: inkSoft }} size={16} />
              <input id="search-suppliers" name="search_suppliers" type="text" placeholder="Search by supplier name, email or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 34, background: paper }} className="prime-input" />
            </div>
            {selectedIds.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: teal[500], padding: '4px 10px', background: teal[50], borderRadius: 9, border: `1.4px solid ${teal[100]}` }}>{selectedIds.length} Selected</span>
                <div style={{ height: 20, width: 1, background: hairline }} />
                <select id="batch-actions" name="batch_actions" onChange={(e) => { if (e.target.value === 'delete') handleBatchDelete(); else if (e.target.value === 'active') handleBatchStatusUpdate('Active'); else if (e.target.value === 'inactive') handleBatchStatusUpdate('Inactive'); e.target.value = ''; }}
                  style={{ ...selectStyle, padding: '6px 10px', fontSize: 13 }} className="prime-select">
                  <option value="">Batch Actions</option>
                  <option value="active">Make Active</option>
                  <option value="inactive">Make Inactive</option>
                  <option value="delete">Delete Selected</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select id="filter-status" name="filter_status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'All' | 'Active' | 'Inactive')}
              style={{ ...selectStyle, padding: '6px 10px', fontSize: 13 }} className="prime-select">
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button style={{ padding: 8, color: inkSoft, cursor: 'pointer', border: 'none', background: 'transparent', borderRadius: 9 }}
              onMouseEnter={e => { e.currentTarget.style.color = teal[500]; e.currentTarget.style.background = teal[50]; }}
              onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = 'transparent'; }}>
              <Filter size={18} />
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: teal[50] }}>
                <th style={{ padding: '10px 16px', width: 40, fontWeight: 600, fontSize: 12, color: inkSoft }}>
                  <input id="select-all-suppliers" name="select_all" type="checkbox" checked={selectedIds.length === filteredSuppliers.length && filteredSuppliers.length > 0} onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }} />
                </th>
                <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: inkSoft }}>Supplier Name</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: inkSoft }}>Contact Details</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: inkSoft }}>Last Transaction</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: inkSoft, textAlign: 'right' }}>Balance Due</th>
                <th style={{ padding: '10px 16px', fontWeight: 600, fontSize: 12, color: inkSoft, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>Loading suppliers...</td></tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: inkSoft, fontStyle: 'italic' }}>No suppliers found matching your criteria.</td></tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} onClick={() => setSelectedWorkspaceSupplier(supplier)}
                    style={{ borderBottom: `1.4px solid ${teal[50]}`, cursor: 'pointer', background: selectedIds.includes(supplier.id) ? teal[50] : 'transparent' }}
                    onMouseEnter={e => { if (!selectedIds.includes(supplier.id)) e.currentTarget.style.background = teal[50]; }}
                    onMouseLeave={e => { if (!selectedIds.includes(supplier.id)) e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(supplier.id)} onChange={() => toggleSelect(supplier.id)}
                        style={{ width: 16, height: 16, accentColor: teal[600], cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: teal[50], color: teal[600], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, border: `1.4px solid ${teal[100]}` }}>{supplier.name.charAt(0)}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <p style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0 }}>{supplier.name}</p>
                            <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1.4px solid`, textTransform: 'uppercase', letterSpacing: -0.01, background: supplier.status === 'Active' ? teal[50] : paper, color: supplier.status === 'Active' ? teal[700] : inkSoft, borderColor: supplier.status === 'Active' ? teal[200] : hairline }}>
                              {supplier.status}
                            </span>
                          </div>
                          <p style={{ fontSize: 10, color: inkSoft, fontWeight: 700, letterSpacing: -0.01, textTransform: 'uppercase', margin: 0 }}>ID: {supplier.id}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: ink, fontSize: 13, fontWeight: 700 }}>
                        <Phone size={13} style={{ color: inkSoft }} /> {supplier.phone || 'No phone'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <p style={{ fontSize: 13, color: ink, fontWeight: 700, margin: 0 }}>{getLastTransaction(supplier.id)}</p>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: (supplier.balance || 0) > 0 ? danger : teal[600] }}>
                        {currency}{(supplier.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </td>
                    <td style={{ padding: '10px 16px' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <button onClick={() => handleEdit(supplier)}
                          style={{ padding: '6px 10px', background: teal[50], color: teal[600], border: 'none', borderRadius: 9, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = teal[100]}
                          onMouseLeave={e => e.currentTarget.style.background = teal[50]}>
                          Edit
                        </button>
                        <div style={{ position: 'relative' }}>
                          <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === supplier.id ? null : supplier.id); }}
                            style={{ padding: 6, borderRadius: 9, border: 'none', cursor: 'pointer', background: activeMenuId === supplier.id ? teal[50] : 'transparent', color: activeMenuId === supplier.id ? teal[600] : inkSoft }}>
                            <MoreHorizontal size={16} />
                          </button>
                          {activeMenuId === supplier.id && (
                            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 176, background: paper, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.1)', border: `1.4px solid ${teal[100]}`, padding: '6px 0', zIndex: 10 }}>
                              <button onClick={(e) => { e.stopPropagation(); navigate('/procurement/bills', { state: { action: 'create', supplierId: supplier.id } }); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: inkSoft, border: 'none', background: 'transparent', cursor: 'pointer' }}
                                onMouseEnter={e => e.currentTarget.style.background = teal[50]}>
                                <ExternalLink size={14} style={{ color: inkSoft }} /> Create Bill
                              </button>
                              <div style={{ height: 1, background: teal[100], margin: '4px 0' }} />
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 12px', fontSize: 13, fontWeight: 600, color: danger, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                <Trash2 size={14} /> Delete Supplier
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SupplierModal isOpen={isModalOpen} onClose={handleCloseModal} onSave={selectedSupplier ? updateSupplier : addSupplier} mode={selectedSupplier?.id ? 'edit' : 'create'} initialSupplier={selectedSupplier} />
      <ConfirmDialog open={confirmState.open} onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))} onConfirm={() => { confirmState.onConfirm?.(); setConfirmState(c => ({ ...c, open: false })); }} onCancel={() => setConfirmState(c => ({ ...c, open: false }))} title={confirmState.title} message={confirmState.message} confirmText={confirmState.confirmText} type={confirmState.type || 'danger'} />
    </div>
  );
};

export default Suppliers;