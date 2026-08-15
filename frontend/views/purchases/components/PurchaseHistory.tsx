import React, { useState, useRef, useEffect } from 'react';
import { logger } from '@/services/logger';
import { useLocation } from 'react-router-dom';
import { useHighlight } from '../../../hooks/useHighlight';
import { DocLink } from '../../../components/DocLink';
import { Package, CheckCircle, Eye, DollarSign, Trash2, ChevronRight, RefreshCw, Edit2, Layers, CheckSquare, Square, XCircle, FileText, Download, FileDown } from 'lucide-react';
import { Purchase } from '../../../types';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import { useAuth } from '../../../context/AuthContext';
import { useInventory } from '../../../context/InventoryContext';
import { WhatsAppLogo } from '../../../components/Icons';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import { OfflineImage } from '../../../components/OfflineImage';
import { mapToInvoiceData } from '../../../utils/pdfMapper';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { downloadBlob } from '../../../utils/helpers';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const paper = '#FEFDFB';
const hairline = '#e4ddd1';
const inkSoft = '#5c6567';
const ink = '#23282A';
const danger = '#b5493f';

interface PurchaseHistoryProps {
    purchases: Purchase[];
    suppliers: any[];
    onReceive: (id: string) => void;
    onView?: (purchase: Purchase) => void;
    onEdit: (purchase: Purchase) => void;
    onMerge: (ids: string[]) => void;
    onBatchDelete: (ids: string[]) => void;
    onPayment?: (purchase: Purchase) => void;
}

const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
                setActiveSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).closest('.relative');
        if (container) {
            const rect = container.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            if (x + 256 > rect.width) x = rect.width - 256 - 10;
            if (y + 350 > rect.height) y = rect.height - 350 - 10;
            setMenuPos({ x: Math.max(10, x), y: Math.max(10, y) });
        } else {
            setMenuPos({ x: e.clientX, y: e.clientY });
        }
        setOpenMenuId(id);
        setActiveSubmenu(null);
    };

    const handleRowClick = (e: React.MouseEvent, id: string) => {
        if (openMenuId === id) { setOpenMenuId(null); setActiveSubmenu(null); }
        else {
            const container = (e.currentTarget as HTMLElement).closest('.relative');
            if (container) {
                const rect = container.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;
                if (x + 256 > rect.width) x = rect.width - 256 - 10;
                if (y + 350 > rect.height) y = rect.height - 350 - 10;
                setMenuPos({ x: Math.max(10, x), y: Math.max(10, y) });
            } else { setMenuPos({ x: e.clientX, y: e.clientY }); }
            setOpenMenuId(id);
            setActiveSubmenu(null);
        }
    };

    return { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId };
};

const STATUS_COLORS: Record<string,string> = {
    'Received': `background:${teal[100]};color:${teal[700]};border:1px solid ${teal[200]}`,
    'Partially Received': `background:#fef3cd;color:#92620a;border:1px solid #eec27a`,
    'Ordered': `background:${teal[50]};color:${teal[600]};border:1px solid ${teal[200]}`,
    'Pending Approval': `background:#fbead0;color:#b97e2b;border:1px solid #eec27a`,
    'Draft': `background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1`,
    'Closed': `background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1`,
    'Cancelled': `background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1;text-decoration:line-through`,
};

const PAY_COLORS: Record<string,string> = {
    'Paid': `background:${teal[50]};color:${teal[700]};border:1px solid ${teal[200]}`,
    'Partial': `background:#fef3cd;color:#92620a;border:1px solid #eec27a`,
    'Cancelled': `background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1;text-decoration:line-through`,
};

