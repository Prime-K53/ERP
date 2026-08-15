import React, { useState, useMemo, useRef } from 'react';
import { logger } from '@/services/logger';
import { X, FileText, Package, Ship, Landmark, ChevronRight, History as LucideHistory, Printer, Building2, Eye, Loader2, Download } from 'lucide-react';
import { Purchase, LandingCostItem } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useInventory } from '../../../context/InventoryContext';
import { OfflineImage } from '../../../components/OfflineImage';
import { pdf } from '@react-pdf/renderer';
import { PrimeDocument } from '../../shared/components/PDF/PrimeDocument';
import { initializePrimePdfFonts } from '../../shared/components/PDF/templateSettings';
import LandingCostAllocation from './LandingCostAllocation';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { mapToInvoiceData } from '../../../utils/pdfMapper';
import { attachDocumentSecurity } from '../../../utils/documentSecurity';
import AIDocumentSummarizer from '../../../components/ai/AIDocumentSummarizer';
import { useLocation } from 'react-router-dom';
import DocLink from '../../../components/DocLink';
import { ConfirmDialog, ConfirmDialogType } from '../../../components/ConfirmDialog';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const hairline = '#e4ddd1';

const getStatusColor = (status: string): string => {
    switch (status) {
        case 'Received': return `background:${teal[50]};color:${teal[700]};border:1px solid ${teal[200]}`;
        case 'Partially Received': return 'background:#fef3cd;color:#92620a;border:1px solid #eec27a';
        case 'Ordered': return `background:${teal[100]};color:${teal[800]};border:1px solid ${teal[200]}`;
        case 'Pending Approval': return 'background:#fbead0;color:#b97e2b;border:1px solid #eec27a';
        case 'Draft': return 'background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1';
        case 'Closed': return 'background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1';
        case 'Cancelled': return 'background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1';
        default: return 'background:#f5f4f0;color:#5c6567';
    }
};

interface PurchaseOrderDetailProps {
    purchase: Purchase;
    suppliers: any[];
    onClose: () => void;
    onReceive: (id: string) => void;
    onConvert: (id: string) => void;
    onPayment?: (purchase: Purchase) => void;
}

