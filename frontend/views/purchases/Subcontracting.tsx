import React, { useState, useMemo } from 'react';
import { 
  Share2, Truck, ExternalLink, Clock, CheckCircle, 
  AlertCircle, Plus, Search, Filter, FileText, 
  Building2, ArrowRight, Package, DollarSign, X, 
  ChevronRight, ArrowLeftRight, Trash2, Edit2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProduction } from '../../context/ProductionContext';
import { useProcurement } from '../../context/ProcurementContext';
import { WorkOrder, SubcontractOrder } from '../../types';
import { generateNextId } from '../../utils/helpers';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const input: React.CSSProperties = { width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '8px 12px', outline: 'none' };

const Subcontracting: React.FC = () => {
    const { companyConfig, notify } = useAuth(); const { workOrders, updateWorkOrder } = useProduction(); const { subcontractOrders, addSubcontractOrder, updateSubcontractOrder, deleteSubcontractOrder, purchases } = useProcurement();
    
    const supplierNames = useMemo(() => {
        const names = new Set<string>();
        purchases?.forEach(p => { if (p.supplierId) names.add(p.supplierId); });
        return Array.from(names).sort();
    }, [purchases]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedWoId, setSelectedWoId] = useState('');
    const [selectedSupId, setSelectedSupId] = useState('');
    const [opName, setOpName] = useState('Lamination');
    const [qty, setQty] = useState(0);
    const [cost, setCost] = useState(0);
    const [dueDate, setDueDate] = useState('');

    const currency = companyConfig.currencySymbol;

    const activeWOs = useMemo(() => workOrders.filter(wo => ['Scheduled', 'In Progress'].includes(wo.status)), [workOrders]);

    const handleCreateSubOrder = async () => {
        if (!selectedWoId || !selectedSupId) return;
        const newOrderId = generateNextId('SUB', subcontractOrders, companyConfig);
        const newOrder: SubcontractOrder = { id: newOrderId, workOrderId: selectedWoId, supplierId: selectedSupId, operationName: opName, quantity: qty, cost: cost, date: new Date().toISOString(), dueDate: dueDate || new Date().toISOString(), status: 'Sent' };
        await addSubcontractOrder(newOrder);
        const wo = workOrders.find(w => w.id === selectedWoId);
        if (wo) updateWorkOrder({ ...wo, notes: `${wo.notes || ''} [OUTSOURCED: ${opName} to ${selectedSupId}]` });
        notify("Subcontracting Order Sent to Partner", "success");
        setIsModalOpen(false);
        resetForm();
    };

    const resetForm = () => { setSelectedWoId(''); setSelectedSupId(''); setOpName('Lamination'); setQty(0); setCost(0); setDueDate(''); };

    const handleUpdateStatus = async (id: string, status: SubcontractOrder['status']) => {
        const order = subcontractOrders.find(o => o.id === id);
        if (order) { await updateSubcontractOrder({ ...order, status }); notify(`Subcontract status updated to ${status}`, "info"); }
    };

    const handleDeleteOrder = async (id: string) => { if (confirm("Delete this subcontract record?")) { await deleteSubcontractOrder(id); notify("Record deleted", "info"); } };

    const handleOpenPortal = (vendorId: string) => { const url = window.location.origin + window.location.pathname + `#/portal/vendor/${vendorId}`; window.open(url, '_blank'); notify("Opening Subcontractor Portal...", "info"); };

    const filteredSubcontracts = (subcontractOrders || []).filter(o => 
        (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.operationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (o.supplierId || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: paper, fontFamily: "'Inter',sans-serif", overflow: 'hidden' }}>
            <header style={{ padding: '24px 40px', borderBottom: `1.4px solid ${hairline}`, background: paper, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Share2 size={24} style={{ color: teal[500] }}/> Subcontracting
                    </h1>
                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>Manage external production partners and outsourced operations.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setIsModalOpen(true)}
                      style={{ background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', padding: '8px 16px', borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)` }}>
                        <Plus size={16}/> New Sub-Job
                    </button>
                </div>
            </header>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <main style={{ flex: 1, padding: 40, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                        {(supplierNames || []).slice(0, 3).map(name => (
                            <div key={name} style={{ background: paper, borderRadius: 20, border: `1.4px solid ${hairline}`, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                                    <div style={{ width: 48, height: 48, borderRadius: 14, background: teal[50], color: teal[600], display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.4px solid ${teal[100]}` }}>
                                        <Building2 size={24}/>
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 900, color: teal[600], background: teal[50], padding: '2px 8px', borderRadius: 20, border: `1.4px solid ${teal[100]}`, textTransform: 'uppercase' }}>Partner</span>
                                </div>
                                <h3 style={{ fontSize: 18, fontWeight: 900, color: ink, margin: '0 0 4px' }}>{name}</h3>
                                <p style={{ fontSize: 12, color: inkSoft, margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={12}/> Lead Time: 3-5 Days</p>
                                <div style={{ marginBottom: 32 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, color: inkSoft }}>
                                        <span>Active Jobs</span>
                                        <span style={{ color: ink }}>{(subcontractOrders || []).filter(o => o.supplierId === name && o.status !== 'Completed').length}</span>
                                    </div>
                                    <div style={{ height: 6, width: '100%', background: teal[50], borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                                        <div style={{ height: '100%', background: teal[500], borderRadius: 999, width: '60%' }} />
                                    </div>
                                </div>
                                <button onClick={() => handleOpenPortal(name)}
                                  style={{ width: '100%', padding: 12, background: teal[50], border: `1.4px solid ${hairline}`, color: inkSoft, borderRadius: 14, fontWeight: 900, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.06, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                                  onMouseEnter={e => { e.currentTarget.style.background = teal[500]; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = teal[500]; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; }}>
                                    <ExternalLink size={14}/> Launch Vendor Portal
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ background: paper, borderRadius: 20, border: `1.4px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px 24px', borderBottom: `1.4px solid ${teal[100]}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ fontWeight: 900, color: ink, textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.06, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={16} style={{ color: teal[500] }}/> Pipeline & Fulfillment
                            </h3>
                            <div style={{ position: 'relative' }}>
                                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} size={14}/>
                                <input style={{ ...input, paddingLeft: 32, padding: '6px 12px 6px 32', background: teal[50], width: 256, fontSize: 12 }}
                                  placeholder="Search subcontract jobs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="prime-input"/>
                            </div>
                        </div>
                        <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead style={{ background: teal[50], borderBottom: `1.4px solid ${teal[100]}`, position: 'sticky', top: 0, zIndex: 1 }}>
                                <tr>
                                    {['Job / Vendor', 'Operation', 'Qty Sent', 'Due Back', 'Status', 'Cost', 'Action'].map(h => (
                                        <th key={h} style={{ padding: '12px 24px', fontWeight: 700, fontSize: 12, color: inkSoft, textAlign: h === 'Qty Sent' || h === 'Due Back' || h === 'Status' ? 'center' : h === 'Cost' || h === 'Action' ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSubcontracts.map(order => (
                                    <tr key={order.id} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                      onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ fontWeight: 700, color: ink }}>{workOrders.find(w => w.id === order.workOrderId)?.productName || 'Custom Job'}</div>
                                            <div style={{ fontSize: 10, color: inkSoft, fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase', letterSpacing: -0.01 }}>Out to: {order.supplierId}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <span style={{ background: teal[50], color: teal[700], padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', border: `1.4px solid ${teal[100]}` }}>{order.operationName}</span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 700, color: ink }}>{order.quantity}</td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: inkSoft }}>{new Date(order.dueDate).toLocaleDateString()}</span>
                                                {new Date(order.dueDate) < new Date() && order.status !== 'Completed' && (
                                                    <span style={{ fontSize: 8, color: danger, fontWeight: 900, textTransform: 'uppercase' }}>Overdue</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <select value={order.status} onChange={e => handleUpdateStatus(order.id, e.target.value as SubcontractOrder['status'])}
                                              style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', border: `1.4px solid`, borderRadius: 4, padding: '2px 6px', outline: 'none', cursor: 'pointer', background: order.status === 'Completed' ? teal[50] : amber[100], color: order.status === 'Completed' ? teal[700] : amber[500], borderColor: order.status === 'Completed' ? teal[200] : amber[300] }}
                                              className="prime-select">
                                                <option>Sent</option>
                                                <option>In Progress</option>
                                                <option>Completed</option>
                                                <option>Returned</option>
                                                <option>Cancelled</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700, color: ink }}>
                                            {currency}{order.cost.toFixed(2)}
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteOrder(order.id)}
                                              style={{ padding: 4, background: 'transparent', border: 'none', color: hairline, cursor: 'pointer', opacity: 0 }}
                                              onMouseEnter={e => e.currentTarget.parentElement!.style.opacity = ''}
                                              className="group-hover:opacity-100">
                                                <Trash2 size={16}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredSubcontracts.length === 0 && (
                                    <tr><td colSpan={7} style={{ padding: 80, textAlign: 'center', color: inkSoft, fontWeight: 500, fontStyle: 'italic' }}>No outsourced jobs matching search.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>

            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: paper, borderRadius: 20, boxShadow: '0 30px 70px -20px rgba(0,0,0,.55)', width: '100%', maxWidth: 512, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 24, borderBottom: `1.4px solid ${teal[100]}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: teal[50] }}>
                            <h2 style={{ fontSize: 20, fontWeight: 900, color: ink, textTransform: 'uppercase', letterSpacing: -0.01, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><ArrowLeftRight style={{ color: teal[500] }}/> Outsource Operation</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: inkSoft }}><X/></button>
                        </div>
                        <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'auto' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Select Work Order</label>
                                <select style={{ ...input, borderRadius: 14, cursor: 'pointer' }} value={selectedWoId} onChange={e => setSelectedWoId(e.target.value)} className="prime-select">
                                    <option value="">-- Select Active Job --</option>
                                    {activeWOs.map(wo => <option key={wo.id} value={wo.id}>{wo.id} - {wo.productName} ({wo.quantityPlanned} units)</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Partner Supplier</label>
                                <select style={{ ...input, borderRadius: 14, cursor: 'pointer' }} value={selectedSupId} onChange={e => setSelectedSupId(e.target.value)} className="prime-select">
                                    <option value="">-- Select Partner --</option>
                                    {supplierNames.map(name => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Operation</label>
                                    <input style={{ ...input, borderRadius: 14 }} value={opName} onChange={e => setOpName(e.target.value)} placeholder="e.g. UV Varnish" className="prime-input"/>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Expected Back</label>
                                    <input type="date" style={{ ...input, borderRadius: 14 }} value={dueDate} onChange={e => setDueDate(e.target.value)} className="prime-input"/>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Units Sent</label>
                                    <input type="number" style={{ ...input, borderRadius: 14, fontWeight: 700 }} value={qty} onChange={e => setQty(parseFloat(e.target.value))} className="prime-input"/>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 900, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Agreed Cost</label>
                                    <input type="number" style={{ ...input, borderRadius: 14, fontWeight: 700, color: teal[600] }} value={cost} onChange={e => setCost(parseFloat(e.target.value))} className="prime-input"/>
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: 24, background: teal[50], borderTop: `1.4px solid ${teal[100]}`, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                            <button onClick={() => setIsModalOpen(false)} style={{ padding: '12px 24px', border: `1.4px solid ${hairline}`, borderRadius: 14, fontWeight: 900, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.06, color: inkSoft, background: paper, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleCreateSubOrder} style={{ padding: '12px 32px', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 14, fontWeight: 900, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.06, border: 'none', cursor: 'pointer', boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)` }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
                                Create Subcontract Order
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Subcontracting;