export const PurchaseHistory: React.FC<PurchaseHistoryProps> = ({ purchases, suppliers, onReceive, onView, onEdit, onMerge, onBatchDelete, onPayment }) => {
    const { companyConfig, notify } = useAuth(); const { updatePurchase, inventory } = useInventory();
    const { handlePreview } = useDocumentPreview();
    const currency = companyConfig.currencySymbol;
    const location = useLocation();
    useHighlight();

    const { openMenuId, menuPos, activeSubmenu, setActiveSubmenu, menuRef, handleContextMenu, handleRowClick, setOpenMenuId } = useContextMenu();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [adminPasswordModal, setAdminPasswordModal] = useState({
      open: false,
      po: null as Purchase | null,
    });
    const [adminPasswordInput, setAdminPasswordInput] = useState('');

    const { currentItems, currentPage, maxPage, totalItems, next, prev, first, last, setItemsPerPage, itemsPerPage } = usePagination(purchases, 15);

    const enrichPO = (po: Purchase) => {
        const supplier = (suppliers || []).find(s => s.id === po.supplierId) || (suppliers || []).find(s => s.name === po.supplierId);
        return {
            ...po,
            supplierName: supplier?.name || po.supplierId,
            vendorName: supplier?.name || po.supplierId,
            vendorAddress: supplier?.address,
            vendorPhone: supplier?.phone,
            address: supplier?.address,
            phone: supplier?.phone,
            clientName: supplier?.name || po.supplierId
        };
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleMergeClick = () => {
        onMerge(selectedIds);
        setSelectedIds([]);
    };

    const handleDownloadPDF = async (po: Purchase) => {
        try {
            notify("Preparing Purchase Order PDF...", "info");
            const enriched = enrichPO(po);
            const pdfData = mapToInvoiceData(enriched, companyConfig, 'PO');
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="PO" data={securedPdfData} />).toBlob();
            const poNumber = po.poNumber || po.id || '';
            const fileName = poNumber ? `Purchase Order - ${poNumber}.pdf` : `Purchase Order.pdf`;
            downloadBlob(blob, fileName);
            notify("Purchase Order PDF downloaded successfully", "success");
        } catch (error) {
            logger.error("PDF generation failed:", error);
            notify("Failed to generate PDF", "error");
        }
    };

    const handleAction = async (action: string, po: Purchase, extra?: string) => {
        if (action !== 'toggle_status_menu') { setOpenMenuId(null); }
        switch (action) {
            case 'view': if (onView) onView(po); break;
            case 'edit': onEdit(po); break;
            case 'whatsapp':
                const supplier = (suppliers || []).find(s => s.id === po.supplierId);
                if (supplier?.contact) {
                    const phone = supplier.contact.replace(/\D/g, '');
                    const msg = `Hello, regarding Purchase Order ${po.id}...`;
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
                } else { notify("Supplier phone number not available", "error"); }
                break;
            case 'change_status':
                if (extra) {
                    const updated: Partial<Purchase> = { status: extra };
                    if (extra === 'Cancelled') { updated.paymentStatus = 'Cancelled'; }
                    updatePurchase({ ...po, ...updated });
                    notify(`Bill status changed to ${extra}`, 'success');
                }
                break;
            case 'delete':
                if (po.paymentStatus === 'Paid' || po.paymentStatus === 'Partial' || (po.paidAmount || 0) > 0) {
                    setAdminPasswordInput('');
                    setAdminPasswordModal({ open: true, po });
                    return;
                }
                if (confirm("Cancel this Bill? This will mark both the order and payment status as Cancelled.")) {
                    updatePurchase({ ...po, status: 'Cancelled', paymentStatus: 'Cancelled' });
                    notify("Bill Cancelled", "success");
                }
                break;
            case 'download_pdf': handleDownloadPDF(po); break;
        }
    };

    const currentPO = (purchases || []).find(p => p.id === openMenuId);

    const renderMenu = (po: Purchase) => {
        const menuWidth = 256;
        const menuHeight = 500;
        const submenuWidth = 192;
        let x = menuPos?.x || 0;
        let y = menuPos?.y || 0;
        if (x + menuWidth + submenuWidth > window.innerWidth) x = Math.max(0, window.innerWidth - menuWidth - submenuWidth);
        if (y + menuHeight > window.innerHeight) y = Math.max(0, window.innerHeight - menuHeight);

        const miStyle = (color: string, hoverBg: string): React.CSSProperties => ({
            width:'100%',textAlign:'left',padding:'10px 16px',fontSize:13,fontWeight:600,color,
            display:'flex',alignItems:'center',gap:10,cursor:'pointer',border:'none',background:'transparent',
            transition:'background .12s ease',fontFamily:"'Inter','DM Sans',sans-serif"
        });
        return (
        <div ref={menuRef}
            style={{position:'fixed',width:256,background:paper,border:`1.4px solid ${teal[200]}`,borderRadius:14,boxShadow:'0 20px 50px -16px rgba(0,0,0,.2)',zIndex:70,top:y,left:x,overflowY:'auto',maxHeight:'90vh',display:'flex',flexDirection:'column',padding:'6px 0'}}
            onClick={(e)=>e.stopPropagation()}>
            <div style={{padding:'10px 16px',borderBottom:`1px solid ${teal[100]}`,fontSize:10,fontWeight:700,color:inkSoft,textTransform:'uppercase',letterSpacing:'.08em',fontFamily:"'Inter','DM Sans',sans-serif"}}>PURCHASE ACTIONS</div>
            <button onClick={()=>{setOpenMenuId(null);handlePreview('PO',enrichPO(po))}} style={{...miStyle(teal[600],teal[50])}} onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Eye size={14}/> Preview Purchase Order</button>
            <div style={{height:1,background:teal[100],margin:'4px 0'}}/>
            <button onClick={()=>handleAction('view',po)} style={{...miStyle(ink,'#f5f4f0')}} onMouseEnter={e=>e.currentTarget.style.background='#f5f4f0'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><FileText size={14}/> View Details</button>
            <button onClick={()=>handleAction('download_pdf',po)} style={{...miStyle(teal[600],teal[50])}} onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><FileDown size={14}/> Download PDF</button>
            {po.paymentStatus !== 'Paid' && po.status !== 'Draft' && po.status !== 'Cancelled' && onPayment && (
                <button onClick={()=>{setOpenMenuId(null);onPayment(po)}} style={{...miStyle(teal[600],teal[50])}} onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><DollarSign size={14}/> Record Payment</button>
            )}
            {(po.status==='Draft'||po.status==='Ordered')&&(
                <button onClick={()=>handleAction('edit',po)} style={{...miStyle('#92620a','#fef3cd')}} onMouseEnter={e=>e.currentTarget.style.background='#fef3cd'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Edit2 size={14}/> Edit Bill</button>
            )}
            <button onClick={()=>handleAction('whatsapp',po)} style={{...miStyle(ink,'#f5f4f0')}} onMouseEnter={e=>e.currentTarget.style.background='#f5f4f0'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><WhatsAppLogo size={14}/> Send via WhatsApp</button>
            <div style={{position:'relative'}}>
                <button onClick={()=>setActiveSubmenu(activeSubmenu==='status'?null:'status')} style={{...miStyle(ink,'#f5f4f0'),justifyContent:'space-between'}} onMouseEnter={e=>e.currentTarget.style.background='#f5f4f0'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{display:'flex',alignItems:'center',gap:10}}><RefreshCw size={14}/> Change Status</span><ChevronRight size={12}/>
                </button>
                {activeSubmenu==='status'&&(
                    <div style={{position:'absolute',left:'100%',top:0,marginLeft:4,width:192,background:paper,border:`1.4px solid ${teal[200]}`,borderRadius:12,boxShadow:'0 10px 30px -10px rgba(0,0,0,.15)',padding:'4px 0',overflow:'hidden'}}>
                        {['Draft','Ordered','Received','Closed','Cancelled'].map(status=>(
                            <button key={status} onClick={()=>handleAction('change_status',po,status)}
                                style={{width:'100%',padding:'9px 16px',textAlign:'left',fontSize:12,fontWeight:600,color:ink,cursor:'pointer',border:'none',background:'transparent',transition:'background .12s',display:'block',fontFamily:"'Inter','DM Sans',sans-serif"}}
                                onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                <span style={{fontWeight:po.status===status?700:400,color:po.status===status?teal[600]:ink}}>{status}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div style={{height:1,background:teal[100],margin:'4px 0'}}/>
            <button onClick={()=>handleAction('delete',po)} style={{...miStyle(danger,'#fde8e7')}} onMouseEnter={e=>e.currentTarget.style.background='#fde8e7'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Trash2 size={14}/> Cancel Bill</button>
        </div>
    );
    };

    const rowBg = (idx: number, isSelected: boolean, isMenuOpen: boolean): React.CSSProperties => ({
        background: isSelected ? teal[50] : isMenuOpen ? teal[50] : idx%2===0 ? 'transparent' : '#fafaf7',
        transition:'background .12s ease',cursor:'pointer'
    });

    return (
        <>
        <div style={{background:paper,border:`1.4px solid ${teal[200]}`,borderRadius:14,flex:1,position:'relative',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 2px 10px rgba(0,0,0,.06)'}}>
            <style>{`.phist-scrollbar::-webkit-scrollbar{width:5px}.phist-scrollbar::-webkit-scrollbar-track{background:transparent}.phist-scrollbar::-webkit-scrollbar-thumb{background:${teal[200]};border-radius:3px}.phist-scrollbar::-webkit-scrollbar-thumb:hover{background:${teal[300]}}`}</style>
            {/* Selection bar */}
            {selectedIds.length > 0 && (
                <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:20,background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,backdropFilter:'blur(12px)',color:'#fff',padding:'9px 20px',borderRadius:999,boxShadow:`0 8px 24px -8px rgba(15,84,76,.5)`,display:'flex',alignItems:'center',gap:14,border:`1px solid ${teal[400]}`}}>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{selectedIds.length} selected</span>
                    {selectedIds.length > 1 && (
                        <button onClick={handleMergeClick} style={{background:'rgba(255,255,255,.18)',border:'none',borderRadius:8,padding:'6px 12px',color:'#fff',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:10,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,letterSpacing:'.04em',textTransform:'uppercase',transition:'all .12s ease'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.28)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.18)'}><Layers size={12}/> Merge Bills</button>
                    )}
                    <button onClick={()=>{onBatchDelete(selectedIds);setSelectedIds([])}} style={{background:'rgba(181,73,63,.45)',border:'none',borderRadius:8,padding:'6px 12px',color:'#fff',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:10,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,letterSpacing:'.04em',textTransform:'uppercase',transition:'all .12s ease'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(181,73,63,.65)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(181,73,63,.45)'}><Trash2 size={12}/> Delete</button>
                </div>
            )}

            {openMenuId && menuPos && currentPO && renderMenu(currentPO)}

            <div className="phist-scrollbar" style={{flex:1,overflowY:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
                    <thead>
                        <tr style={{position:'sticky',top:0,zIndex:10,background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`,borderBottom:`1.4px solid ${teal[100]}`}}>
                            <th style={{padding:'10px 12px',textAlign:'center',width:44}}>
                                <button onClick={()=>setSelectedIds(selectedIds.length===currentItems.length?[]:currentItems.map(p=>p.id))} style={{border:'none',background:'transparent',cursor:'pointer',color:inkSoft,display:'inline-flex',transition:'color .12s'}} onMouseEnter={e=>e.currentTarget.style.color=teal[600]} onMouseLeave={e=>e.currentTarget.style.color=inkSoft}>
                                    {selectedIds.length>0&&selectedIds.length===currentItems.length?<CheckSquare size={16} style={{color:teal[500]}}/>:<Square size={16}/>}
                                </button>
                            </th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',width:56}}>Item</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Bill #</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Date</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Supplier</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Vendor Ref</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Due Date</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'right'}}>Total</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center'}}>Payment</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center'}}>Status</th>
                            <th style={{padding:'10px 12px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'right'}}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(currentItems||[]).length===0&&<tr><td colSpan={11} style={{padding:32,textAlign:'center',color:inkSoft,fontWeight:600}}>No bills found.</td></tr>}
                        {currentItems.map((po,idx)=>{
                            const isSelected=selectedIds.includes(po.id);
                            const firstItem=po.items&&po.items[0];
                            const product=firstItem?(inventory||[]).find(i=>i.id===firstItem.itemId):null;
                            const isOverdue=po.dueDate&&new Date(po.dueDate)<new Date()&&po.paymentStatus!=='Paid';
                            return (
                            <tr key={po.id} id={`bill-${po.id}`}
                                style={rowBg(idx,isSelected,openMenuId===po.id)}
                                onContextMenu={(e)=>handleContextMenu(e,po.id)} onClick={(e)=>handleRowClick(e,po.id)}>
                                <td style={{padding:'9px 12px',textAlign:'center'}} onClick={(e)=>e.stopPropagation()}>
                                    <button onClick={()=>handleToggleSelect(po.id)} style={{border:'none',background:'transparent',cursor:'pointer',color:inkSoft,display:'inline-flex',transition:'color .12s'}} onMouseEnter={e=>e.currentTarget.style.color=teal[600]} onMouseLeave={e=>e.currentTarget.style.color=inkSoft}>
                                        {isSelected?<CheckSquare size={16} style={{color:teal[500]}}/>:<Square size={16}/>}
                                    </button>
                                </td>
                                <td style={{padding:'9px 12px'}}>
                                    <div style={{width:38,height:38,borderRadius:10,background:teal[50],border:`1px solid ${teal[100]}`,overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                        <OfflineImage src={product?.image} alt={firstItem?.name||'Item'} style={{width:'100%',height:'100%',objectFit:'cover'}} fallback={<Package size={16} style={{color:teal[200]}}/>} />
                                    </div>
                                </td>
                                <td style={{padding:'9px 12px',fontWeight:700,fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,color:teal[700]}}>
                                    <DocLink docNumber={po.id} targetPage="/procurement/bills" rowId={`bill-${po.id}`} currentPage={location.pathname} />
                                </td>
                                <td style={{padding:'9px 12px',fontSize:12.5,color:inkSoft,fontFamily:"'JetBrains Mono',monospace"}}>{new Date(po.date).toLocaleDateString()}</td>
                                <td style={{padding:'9px 12px',fontWeight:600,fontSize:13,color:ink}}>{(suppliers||[]).find(s=>s.id===po.supplierId)?.name||po.supplierId}</td>
                                <td style={{padding:'9px 12px',fontSize:11,color:inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>{po.reference||'-'}</td>
                                <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:12.5,color:isOverdue?'#b5493f':inkSoft}}>
                                    {po.dueDate?new Date(po.dueDate).toLocaleDateString():'-'}
                                </td>
                                <td style={{padding:'9px 12px',textAlign:'right',fontWeight:700,color:ink,fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{currency}{(po.total||0).toFixed(2)}</td>
                                <td style={{padding:'9px 12px',textAlign:'center'}}>
                                    <span style={{display:'inline-block',padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',...(po.paymentStatus==='Paid'?(PAY_COLORS['Paid']):po.paymentStatus==='Partial'?(PAY_COLORS['Partial']):po.paymentStatus==='Cancelled'?(PAY_COLORS['Cancelled']):`background:#fdf2f2;color:${danger};border:1px solid #f5c6c6`)}}>
                                        {po.paymentStatus||'Unpaid'}
                                    </span>
                                </td>
                                <td style={{padding:'9px 12px',textAlign:'center'}}>
                                    <span style={{display:'inline-block',padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',...(STATUS_COLORS[po.status]||STATUS_COLORS['Draft'])}}>
                                        {po.status}
                                    </span>
                                </td>
                                <td style={{padding:'9px 12px',textAlign:'right',position:'relative'}}>
                                    <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                                        <button onClick={(e)=>{e.stopPropagation();handlePreview('PO',enrichPO(po))}} style={{padding:7,borderRadius:9,border:`1px solid ${teal[100]}`,background:teal[50],color:teal[600],cursor:'pointer',display:'inline-flex',transition:'all .12s ease'}} onMouseEnter={e=>{e.currentTarget.style.background=teal[100];e.currentTarget.style.borderColor=teal[300]}} onMouseLeave={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.borderColor=teal[100]}} title="Preview PDF"><Eye size={15}/></button>
                                        <button onClick={(e)=>{e.stopPropagation();handleDownloadPDF(po)}} style={{padding:7,borderRadius:9,border:`1px solid ${hairline}`,background:paper,color:inkSoft,cursor:'pointer',display:'inline-flex',transition:'all .12s ease'}} onMouseEnter={e=>{e.currentTarget.style.background='#f5f4f0';e.currentTarget.style.borderColor='#d4cdc2'}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.borderColor=hairline}} title="Download PDF"><FileDown size={15}/></button>
                                        {(po.status==='Ordered'||po.status==='Partially Received'||po.status==='Draft')?(
                                            <button onClick={(e)=>{e.stopPropagation();onReceive(po.id)}} style={{padding:'5px 12px',borderRadius:9,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,transition:'all .12s ease',...(po.status==='Draft'?({background:'#f5f4f0',color:'#5c6567',border:`1px solid ${hairline}`}):({background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',border:'none',boxShadow:'0 4px 10px -4px rgba(15,84,76,.5)'}))}} onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)'}} title={po.status==='Draft'?'Process Draft':'Receive Items'}>
                                                <Package size={12}/> {po.status==='Draft'?'Process':'Receive'}
                                            </button>
                                        ):po.status==='Cancelled'?(
                                            <span style={{fontSize:10,fontWeight:700,color:inkSoft,display:'inline-flex',alignItems:'center',gap:4,textDecoration:'line-through'}}><XCircle size={12}/> Cancelled</span>
                                        ):(
                                            <span style={{fontSize:10,fontWeight:700,color:teal[600],display:'inline-flex',alignItems:'center',gap:4,letterSpacing:'.03em',textTransform:'uppercase'}}><CheckCircle size={12}/> Done</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
            </div>
            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} onFirst={first} onLast={last} onItemsPerPageChange={setItemsPerPage} />
        </div>

        {adminPasswordModal.open && (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setAdminPasswordModal({ open: false, po: null });
                    }
                }}
            >
                <div className="w-full max-w-md animate-in zoom-in-95 duration-200" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between py-4 px-6 border-b border-slate-100">
                            <h2 className="text-lg font-semibold text-slate-800">Admin Verification</h2>
                            <button
                                onClick={() => setAdminPasswordModal({ open: false, po: null })}
                                className="text-slate-400 hover:text-slate-600 transition-colors text-xl font-bold"
                                type="button"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="px-6 py-5">
                            <p className="text-sm text-slate-600 leading-relaxed mb-4">
                                This bill has payments. Enter Admin Password to cancel:
                            </p>
                            <input
                                type="password"
                                value={adminPasswordInput}
                                onChange={(e) => setAdminPasswordInput(e.target.value)}
                                placeholder="Enter admin password..."
                                className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
                                autoFocus
                            />
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                onClick={() => setAdminPasswordModal({ open: false, po: null })}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all"
                                type="button"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (adminPasswordInput !== 'password') {
                                        notify("Incorrect Password. Action Cancelled.", "error");
                                        setAdminPasswordModal({ open: false, po: null });
                                        return;
                                    }
                                    setAdminPasswordModal({ open: false, po: null });
                                    const po = adminPasswordModal.po;
                                    if (po && confirm("Cancel this Bill? This will mark both the order and payment status as Cancelled.")) {
                                        updatePurchase({ ...po, status: 'Cancelled', paymentStatus: 'Cancelled' });
                                        notify("Bill Cancelled", "success");
                                    }
                                }}
                                disabled={!adminPasswordInput.trim()}
                                className="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                type="button"
                            >
                                Verify & Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};