const PurchaseOrderDetail: React.FC<PurchaseOrderDetailProps> = ({ purchase, suppliers, onClose, onReceive, onConvert, onPayment }) => {
    const { companyConfig, notify } = useAuth();
    const { updatePurchase, goodsReceipts, inventory } = useInventory();
    const { expenses } = useFinance();
    const { handlePreview } = useDocumentPreview();
    const location = useLocation();
    const currency = companyConfig.currencySymbol;
    const [activeTab, setActiveTab] = useState<'Overview' | 'Landing' | 'Related'>('Overview');
    const contentRef = useRef<HTMLDivElement>(null);

    const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

    const purchaseWithVendor = useMemo(() => {
        const supplier = (suppliers || []).find(s => s.id === purchase.supplierId) || (suppliers || []).find(s => s.name === purchase.supplierId);
        return { ...purchase, supplierName: supplier?.name || purchase.supplierId, vendorName: supplier?.name || purchase.supplierId, vendorAddress: supplier?.address, vendorPhone: supplier?.phone, address: supplier?.address, phone: supplier?.phone, clientName: supplier?.name || purchase.supplierId };
    }, [purchase, suppliers]);

    const linkedDocs = useMemo(() => {
        const docs = [];
        const linkedBills = (expenses || []).filter(e => e.referenceId === purchase.id || (e.description && e.description.includes(purchase.id)));
        linkedBills.forEach(b => docs.push({ type: 'Bill / Expense', id: b.id, date: b.date, status: 'Posted' }));
        const grns = (goodsReceipts || []).filter(g => g.purchaseOrderId === purchase.id);
        grns.forEach(g => docs.push({ type: 'Goods Receipt', id: g.id, date: g.date, status: 'Received' }));
        return docs;
    }, [purchase, expenses, goodsReceipts]);

    const landingTotal = (purchase.landingCosts || []).reduce((s, c) => s + (c.amount || 0), 0);
    const isPaid = purchase.paymentStatus === 'Paid';

    const handleUpdateLandingCosts = (costs: LandingCostItem[]) => { updatePurchase({ ...purchase, landingCosts: costs }); };
    const handleEmail = () => { notify(`Email functionality for vendors is currently being updated.`, "info"); };
    const handleCancel = () => {
        setConfirmState({ open:true,title:'Cancel Order',message:'Are you sure you want to cancel this order?',type:'danger',confirmText:'Cancel Order',onConfirm:()=>{ updatePurchase({...purchase,status:'Cancelled'}); onClose(); }});
    };
    const handlePrint = () => { window.print(); };
    const handleDownloadPDF = async () => {
        try {
            notify("Preparing Purchase Order PDF...", "info");
            const pdfData = mapToInvoiceData(purchaseWithVendor, companyConfig, 'PO');
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<PrimeDocument type="PO" data={securedPdfData} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a'); link.href = url; link.download = `PURCHASE-ORDER-${purchase.id}.pdf`; link.click();
            URL.revokeObjectURL(url); notify("Purchase Order PDF downloaded successfully", "success");
        } catch (error) { logger.error("PDF generation failed:", error); notify("Failed to generate PDF", "error"); }
    };
    const handleConvertToBill = () => {
        setConfirmState({ open:true,title:'Convert to Bill',message:'Convert this Purchase Order into a Bill/Expense? This will verify the PO as closed and create a payable record.',type:'info',confirmText:'Convert',onConfirm:()=>{ onConvert(purchase.id); }});
    };
    const handleConfirmClose = () => { setConfirmState(c=>({...c,open:false})); };

    const printStyles = `
        @media print {
            body * { visibility: hidden; }
            #po-printable, #po-printable * { visibility: visible; }
            #po-printable { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background: white; }
            @page { margin: 0; }
        }
    `;

    const btnGhost:React.CSSProperties={padding:'9px 18px',borderRadius:9,border:`1.4px solid ${hairline}`,background:paper,color:'#5c6567',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',transition:'all .15s ease',display:'inline-flex',alignItems:'center',gap:6};
    const btnPrimary:React.CSSProperties={background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:9,padding:'9px 22px',border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease'};

    return (
        <div style={{position:'fixed',inset:0,zIndex:70,background:'rgba(11,10,8,.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
            <style>{printStyles}</style>

            <div style={{width:'100%',maxWidth:1100,maxHeight:'92vh',background:paper,borderRadius:16,boxShadow:'0 30px 70px -20px rgba(0,0,0,.55),0 8px 24px -8px rgba(0,0,0,.35)',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',border:`1.4px solid ${teal[200]}`}}>
                {/* Accent stripe */}
                <div style={{position:'absolute',top:0,left:0,right:0,height:4,background:`linear-gradient(90deg,${teal[600]},${teal[400]} 40%,#d99a3f 100%)`}} />

                {/* Header */}
                <div style={{padding:'20px 28px 16px',borderBottom:`1px solid ${hairline}`,background:paper,display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                    <div>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                            <h1 style={{fontFamily:"'DM Serif Display','Georgia',serif",fontWeight:400,fontSize:20,color:teal[800],margin:0,letterSpacing:'.2',textTransform:'uppercase'}}>Purchase Order #{purchase.id}</h1>
                            <span style={{display:'inline-block',padding:'4px 12px',borderRadius:999,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',...(getStatusColor(purchase.status))}}>{purchase.status}</span>
                        </div>
                        <div style={{fontSize:11,fontWeight:600,color:inkSoft,display:'flex',alignItems:'center',gap:10,letterSpacing:'.02em'}}>
                            <span style={{color:ink,fontWeight:700}}>{purchase.supplierId||'Unknown Vendor'}</span>
                            <span style={{color:teal[300]}}>•</span>
                            <span>{new Date(purchase.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>{onClose();handlePreview('PO',purchaseWithVendor);}} style={{padding:9,borderRadius:10,border:`1px solid ${teal[100]}`,background:teal[50],color:teal[600],cursor:'pointer',display:'inline-flex',transition:'all .12s ease'}} onMouseEnter={e=>{e.currentTarget.style.background=teal[100];e.currentTarget.style.borderColor=teal[300]}} onMouseLeave={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.borderColor=teal[100]}} title="Preview PDF"><Eye size={19}/></button>
                        <button onClick={handleDownloadPDF} style={{padding:9,borderRadius:10,border:`1px solid ${hairline}`,background:paper,color:inkSoft,cursor:'pointer',display:'inline-flex',transition:'all .12s ease'}} onMouseEnter={e=>{e.currentTarget.style.background='#f5f4f0';e.currentTarget.style.borderColor='#d4cdc2'}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.borderColor=hairline}} title="Download PDF"><Download size={19}/></button>
                        <AIDocumentSummarizer docType="Purchase Order" data={purchase} label="Summary" color="#1f8577" />
                        <button onClick={onClose} style={{padding:9,borderRadius:10,border:'1px solid transparent',background:'transparent',color:inkSoft,cursor:'pointer',display:'inline-flex',transition:'all .12s ease'}} onMouseEnter={e=>{e.currentTarget.style.background='#fdf2f2';e.currentTarget.style.color='#b5493f';e.currentTarget.style.borderColor='#f5c6c6'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor='transparent'}}><X size={22}/></button>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{display:'flex',borderBottom:`1.4px solid ${hairline}`,padding:'0 28px',background:paper,overflowX:'auto',flexShrink:0}}>
                    {[{id:'Overview',label:'Order Overview',icon:FileText},{id:'Landing',label:'Landing Costs',icon:Ship},{id:'Related',label:'Audit Chain',icon:LucideHistory}].map(tab=>{
                        const Icon=tab.icon;
                        const isActive=activeTab===tab.id;
                        return (
                            <button key={tab.id} onClick={()=>setActiveTab(tab.id as 'Overview'|'Landing'|'Related')}
                                style={{padding:'13px 18px',fontSize:10.5,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',border:'none',borderBottom:`2px solid ${isActive?teal[500]:'transparent'}`,background:'transparent',color:isActive?teal[600]:inkSoft,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease',fontFamily:"'Inter','DM Sans',sans-serif",whiteSpace:'nowrap'}}
                                onMouseEnter={e=>{if(!isActive){e.currentTarget.style.color=teal[700];e.currentTarget.style.borderBottomColor=teal[200]}}} onMouseLeave={e=>{if(!isActive){e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderBottomColor='transparent'}}}>
                                <Icon size={14}/> {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div ref={contentRef} style={{flex:1,overflowY:'auto',background:`linear-gradient(135deg,${teal[50]} 0%,#FEFDFB 100%)`,padding:28}}>
                    {activeTab==='Overview'&&(
                        <div id="po-printable" style={{maxWidth:1000,margin:'0 auto',display:'flex',flexDirection:'column',gap:24}}>
                            {/* Summary Cards */}
                            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:20}}>
                                <div style={{background:paper,border:'1.4px solid #e4ddd1',borderRadius:20,padding:24,display:'flex',flexDirection:'column',justifyContent:'space-between',boxShadow:'0 2px 10px rgba(0,0,0,.05)',transition:'all .15s ease'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=teal[300];e.currentTarget.style.boxShadow='0 8px 24px -8px rgba(15,84,76,.15)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,.05)'}}>
                                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
                                        <div style={{padding:12,borderRadius:12,background:teal[50],border:`1px solid ${teal[100]}`,color:teal[600],display:'inline-flex',transition:'all .15s'}}>
                                            <Building2 size={24}/>
                                        </div>
                                        <span style={{display:'inline-block',padding:'4px 12px',borderRadius:999,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',...(getStatusColor(purchase.status))}}>{purchase.status}</span>
                                    </div>
                                    <div style={{marginTop:28}}>
                                        <p style={{fontSize:10,fontWeight:800,color:inkSoft,textTransform:'uppercase',letterSpacing:'.1em',margin:'0 0 4px'}}>Supplier Entity</p>
                                        <h3 style={{fontSize:20,fontWeight:700,color:ink,margin:0,lineHeight:1.3,fontFamily:"'DM Serif Display','Georgia',serif"}}>{(suppliers||[]).find(s=>s.id===purchase.supplierId)?.name||'Unknown Entity'}</h3>
                                        <div style={{marginTop:14,display:'flex',flexWrap:'wrap',gap:8}}>
                                            {purchase.paymentStatus!=='Paid'&&purchase.status!=='Draft'&&purchase.status!=='Cancelled'&&onPayment&&(
                                                <button onClick={()=>onPayment(purchase)} style={{flex:1,padding:'10px 16px',background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:12,border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',transition:'all .15s ease'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>Record Payment</button>
                                            )}
                                            {(purchase.status==='Ordered'||purchase.status==='Partially Received')&&(
                                                <button onClick={()=>onReceive(purchase.id)} style={{flex:1,padding:'10px 16px',background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:12,border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',transition:'all .15s ease'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>Receive Goods</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div style={{background:paper,border:'1.4px solid #e4ddd1',borderRadius:20,padding:24,boxShadow:'0 2px 10px rgba(0,0,0,.05)',display:'flex',flexDirection:'column'}}>
                                    <div style={{fontSize:10,fontWeight:800,color:inkSoft,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Factory Price</div>
                                    <div style={{fontSize:26,fontWeight:700,color:ink,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.2}}>{currency}{(purchase.total||0).toLocaleString()}</div>
                                </div>
                                <div style={{background:teal[900],borderRadius:20,padding:24,boxShadow:'0 20px 50px -20px rgba(0,0,0,.4)',display:'flex',flexDirection:'column'}}>
                                    <div style={{fontSize:10,fontWeight:800,color:teal[300],textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Landed Total</div>
                                    <div style={{fontSize:26,fontWeight:700,color:'#fff',fontFamily:"'JetBrains Mono',monospace",lineHeight:1.2}}>{currency}{((purchase.total||0)+(landingTotal||0)).toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Addresses */}
                            <div style={{background:paper,border:'1.4px solid #e4ddd1',borderRadius:20,padding:24,display:'grid',gridTemplateColumns:'1fr 1fr',gap:40,boxShadow:'0 2px 10px rgba(0,0,0,.05)'}}>
                                <div>
                                    <h3 style={{fontSize:10,fontWeight:800,color:inkSoft,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10,display:'flex',alignItems:'center',gap:7,fontFamily:"'Inter','DM Sans',sans-serif"}}><Landmark size={14} style={{color:teal[500]}}/> Vendor Origin</h3>
                                    <div style={{fontSize:13.5}}>
                                        <div style={{fontWeight:700,color:ink,fontFamily:"'DM Serif Display','Georgia',serif",fontSize:16}}>{purchaseWithVendor.supplierName||purchase.supplierId}</div>
                                        <div style={{whiteSpace:'pre-wrap',color:inkSoft,marginTop:8,lineHeight:1.6}}>{purchaseWithVendor.vendorAddress||''}</div>
                                    </div>
                                </div>
                                <div style={{textAlign:'right'}}>
                                    <h3 style={{fontSize:10,fontWeight:800,color:inkSoft,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:7,fontFamily:"'Inter','DM Sans',sans-serif"}}>Shipment Destination <Package size={14} style={{color:teal[500]}}/></h3>
                                    <div style={{fontSize:13.5}}>
                                        <div style={{fontWeight:700,color:ink,fontFamily:"'DM Serif Display','Georgia',serif",fontSize:16}}>{companyConfig.companyName}</div>
                                        <div style={{color:inkSoft,marginTop:8,lineHeight:1.6}}>{companyConfig.addressLine1}, {companyConfig.city}</div>
                                        <div style={{marginTop:12,display:'inline-block',padding:'4px 14px',background:teal[50],color:teal[700],border:`1px solid ${teal[200]}`,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',borderRadius:999}}>Expected: {purchase.expectedDate?new Date(purchase.expectedDate).toLocaleDateString():'N/A'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Line Items */}
                            <div style={{background:paper,border:'1.4px solid #e4ddd1',borderRadius:20,boxShadow:'0 2px 10px rgba(0,0,0,.05)',overflow:'hidden'}}>
                                <div style={{padding:'14px 20px',borderBottom:`1px solid ${hairline}`,background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`,display:'flex',alignItems:'center',gap:9}}>
                                    <FileText size={16} style={{color:teal[500]}}/>
                                    <h3 style={{fontSize:10.5,fontWeight:700,color:teal[800],textTransform:'uppercase',letterSpacing:'.06em',margin:0,fontFamily:"'Inter','DM Sans',sans-serif"}}>Order Specification</h3>
                                </div>
                                <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
                                    <thead>
                                        <tr style={{background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`}}>
                                            <th style={{padding:'12px 20px',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Item Identity</th>
                                            <th style={{padding:'12px 20px',textAlign:'center',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Qty</th>
                                            <th style={{padding:'12px 20px',textAlign:'center',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Status</th>
                                            <th style={{padding:'12px 20px',textAlign:'right',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Factory</th>
                                            <th style={{padding:'12px 20px',textAlign:'right',fontSize:10,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Extended</th>
                                        </tr>
                                    </thead>
                                    <tbody style={{divideY:`1px solid ${hairline}`}}>
                                        {(purchase.items||[]).map((item,idx)=>{
                                            const product=(inventory||[]).find(i=>i.id===item.itemId);
                                            return (
                                            <tr key={idx} style={{borderBottom:`1px solid ${hairline}`,transition:'background .12s',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                                <td style={{padding:'14px 20px'}}>
                                                    <div style={{display:'flex',alignItems:'center',gap:14}}>
                                                        <div style={{width:50,height:50,borderRadius:14,background:teal[50],border:`1px solid ${teal[100]}`,overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>
                                                            <OfflineImage src={product?.image} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}} fallback={<Package size={22} style={{color:teal[200]}}/>} />
                                                        </div>
                                                        <div>
                                                            <div style={{fontWeight:700,fontSize:13.5,color:ink,fontFamily:"'DM Serif Display','Georgia',serif"}}>{item.name}</div>
                                                            <div style={{fontSize:10,color:inkSoft,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",textTransform:'uppercase',letterSpacing:'.04em',marginTop:2}}>
                                                                <DocLink docNumber={item.itemId} targetPage="/inventory" rowId={`item-${item.itemId}`} currentPage={location.pathname} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{padding:'14px 20px',textAlign:'center',fontWeight:700,color:teal[700],fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{item.quantity||0}</td>
                                                <td style={{padding:'14px 20px',textAlign:'center'}}>
                                                    <span style={{display:'inline-block',padding:'4px 12px',borderRadius:999,fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',...(item.receivedQty===item.quantity?`background:${teal[50]};color:${teal[700]};border:1px solid ${teal[200]}`:'background:#f5f4f0;color:#5c6567;border:1px solid #e4ddd1')}}>{item.receivedQty?`Recvd: ${item.receivedQty}`:'Pending'}</span>
                                                </td>
                                                <td style={{padding:'14px 20px',textAlign:'right',fontWeight:600,color:inkSoft,fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{currency}{(item.cost||0).toFixed(2)}</td>
                                                <td style={{padding:'14px 20px',textAlign:'right',fontWeight:700,color:teal[800],fontFamily:"'JetBrains Mono',monospace",fontSize:13}}>{currency}{((item.cost||0)*(item.quantity||0)).toFixed(2)}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Landing Costs on Overview */}
                            {purchase.landingCosts&&purchase.landingCosts.length>0&&(
                                <div style={{background:paper,border:'1.4px solid #e4ddd1',borderRadius:20,boxShadow:'0 2px 10px rgba(0,0,0,.05)',overflow:'hidden'}}>
                                    <div style={{padding:'14px 20px',borderBottom:`1px solid ${hairline}`,background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`,display:'flex',alignItems:'center',gap:9}}>
                                        <Ship size={16} style={{color:teal[500]}}/>
                                        <h3 style={{fontSize:10.5,fontWeight:700,color:teal[800],textTransform:'uppercase',letterSpacing:'.06em',margin:0,fontFamily:"'Inter','DM Sans',sans-serif"}}>Surcharge Capitalization</h3>
                                    </div>
                                    <div style={{padding:20,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:14}}>
                                        {purchase.landingCosts.map(cost=>(
                                            <div key={cost.id} style={{padding:14,background:teal[50],border:`1px solid ${teal[100]}`,borderRadius:14,transition:'all .15s ease'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=teal[300];e.currentTarget.style.background=teal[100]}} onMouseLeave={e=>{e.currentTarget.style.borderColor=teal[100];e.currentTarget.style.background=teal[50]}}>
                                                <p style={{fontSize:9.5,fontWeight:700,color:inkSoft,textTransform:'uppercase',letterSpacing:'.06em',margin:'0 0 5px'}}>{cost.category}</p>
                                                <p style={{fontSize:13.5,fontWeight:700,color:teal[800],fontFamily:"'JetBrains Mono',monospace",margin:0}}>{currency}{(cost.amount||0).toLocaleString()}</p>
                                                <p style={{fontSize:9.5,color:inkSoft,margin:'5px 0 0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cost.description||'Estimated burden'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab==='Landing'&&(
                        <div style={{maxWidth:1000,margin:'0 auto'}}>
                            <LandingCostAllocation purchase={purchase} onUpdate={handleUpdateLandingCosts} />
                        </div>
                    )}

                    {activeTab==='Related'&&(
                        <div style={{maxWidth:800,margin:'0 auto',display:'flex',flexDirection:'column',gap:14}}>
                            {linkedDocs.length>0?linkedDocs.map((doc,i)=>(
                                <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 24px',background:paper,border:`1.4px solid ${hairline}`,borderRadius:16,boxShadow:'0 2px 8px rgba(0,0,0,.05)',cursor:'pointer',transition:'all .15s ease'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=teal[300];e.currentTarget.style.boxShadow='0 6px 20px -8px rgba(15,84,76,.15)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,.05)'}}>
                                    <div style={{display:'flex',alignItems:'center',gap:20}}>
                                        <div style={{padding:12,borderRadius:14,background:teal[50],border:`1px solid ${teal[100]}`,color:teal[600],display:'inline-flex',transition:'all .15s'}}>
                                            <FileText size={24}/>
                                        </div>
                                        <div>
                                            <div style={{fontSize:13.5,fontWeight:700,color:ink,textTransform:'uppercase',letterSpacing:'.02em'}}>{doc.type} #{doc.id}</div>
                                            <div style={{fontSize:10,color:inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginTop:4}}>{new Date(doc.date).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                                        <span style={{padding:'5px 14px',background:'#f5f4f0',color:'#5c6567',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',borderRadius:999,border:`1px solid ${hairline}`}}>{doc.status}</span>
                                        <ChevronRight size={20} style={{color:teal[300],transition:'color .15s'}}/>
                                    </div>
                                </div>
                            )):(
                                <div style={{textAlign:'center',padding:48,background:paper,border:`2px dashed ${teal[100]}`,borderRadius:24,color:inkSoft}}>
                                    <LucideHistory size={48} style={{margin:'0 auto 16',opacity:.15,color:teal[400]}}/>
                                    <p style={{fontWeight:700,fontSize:10,textTransform:'uppercase',letterSpacing:'.05em',margin:0,color:'#b7afa4'}}>No linked operations detected</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div style={{padding:'14px 28px',borderTop:`1px solid ${hairline}`,background:paper,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,flexWrap:'wrap',gap:10}}>
                    <div style={{display:'flex',gap:8}}>
                        {(purchase.status==='Draft'||purchase.status==='Ordered')&&(
                            <button onClick={()=>onReceive(purchase.id)} style={{...btnPrimary,fontSize:12,padding:'7px 16px'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}><Package size={14}/> {purchase.status==='Draft'?'Process Draft':'Receive Goods'}</button>
                        )}
                        {onConvert&&purchase.status!=='Closed'&&purchase.status!=='Cancelled'&&(
                            <button onClick={handleConvertToBill} style={btnPrimary} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}><ChevronRight size={14}/> Convert to Bill</button>
                        )}
                    </div>
                    <div style={{display:'flex',gap:8}}>
                        <button onClick={handlePrint} style={btnGhost} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[800];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}><Printer size={14}/> Print</button>
                        <button onClick={handleCancel} style={{...btnGhost,color:'#b5493f',borderColor:'#f5c6c6'}} onMouseEnter={e=>{e.currentTarget.style.background='#fdf2f2';e.currentTarget.style.borderColor='#b5493f'}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color='#b5493f';e.currentTarget.style.borderColor='#f5c6c6'}}><X size={14}/> Cancel Order</button>
                        <button onClick={onClose} style={{...btnGhost,fontWeight:700}} onMouseEnter={e=>{e.currentTarget.style.background='#f5f4f0';e.currentTarget.style.color=ink;e.currentTarget.style.borderColor='#d4cdc2'}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}>Close</button>
                    </div>
                </div>
            </div>

            <ConfirmDialog open={confirmState.open} onOpenChange={(open)=>{if(!open)handleConfirmClose()}} onConfirm={()=>{confirmState.onConfirm?.();handleConfirmClose()}} onCancel={handleConfirmClose} title={confirmState.title} message={confirmState.message} confirmText={confirmState.confirmText} type={confirmState.type||'question'} />
        </div>
    );
};

export default PurchaseOrderDetail;
