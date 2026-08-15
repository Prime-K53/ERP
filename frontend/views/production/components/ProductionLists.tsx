import React, { useState, useRef, useEffect } from 'react';
import { Eye, Trash2, Play, CheckCircle, Clock, AlertCircle, MoreHorizontal, Edit2, GripVertical, XCircle, FileText, Package, FileCheck, Recycle, ShieldCheck } from 'lucide-react';
import { BillOfMaterial, WorkOrder } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { OfflineImage } from '../../../components/OfflineImage';

// --- BOM LIST ---
interface BOMListProps {
    boms: BillOfMaterial[];
    onDelete: (id: string) => void;
    onEdit: (bom: BillOfMaterial) => void;
}

export const BOMList: React.FC<BOMListProps> = ({ boms, onDelete, onEdit }) => {
    const { companyConfig } = useAuth();
    const { inventory } = useInventory();
    const currency = companyConfig.currencySymbol;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {boms.map(bom => {
                const product = inventory.find(i => i.id === bom.productId);
                return (
                    <div key={bom.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button onClick={() => onEdit(bom)} className="p-1.5 bg-white/90 backdrop-blur text-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 shadow-sm border border-slate-200"><Edit2 size={14}/></button>
                            <button onClick={() => onDelete(bom.id)} className="p-1.5 bg-white/90 backdrop-blur text-slate-600 rounded hover:bg-red-50 hover:text-red-600 shadow-sm border border-slate-200"><Trash2 size={14}/></button>
                        </div>
                        <div className="p-5 border-b border-slate-50 flex items-start gap-4">
                            <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                <OfflineImage 
                                    src={product?.image} 
                                    alt={bom.productName} 
                                    className="w-full h-full object-cover"
                                    fallback={<div className="w-full h-full flex items-center justify-center text-slate-300 font-bold text-lg">{bom.productName.charAt(0)}</div>}
                                />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold text-slate-900 truncate text-[13px]" title={bom.productName}>{bom.productName}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-tight">{bom.id}</p>
                                    {bom.isParameterized && (
                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase tracking-tight border border-blue-100">Formula Engine</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="p-5 grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Materials</div>
                                <div className="text-[13px] font-bold text-slate-700 finance-nums">{bom.components.length} <span className="text-[10px] text-slate-400 uppercase tracking-tight">Items</span></div>
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Operations</div>
                                <div className="text-[13px] font-bold text-slate-700 finance-nums">{bom.operations?.length || 0} <span className="text-[10px] text-slate-400 uppercase tracking-tight">Steps</span></div>
                            </div>
                            <div className="col-span-2 pt-3 border-t border-slate-100 flex justify-between items-center">
                                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Est. Labor Cost</span>
                                <span className="font-bold text-emerald-600 text-[13px] finance-nums">{currency}{(bom.laborCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>
                    </div>
                );
            })}
            {boms.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <Package size={48} className="mx-auto mb-3 opacity-20"/>
                    <p className="text-sm font-medium">No Bill of Materials defined.</p>
                    <p className="text-xs mt-1">Create a recipe to start production.</p>
                </div>
            )}
        </div>
    );
};

// --- WORK ORDER KANBAN ---

interface WorkOrderKanbanProps {
    orders: WorkOrder[];
    onUpdateStatus: (id: string, status: WorkOrder['status']) => void;
    onView?: (wo: WorkOrder) => void;
    onPreview?: (wo: WorkOrder) => void;
    onCancel?: (wo: WorkOrder) => void;
    onDelete?: (id: string) => void;
    onConvertInvoice?: (wo: WorkOrder) => void;
}

// Context Menu Logic
const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{x: number, y: number} | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(id);
        const x = Math.min(e.clientX, window.innerWidth - 200);
        const y = Math.min(e.clientY, window.innerHeight - 150);
        setMenuPos({ x, y });
    };

    return { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId };
};

export const WorkOrderKanban: React.FC<WorkOrderKanbanProps> = ({ orders, onUpdateStatus, onView, onPreview, onCancel, onDelete, onConvertInvoice }) => {
    const { inventory } = useInventory();
    const columns: WorkOrder['status'][] = ['Scheduled', 'In Progress', 'On Hold', 'QA', 'Completed'];
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
    const { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId } = useContextMenu();

    const getColumnColor = (status: string) => {
        switch(status) {
            case 'Scheduled': return 'bg-amber-50/40 border-amber-100/50 shadow-inner';
            case 'In Progress': return 'bg-blue-50/40 border-blue-100/50 shadow-inner';
            case 'On Hold': return 'bg-orange-50/40 border-orange-100/50 shadow-inner';
            case 'QA': return 'bg-purple-50/40 border-purple-100/50 shadow-inner';
            case 'Completed': return 'bg-emerald-50/40 border-emerald-100/50 shadow-inner';
            default: return 'bg-slate-50';
        }
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, status: string) => {
        e.preventDefault();
        setDragOverColumn(status);
    };

    const handleDragLeave = () => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, status: WorkOrder['status']) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id && status) {
            onUpdateStatus(id, status);
        }
        setDraggedId(null);
        setDragOverColumn(null);
    };

    const currentOrder = orders.find(o => o.id === openMenuId);

    const renderMenu = (wo: WorkOrder) => {
        // Calculate optimal position to keep menu fully visible
        const menuWidth = 192; // w-48 = 192px
        const menuHeight = 300; // Estimated height for all menu items
        
        let x = menuPos!.x;
        let y = menuPos!.y;
        
        // Adjust horizontal position if menu would go off-screen
        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }
        
        // Adjust vertical position if menu would go off-screen
        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }
        
        return (
        <div 
            ref={menuRef}
            className="fixed w-48 bg-[#FEFDFB] rounded-[14px] shadow-[0_30px_70px_-20px_rgba(0,0,0,.55),0_8px_24px_-8px_rgba(0,0,0,.35),0_0_0_1px_rgba(255,255,255,.04)] border border-[#e4ddd1] z-[70] flex flex-col py-1 text-left text-sm animate-in fade-in zoom-in-95 duration-100 overflow-y-auto custom-scrollbar"
            style={{ top: y, left: x, maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-3 py-1.5 text-[10px] font-bold text-[#5c6567] uppercase tracking-[0.2em] border-b border-[#e4ddd1] bg-[#eef7f6] rounded-t-[14px]">Actions</div>
            <button onClick={() => { setOpenMenuId(null); if(onView) onView(wo); }} className="w-full px-3 py-2 hover:bg-[#eef7f6] hover:text-[#146b60] flex items-center gap-2 transition-all font-bold text-[#23282A] text-[13px]">
                <Edit2 size={14}/> Edit Order
            </button>
            {onPreview && (
                <button onClick={() => { setOpenMenuId(null); onPreview(wo); }} className="w-full px-3 py-2 hover:bg-[#eef7f6] hover:text-[#146b60] flex items-center gap-2 transition-all font-bold text-[#23282A] text-[13px]">
                    <Eye size={14}/> Preview PDF
                </button>
            )}
            {wo.status === 'Completed' && onConvertInvoice && (
                <button onClick={() => { setOpenMenuId(null); onConvertInvoice(wo); }} className="w-full px-3 py-2 hover:bg-[#eef7f6] hover:text-[#146b60] flex items-center gap-2 transition-all font-bold text-[#23282A] text-[13px]">
                    <FileCheck size={14}/> Convert to Invoice
                </button>
            )}
            {wo.status !== 'Cancelled' && wo.status !== 'Completed' && onCancel && (
                <button onClick={() => { setOpenMenuId(null); onCancel(wo); }} className="w-full px-3 py-2 hover:bg-[#eef7f6] hover:text-[#146b60] flex items-center gap-2 transition-all font-bold text-[#23282A] text-[13px]">
                    <XCircle size={14}/> Cancel Order
                </button>
            )}
            {onDelete && (
                <button onClick={() => { setOpenMenuId(null); onDelete(wo.id); }} className="w-full px-3 py-2 hover:bg-[#eef7f6] hover:text-[#146b60] flex items-center gap-2 transition-all border-t border-[#e4ddd1] font-bold text-[13px]">
                    <Trash2 size={14}/> Delete Order
                </button>
            )}
        </div>
    );
};

    return (
        <div className="flex gap-4 h-full overflow-x-auto pb-2">
            {openMenuId && menuPos && currentOrder && renderMenu(currentOrder)}
            {columns.map(status => (
                <div 
                    key={status} 
                    className={`flex-1 min-w-[300px] rounded-2xl border flex flex-col transition-all duration-200 ${getColumnColor(status)} ${dragOverColumn === status ? 'ring-2 ring-offset-2 ring-blue-400 bg-white' : ''}`}
                    onDragOver={(e) => handleDragOver(e, status)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, status)}
                >
                    <div className="p-4 font-bold text-slate-700 flex justify-between items-center bg-white/30 rounded-t-2xl backdrop-blur-sm">
                        <span className="text-[10px] uppercase tracking-tight">{status}</span>
                        <span className="bg-white px-2 py-0.5 rounded-lg text-[13px] shadow-sm font-bold text-slate-600 border border-slate-100 finance-nums">{orders.filter(o => o.status === status).length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {orders.filter(o => o.status === status).map(wo => {
                             const progress = Math.min(100, ((wo.quantityCompleted || 0) / (wo.quantityPlanned || 1)) * 100);
                             const product = inventory.find(i => i.id === wo.productId);
                             const hasWaste = (wo.quantityWaste || 0) > 0;
                             
                             return (
                                <div 
                                    key={wo.id} 
                                    className={`bg-white p-3 rounded-xl shadow-sm border border-slate-200/60 hover:shadow-float transition-all cursor-grab active:cursor-grabbing group relative overflow-hidden ${draggedId === wo.id ? 'opacity-50 scale-95' : 'opacity-100'}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, wo.id)}
                                    onClick={() => { if(onView) onView(wo); }}
                                    onContextMenu={(e) => handleContextMenu(e, wo.id)}
                                >
                                    <div className="flex gap-3">
                                        {/* Image Thumbnail */}
                                        <div className="w-10 h-10 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100 mt-1">
                                            <OfflineImage 
                                                src={product?.image} 
                                                alt={wo.productName} 
                                                className="w-full h-full object-cover"
                                            />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{(wo.id || '').split('-').slice(-2).join('-')}</span>
                                                <button 
                                                    onClick={(e) => handleContextMenu(e, wo.id)} 
                                                    className="text-slate-300 hover:text-slate-600 p-1 rounded hover:bg-slate-50 -mr-2 -mt-2"
                                                >
                                                    <MoreHorizontal size={16}/>
                                                </button>
                                            </div>
                                            
                                            <h4 className="font-bold text-slate-800 text-[13px] leading-tight mb-2 truncate">{wo.productName}</h4>
                                            
                                            <div className="flex justify-between items-end text-[13px] text-slate-500 mb-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Due Date</span>
                                                    <span className="finance-nums font-bold text-slate-600 text-[13px]">{new Date(wo.dueDate).toLocaleDateString()}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Production</span>
                                                    <span className="font-bold text-slate-700 finance-nums text-[13px]">{wo.quantityCompleted || 0} / {wo.quantityPlanned || 0}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full rounded-full transition-all duration-500 ${status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                                    style={{width: `${(progress || 0).toFixed(0)}%`}}
                                                ></div>
                                            </div>

                                            {hasWaste && (
                                                <div className="mt-2 flex items-center gap-1 text-[10px] text-red-600 font-bold bg-red-50 w-fit px-1.5 py-0.5 rounded border border-red-100">
                                                    <Recycle size={10}/> {wo.quantityWaste} Wasted
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Hover Actions */}
                                    <div className="absolute bottom-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                                        {onPreview && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); onPreview(wo); }}
                                                className="bg-white text-indigo-600 p-1.5 rounded-lg shadow-sm hover:bg-indigo-50 border border-slate-200 transition-all"
                                                title="Preview PDF"
                                            >
                                                <Eye size={12}/>
                                            </button>
                                        )}
                                        {status !== 'Completed' && status !== 'Cancelled' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (status !== 'Completed' && status !== 'Cancelled') {
                                                        onUpdateStatus(wo.id, 'Cancelled');
                                                    }
                                                }}
                                                className="bg-white text-slate-400 p-1.5 rounded-lg shadow-sm hover:bg-rose-50 hover:text-rose-600 border border-slate-200 transition-all"
                                                title="Cancel Job"
                                            >
                                                <XCircle size={12}/>
                                            </button>
                                        )}
                                        {status !== 'Completed' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const nextStatus = status === 'Scheduled' ? 'In Progress'
                                                        : status === 'In Progress' ? 'QA'
                                                        : status === 'QA' ? 'Completed'
                                                        : status;
                                                    onUpdateStatus(wo.id, nextStatus);
                                                }} 
                                                className={`${
                                                    status === 'Scheduled' ? 'bg-blue-600' : 
                                                    status === 'In Progress' ? 'bg-purple-600' :
                                                    status === 'QA' ? 'bg-emerald-600'
                                                    : 'bg-slate-600'
                                                } text-white p-1.5 rounded-lg shadow-md hover:scale-110 transition-all ring-2 ring-white`}
                                                title={`Move to ${status === 'Scheduled' ? 'In Progress' : status === 'In Progress' ? 'QA' : status === 'QA' ? 'Completed' : status}`}
                                            >
                                                {status === 'Scheduled' ? <Play size={12} fill="currentColor"/> : 
                                                 status === 'In Progress' ? <ShieldCheck size={12}/> :
                                                 status === 'QA' ? <CheckCircle size={12}/> :
                                                 <Play size={12} fill="currentColor"/>}
                                            </button>
                                        )}
                                        {status === 'In Progress' && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdateStatus(wo.id, 'On Hold');
                                                }}
                                                className="bg-white text-amber-600 p-1.5 rounded-lg shadow-sm hover:bg-amber-50 border border-amber-200 transition-all"
                                                title="Put on Hold"
                                            >
                                                <PauseCircle size={12}/>
                                            </button>
                                        )}
                                    </div>
                                </div>
                             )
                        })}
                        {orders.filter(o => o.status === status).length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl mx-2 bg-slate-50/50">
                                <span className="text-xs font-medium">No orders</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
