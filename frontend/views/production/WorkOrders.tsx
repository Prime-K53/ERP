
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '../../services/logger';
/* Added Play to the lucide-react imports */
import { Plus, LayoutGrid, List as ListIcon, Eye, Receipt, XCircle, Trash2, Edit, RefreshCw, ChevronRight, CheckSquare, Zap, Target, History, MoreVertical, MonitorPlay, FileText, Settings, Calendar, AlertTriangle, ShieldCheck, Clock, Play, PauseCircle, Printer, X, Download, FileDown, Search } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useProduction } from '../../context/ProductionContext';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { WorkOrderKanban } from './components/ProductionLists';
import { WorkOrderModal, MaterialReconciliationModal } from './components/ProductionForms';
import { WorkOrder, CartItem, Invoice } from '../../types';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../utils/pdfMapper';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { enrichDocumentCustomerData } from '../../utils/documentCustomerData';
import QualityInspection from '../../components/QualityInspection';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const tealBtn: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
  color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
  boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)`,
  transition: 'all .15s ease',
};
const ghostBtn: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: paper, border: `1.4px solid ${hairline}`, color: inkSoft,
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};
const dangerBtn: React.CSSProperties = {
  ...tealBtn,
  background: `linear-gradient(155deg, #dc2626, #b91c1c)`,
  boxShadow: `0 6px 16px -6px rgba(185,28,28,.55)`,
};

/**
 * Job Hover Card
 */
const JobHoverCard: React.FC<{
    pos: { x: number, y: number },
    wo: WorkOrder
}> = ({ pos, wo }) => {
    const progress = Math.min(100, ((wo.quantityCompleted || 0) / (wo.quantityPlanned || 1)) * 100);

    return (
        <div
            style={{ position: 'fixed', pointerEvents: 'none', transitionDuration: '200ms', top: pos.y + 10, left: pos.x + 10 }}
        >
            <div style={{ background: 'rgba(11,62,57,.9)', backdropFilter: 'blur(12px)', border: '1.4px solid #e4ddd1', borderColor: 'rgba(255,255,255,.2)', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,.12)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,.1)', paddingBottom: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <Target size={16} />
                    </div>
                    <div>
                        <p style={{ fontWeight: 700, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '-.025em' }}>Production Status</p>
                        <p style={{ fontWeight: 700, color: '#fff', fontFamily: '"JetBrains Mono",monospace' }}>{wo.id}</p>
                    </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Product</span>
                        <span style={{ color: '#fff', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.productName}</span>
                    </div>
                    <div style={{ marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Progress</span>
                            <span style={{ color: '#3fa294', fontWeight: 700 }}>{(progress || 0).toFixed(0)}%</span>
                        </div>
                        <div style={{ width: '100%', background: 'rgba(254,253,251,.1)', height: '4px', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#eef7f6', width: `${progress}%` }}></div>
                        </div>
                    </div>
                </div>

                <div style={{ background: 'rgba(254,253,251,.05)', borderRadius: '10px', padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '9999px', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}></div>
                    <span style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Tracking Live</span>
                </div>
            </div>
        </div>
    );
};

const WorkOrders: React.FC = () => {
    const { workOrders = [], boms = [], deleteWorkOrder, createWorkOrder, updateWorkOrder, updateWorkOrderStatus } = useProduction();
    const { customers = [], convertJobOrderToInvoice } = useSales();
    const { inventory = [] } = useInventory();
    const { notify, companyConfig } = useAuth();
    const { handlePreview } = useDocumentPreview();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [viewType, setViewType] = useState<'Kanban' | 'List'>('List');
    const [editingOrder, setEditingOrder] = useState<WorkOrder | undefined>(undefined);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [filterType, setFilterType] = useState<'all' | 'examination' | 'regular'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Advanced Options State
    const [showAdvancedMenu, setShowAdvancedMenu] = useState<string | null>(null);
    const [advancedMenuPos, setAdvancedMenuPos] = useState({ x: 0, y: 0 });

    const navigate = useNavigate();
    const location = useLocation();

    // Hover State
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
    const hoverTimerRef = useRef<any | null>(null);

    const [qcOrder, setQcOrder] = useState<WorkOrder | null>(null);

    useEffect(() => {
        if (location.state?.action === 'create') {
            if (location.state.customer) {
                setEditingOrder({ customerName: location.state.customer } as Partial<WorkOrder>);
            } else {
                setEditingOrder(undefined);
            }
            setIsModalOpen(true);
            window.history.replaceState({}, document.title);
        }
    }, [location]);

    const handleMouseEnter = (id: string, e: React.MouseEvent) => {
        const { clientX, clientY } = e;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoveredId(id);
            setHoverPos({ x: clientX, y: clientY });
        }, 2000);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (hoveredId) {
            setHoverPos({ x: e.clientX, y: e.clientY });
        }
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredId(null);
    };

    const handleConvertInvoice = async (wo: WorkOrder) => {
        if (!confirm(`Generate Sales Invoice for ${wo.customerName}?`)) return;
        try {
            // Find or create a price for this item
            const item = inventory.find(i => i.id === wo.productId);
            const price = item?.price || 0;

            const joWithItems = {
                ...wo,
                items: [{
                    id: wo.productId,
                    name: wo.productName,
                    quantity: wo.quantityCompleted || wo.quantityPlanned,
                    price: price,
                    cost: item?.cost || 0,
                    category: item?.category || 'General',
                    type: (item?.type || 'Product') as string,
                    unit: item?.unit || 'pcs',
                    compositeItems: item?.isComposite ? (boms.find(b => b.productId === item.id)?.components || []) : [],
                    sku: item?.sku || wo.productId,
                    minStockLevel: 0,
                    stock: 0
                }]
            };

            const invoiceId = await convertJobOrderToInvoice(joWithItems as unknown as Parameters<typeof convertJobOrderToInvoice>[0]);
            notify(`Invoice ${invoiceId} generated successfully.`, "success");
            navigate('/sales/invoices', { state: { action: 'view', id: invoiceId } });
        } catch (err: any) {
            notify(`Billing failed: ${err.message}`, "error");
        }
    };

    const handleDownloadPDF = async (wo: WorkOrder) => {
        try {
            notify("Preparing Work Order PDF...", "info");
            const enrichedWorkOrder = enrichDocumentCustomerData(wo, customers);
            const pdfData = mapToInvoiceData(enrichedWorkOrder, companyConfig, 'WORK_ORDER', boms, inventory);
            await initializePrimePdfFonts();
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            const blob = await pdf(<PrimeDocument type="WORK_ORDER" data={securedPdfData as Record<string, unknown>} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `WORK-ORDER-${wo.id}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
            notify("Work Order PDF downloaded successfully", "success");
        } catch (error) {
            logger.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    const handlePreviewPDF = (wo: WorkOrder) => {
        handlePreview('WORK_ORDER', wo, boms, inventory);
    };

    const handleSaveWorkOrder = (data: Partial<WorkOrder>) => {
        if (editingOrder) {
            updateWorkOrder({ ...editingOrder, ...data } as WorkOrder);
            notify("Work Order updated successfully", "success");
        } else {
            createWorkOrder({
                ...data,
                quantityCompleted: 0,
                logs: [],
                status: data.status || 'Draft'
            } as WorkOrder);
            notify("New Work Order created", "success");
        }
        setIsModalOpen(false);
        setEditingOrder(undefined);
    };

    const handleOpenCreate = () => {
        setEditingOrder(undefined);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (wo: WorkOrder) => {
        setEditingOrder(wo);
        setIsModalOpen(true);
    };

    const handleOpenAdvanced = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setAdvancedMenuPos({ x: e.clientX, y: e.clientY });
        setShowAdvancedMenu(id);
    };

    const handleAdvancedAction = (id: string, action: string, value?: any) => {
        const wo = workOrders.find(w => w.id === id);
        if (!wo) return;

        switch (action) {
            case 'set_status':
                updateWorkOrderStatus(id, value);
                notify(`Job status updated to ${value}`, "info");
                break;
            case 'set_priority':
                updateWorkOrder({ ...wo, priority: value as WorkOrder['priority'] });
                notify(`Priority set to ${value}`, "info");
                break;
            case 'extend_date':
                const newDate = new Date(wo.dueDate);
                newDate.setDate(newDate.getDate() + 7);
                updateWorkOrder({ ...wo, dueDate: newDate.toISOString() });
                notify("Delivery date extended by 7 days", "success");
                break;
            case 'delete':
                if (confirm("Delete this work order? This is permanent.")) {
                    deleteWorkOrder(id);
                    notify("Order removed.", "info");
                    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
                }
                break;
        }
        setShowAdvancedMenu(null);
    };

    const handleToggleSelectAll = () => {
        if (selectedIds.length === workOrders.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(workOrders.map(wo => wo.id));
        }
    };

    const handleToggleSelect = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleBatchDelete = async () => {
        if (selectedIds.length === 0) return;
        if (confirm(`Delete ${selectedIds.length} selected work orders? This is permanent.`)) {
            try {
                for (const id of selectedIds) {
                    await deleteWorkOrder(id);
                }
                notify(`${selectedIds.length} orders removed.`, "info");
                setSelectedIds([]);
            } catch (err: any) {
                notify(`Batch delete failed: ${err.message}`, "error");
            }
        }
    };

    const hoveredWO = useMemo(() => workOrders.find(w => w.id === hoveredId), [workOrders, hoveredId]);

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'Scheduled':
            case 'Planned':
                return 'bg-amber-50 text-amber-700 border-amber-100 shadow-[0_0_8px_rgba(251,191,36,0.15)]';
            case 'In Progress':
                return 'bg-blue-50 text-blue-700 border-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.2)] animate-pulse';
            case 'QA':
            case 'Verification':
                return 'bg-purple-50 text-purple-700 border-purple-100 shadow-[0_0_8px_rgba(168,85,247,0.15)]';
            case 'Completed':
            case 'Finished':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-[0_0_8px_rgba(16,185,129,0.15)]';
            case 'Cancelled':
                return 'bg-slate-100 text-slate-500 border-slate-200 opacity-60';
            default:
                return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    return (
        <div style={{ padding: '16px', marginLeft: 'auto', display: 'flex', flexDirection: 'column', fontWeight: 400 }}>
            {hoveredId && hoverPos && hoveredWO && <JobHoverCard pos={hoverPos} wo={hoveredWO} />}

            {isModalOpen && (
                <WorkOrderModal
                    boms={boms}
                    inventory={inventory}
                    onSave={handleSaveWorkOrder}
                    onClose={() => { setIsModalOpen(false); setEditingOrder(undefined); }}
                    initialData={editingOrder}
                />
            )}

            {qcOrder && (() => {
                const order = qcOrder;
                return (
                <QualityInspection
                    jobId={order.id}
                    jobName={order.productName || order.id}
                    open={true}
                    onClose={() => setQcOrder(null)}
                    onComplete={(results) => {
                        if (results.passed) updateWorkOrderStatus(order.id, 'Completed');
                        notify(results.passed ? 'QC Passed — work order completed' : 'QC Failed — issues recorded', results.passed ? 'success' : 'warning');
                        setQcOrder(null);
                    }}
                />
                );
            })()}

            {/* Advanced Options Popup Menu */}
            {showAdvancedMenu && (
                <>
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }} onClick={() => setShowAdvancedMenu(null)}></div>
                    <div
                        style={{ position: 'fixed', background: '#FEFDFB', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,.12)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', padding: '4px', transitionDuration: '100ms', left: Math.min(advancedMenuPos.x, window.innerWidth - 220), top: Math.min(advancedMenuPos.y, window.innerHeight - 300) }}
                    >
                        <div style={{ paddingLeft: '12px', paddingTop: '8px', borderStyle: 'solid', borderColor: '#e4ddd1', fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '12px', paddingBottom: '8px' }}>Advanced Protocols</div>
                        <div style={{ paddingTop: '4px', paddingBottom: '4px' }}>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_status', 'QA')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '8px' }}><RefreshCw size={14} /> Move to QA</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_status', 'In Progress')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '8px' }}><Play size={14} /> Force Resume</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'extend_date')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '8px' }}><Calendar size={14} /> Extend Due Date</button>
                        </div>
                        <div style={{ borderStyle: 'solid', borderColor: '#e4ddd1', paddingTop: '4px', paddingBottom: '4px' }}>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'set_priority', 'CRITICAL')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontWeight: 700, color: '#b5493f', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '8px' }}><AlertTriangle size={14} /> Mark Critical</button>
                            <button onClick={() => handleAdvancedAction(showAdvancedMenu, 'delete')} style={{ width: '100%', textAlign: 'left', paddingLeft: '16px', paddingTop: '8px', fontWeight: 700, color: '#5c6567', display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', paddingBottom: '8px' }}><Trash2 size={14} /> Terminate Order</button>
                        </div>
                    </div>
                </>
            )}

            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
                        <Target style={{ color: '#1f8577' }} /> Production Queue
                    </h1>
                    <p style={{ color: '#5c6567', marginTop: '2px' }}>Manufacturing pipeline control and logistics</p>
                </div>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Filter buttons for examination vs regular work orders */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                        onClick={() => setFilterType('all')} 
                        style={{
                            padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: filterType === 'all' ? teal[500] : paper,
                            color: filterType === 'all' ? '#fff' : inkSoft,
                            border: `1.4px solid ${filterType === 'all' ? teal[500] : hairline}`,
                            boxShadow: filterType === 'all' ? '0 4px 12px rgba(31,133,119,.12)' : '0 1px 2px rgba(0,0,0,.04)',
                            transition: 'all .15s ease', fontFamily: 'inherit'
                        }}
                    >
                        All
                    </button>
                    <button 
                        onClick={() => setFilterType('examination')} 
                        style={{
                            padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: filterType === 'examination' ? '#7c3aed' : paper,
                            color: filterType === 'examination' ? '#fff' : inkSoft,
                            border: `1.4px solid ${filterType === 'examination' ? '#7c3aed' : hairline}`,
                            boxShadow: filterType === 'examination' ? '0 4px 12px rgba(124,58,237,.12)' : '0 1px 2px rgba(0,0,0,.04)',
                            transition: 'all .15s ease', fontFamily: 'inherit'
                        }}
                    >
                        ðŸ“ Examination
                    </button>
                    <button 
                        onClick={() => setFilterType('regular')} 
                        style={{
                            padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                            background: filterType === 'regular' ? '#059669' : paper,
                            color: filterType === 'regular' ? '#fff' : inkSoft,
                            border: `1.4px solid ${filterType === 'regular' ? '#059669' : hairline}`,
                            boxShadow: filterType === 'regular' ? '0 4px 12px rgba(5,150,105,.12)' : '0 1px 2px rgba(0,0,0,.04)',
                            transition: 'all .15s ease', fontFamily: 'inherit'
                        }}
                    >
                        ðŸ­ Regular
                    </button>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search work orders..."
                            style={{ width: '176px', paddingLeft: '32px', paddingRight: '12px', paddingTop: '6px', background: 'rgba(254,253,251,.7)', backdropFilter: 'blur(8px)', border: '1.4px solid #e4ddd1', borderColor: 'rgba(255,255,255,.6)', borderRadius: '12px', color: '#23282A', paddingBottom: '6px' }}
                        />
                    </div>
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBatchDelete}
                            style={dangerBtn}
                        >
                            <Trash2 size={15} /> Delete ({selectedIds.length})
                        </button>
                    )}
                    <button
                        onClick={handleOpenCreate}
                        style={tealBtn}
                    >
                        <Plus size={15} /> Create New
                    </button>
                    <button
                        onClick={() => navigate('/production/shop-floor')}
                        style={ghostBtn}
                    >
                        <MonitorPlay size={15} /> Terminal View
                    </button>
                    <div style={{ display: 'flex', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '3px', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                        <button onClick={() => setViewType('List')} style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', background: viewType === 'List' ? teal[50] : 'transparent', color: viewType === 'List' ? teal[700] : inkSoft, transition: 'all .15s ease', display: 'flex', alignItems: 'center' }}><ListIcon size={15} /></button>
                        <button onClick={() => setViewType('Kanban')} style={{ padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: 'none', background: viewType === 'Kanban' ? teal[50] : 'transparent', color: viewType === 'Kanban' ? teal[700] : inkSoft, transition: 'all .15s ease', display: 'flex', alignItems: 'center' }}><LayoutGrid size={15} /></button>
                    </div>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
                {(() => {
                    // Filter work orders based on filterType
                    const filteredWorkOrders = workOrders.filter(wo => {
                        if (filterType !== 'all') {
                            const isExamination = wo.source === 'examination';
                            if (filterType === 'examination' ? !isExamination : isExamination) return false;
                        }
                        if (searchTerm.trim()) {
                            const q = searchTerm.trim().toLowerCase();
                            return (wo.id?.toLowerCase().includes(q) || false) ||
                                   (wo.productName?.toLowerCase().includes(q) || false) ||
                                   (wo.customerName?.toLowerCase().includes(q) || false) ||
                                   (wo.status?.toLowerCase().includes(q) || false) ||
                                   (wo.assignedTo?.toLowerCase().includes(q) || false);
                        }
                        return true;
                    });

                    if (viewType === 'Kanban') {
                        return (
                            <WorkOrderKanban
                                orders={filteredWorkOrders}
                                onUpdateStatus={(id, s) => updateWorkOrderStatus(id, s)}
                                onView={handleOpenEdit}
                                onPreview={handlePreviewPDF}
                                onConvertInvoice={handleConvertInvoice}
                            />
                        );
                    }

                    return (
                    <div style={{ background: 'rgba(254,253,251,.7)', backdropFilter: 'blur(20px)', borderRadius: '16px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: 'rgba(255,255,255,.6)', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', textAlign: 'left' }}>
                                <thead style={{ display: 'table', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 2px rgba(0,0,0,.05)', borderStyle: 'solid', borderColor: '#e4ddd1' }}>
                                    <tr>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', width: '40px', paddingRight: '16px', paddingBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                style={{ borderRadius: '6px', borderColor: '#e4ddd1', color: '#1f8577' }}
                                                checked={filteredWorkOrders.length > 0 && selectedIds.length === filteredWorkOrders.length}
                                                onChange={handleToggleSelectAll}
                                            />
                                        </th>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '16px', paddingBottom: '8px' }}>Order Specification</th>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '16px', paddingBottom: '8px' }}>Batch Target</th>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '16px', paddingBottom: '8px' }}>Delivery Due</th>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '16px', paddingBottom: '8px' }}>Current Phase</th>
                                        <th style={{ paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '-.025em', paddingRight: '16px', paddingBottom: '8px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody style={{ borderColor: '#e4ddd1' }}>
                                    {filteredWorkOrders.map(wo => {
                                        const isExamination = wo.source === 'examination';
                                        return (
                                        <tr
                                            key={wo.id}
                                            className={`hover:bg-blue-50/30 cursor-pointer transition-colors group ${isExamination ? 'bg-purple-50/30' : ''}`}
                                            onClick={() => handleOpenEdit(wo)}
                                            onMouseEnter={(e) => handleMouseEnter(wo.id, e)}
                                            onMouseMove={handleMouseMove}
                                            onMouseLeave={handleMouseLeave}
                                        >
                                            <td style={{ paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }} onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    style={{ borderRadius: '6px', borderColor: '#e4ddd1', color: '#1f8577' }}
                                                    checked={selectedIds.includes(wo.id)}
                                                    onChange={(e) => handleToggleSelect(wo.id, e)}
                                                />
                                            </td>
                                            <td style={{ display: 'table', paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ fontWeight: 700, color: '#23282A' }}>{wo.productName}</div>
                                                    {isExamination && (
                                                        <span style={{ paddingLeft: '8px', paddingTop: '2px', background: '#d3ece9', color: '#0f544c', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', paddingRight: '8px', paddingBottom: '2px' }}>
                                                            ðŸ“ Exam
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                                    {wo.attributes && Object.entries(wo.attributes).map(([key, value]) => {
                                                        if (key === 'variantId') return null;
                                                        const label = key === 'batch_number' ? 'Batch' : key;
                                                        return (
                                                            <span key={key} style={{ paddingLeft: '6px', paddingTop: '2px', background: '#eef7f6', color: '#5c6567', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', paddingRight: '6px', paddingBottom: '2px' }}>
                                                                {label}: {String(value)}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                    <span style={{ fontFamily: '"JetBrains Mono",monospace', color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>#{wo.id}</span>
                                                    <span style={{ color: '#5c6567' }}>â€¢</span>
                                                    <span style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>{isExamination 
                                                        ? (() => {
                                                            const customer = (customers || []).find(c => c.id === wo.customerId);
                                                            return customer?.name || wo.customerName || 'Unknown School';
                                                        })()
                                                        : (wo.customerName || 'Stock Build')
                                                    }</span>
                                                </div>
                                            </td>
                                            <td style={{ display: 'table', paddingLeft: '16px', paddingTop: '8px', textAlign: 'center', paddingRight: '16px', paddingBottom: '8px' }}>
                                                <div style={{ fontWeight: 700, color: '#23282A' }}>{wo.quantityCompleted || 0} / {wo.quantityPlanned || 0}</div>
                                                <div style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Units Logged</div>
                                            </td>
                                            <td style={{ display: 'table', paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                <div style={{ fontWeight: 700, color: '#23282A', textAlign: 'left' }}>{new Date(wo.dueDate).toLocaleDateString()}</div>
                                                <div style={{ color: '#5c6567', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Production Deadline</div>
                                            </td>
                                            <td style={{ display: 'table', paddingLeft: '16px', paddingTop: '8px', paddingRight: '16px', paddingBottom: '8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-widest w-fit ${wo.priority === 'Critical' ? 'bg-red-50 text-red-600 border-red-100' :
                                                        wo.priority === 'High' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            wo.priority === 'Low' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                                                                'bg-blue-50 text-blue-600 border-blue-100'
                                                        }`}>
                                                        {wo.priority || 'Normal'}
                                                    </span>
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-widest transition-all duration-300 w-fit ${getStatusStyles(wo.status)}`}>
                                                        {wo.status}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ display: 'table', paddingLeft: '16px', paddingTop: '8px', textAlign: 'right', paddingRight: '16px', paddingBottom: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', opacity: 0.0, transition: 'all .15s ease', transitionDuration: '200ms' }}>
                                                    {wo.status === 'Draft' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'Scheduled'); notify('Work order scheduled', 'info'); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Schedule"
                                                        >
                                                            <Calendar size={13} />
                                                        </button>
                                                    )}
                                                    {wo.status === 'Scheduled' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'In Progress'); notify('Production started', 'info'); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Start Production"
                                                        >
                                                            <Play size={13} fill="currentColor" />
                                                        </button>
                                                    )}
                                                    {wo.status === 'In Progress' && (
                                                        <>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'QA'); notify('Moved to Quality Assurance', 'info'); }}
                                                                style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                                title="Move to QA"
                                                            >
                                                                <ShieldCheck size={13} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'On Hold'); notify('Work order on hold', 'info'); }}
                                                                style={{ padding: '6px', background: '#fbead0', color: '#d99a3f', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#fbead0', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                                title="Put on Hold"
                                                            >
                                                                <PauseCircle size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {wo.status === 'On Hold' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'In Progress'); notify('Work order resumed', 'info'); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Resume Production"
                                                        >
                                                            <Play size={13} fill="currentColor" />
                                                        </button>
                                                    )}
                                                    {wo.status === 'QA' && (
                                                        <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setQcOrder(wo); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Quality Inspection"
                                                        >
                                                            <ShieldCheck size={13} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateWorkOrderStatus(wo.id, 'Completed'); notify('Work order completed', 'success'); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Complete Order"
                                                        >
                                                            <CheckSquare size={13} />
                                                        </button>
                                                        </>
                                                    )}
                                                    {wo.status !== 'Completed' && wo.status !== 'Cancelled' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); if (confirm('Cancel this work order?')) updateWorkOrderStatus(wo.id, 'Cancelled'); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#5c6567', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Cancel Job"
                                                        >
                                                            <XCircle size={13} />
                                                        </button>
                                                    )}
                                                    {wo.status === 'Completed' && !(wo.id as string)?.startsWith('WO-EXAM-') && !wo.linkedBatchId && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleConvertInvoice(wo); }}
                                                            style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                            title="Bill Customer"
                                                        >
                                                            <FileText size={13} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePreviewPDF(wo); }}
                                                        style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                        title="Preview PDF"
                                                    >
                                                        <Eye size={13} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDownloadPDF(wo); }}
                                                        style={{ padding: '6px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                        title="Download PDF"
                                                    >
                                                        <FileDown size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenEdit(wo);
                                                        }}
                                                        style={{ padding: '6px', background: '#eef7f6', color: '#5c6567', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                        title="View Work Order"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleOpenAdvanced(e, wo.id)}
                                                        style={{ padding: '6px', background: '#FEFDFB', color: '#5c6567', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', transition: 'all .15s ease' }}
                                                        title="More Options"
                                                    >
                                                        <Settings size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {filteredWorkOrders.length === 0 && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Target style={{ marginLeft: 'auto', height: '48px', width: '48px', color: '#5c6567' }} />
                                    <h3 style={{ marginTop: '16px', fontSize: '13px', fontWeight: 600, color: '#5c6567' }}>No work orders found</h3>
                                    <p style={{ marginTop: '8px', fontSize: '13px', color: '#5c6567' }}>
                                        {filterType === 'examination' 
                                            ? 'No examination work orders. Calculate an examination batch to create work orders.'
                                            : filterType === 'regular'
                                            ? 'No regular work orders found.'
                                            : 'Get started by creating a new work order.'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    );
                })()}
            </div>

        </div>
    );
};

export default WorkOrders;
