import React, { useState, useEffect, useRef, useMemo } from 'react';
import { logger } from '@/services/logger';
import { Search, ShoppingCart, Save, X, Trash2, Sparkles, Loader2, ScanLine, ExternalLink, ChevronDown, Plus, Building } from 'lucide-react';
import { Item, Purchase, Invoice, Supplier } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useProcurement } from '../../../context/ProcurementContext';
import { generateNextId } from '../../../utils/helpers';
import { OfflineImage } from '../../../components/OfflineImage';
import { extractInvoiceData } from '../../../services/geminiService';
import { localFileStorage } from '../../../services/localFileStorage';
import { useNavigate } from 'react-router-dom';
import { SupplierModal } from './SupplierModal';
import { getDefaultDate, validateDateInFY } from '../../../utils/financialYearUtils';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const paper = '#FEFDFB';
const hairline = '#e4ddd1';
const inkSoft = '#5c6567';
const ink = '#23282A';

interface PurchaseBuilderProps {
    inventory: Item[];
    supplierNames?: string[];
    suppliers?: any[];
    onCreateOrder: (data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => void;
    initialData?: Purchase | null;
    onUpdateOrder?: (id: string, data: { supplierId: string, items: any[], reference: string, dueDate: string, date: string }) => void;
    onCancel?: () => void;
}

export const PurchaseBuilder: React.FC<PurchaseBuilderProps> = ({ inventory, supplierNames, onCreateOrder, initialData, onUpdateOrder, onCancel }) => {
    const { companyConfig, notify, isOnline } = useAuth(); const { suppliers, purchases, addSupplier } = useProcurement();
    const currency = companyConfig.currencySymbol;
    const navigate = useNavigate();

    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const supplierDropdownRef = useRef<HTMLDivElement>(null);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);

    const [billDate, setBillDate] = useState(getDefaultDate());
    const [dueDate, setDueDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
    });
    const [reference, setReference] = useState('');

    const [searchItem, setSearchTerm] = useState('');
    const [poItems, setPoItems] = useState<{item: Item, qty: number, cost: number}[]>([]);

    const [isScanning, setIsScanning] = useState(false);
    const [scannedImage, setScannedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getSupplierOutstanding = (id: string) => {
        const supplier = suppliers.find(s => s.id === id);
        if (!supplier) return 0;
        return (purchases || [])
            .filter(p => p.supplierId === id && p.paymentStatus !== 'Paid' && p.status !== 'Cancelled')
            .reduce((sum, p) => sum + (p.totalAmount - (p.paidAmount || 0)), 0);
    };

    const selectedSupplierObj = useMemo(() =>
        suppliers.find(s => s.id === selectedSupplierId),
    [selectedSupplierId, suppliers]);

    useEffect(() => {
        if (initialData) {
            setSelectedSupplierId(initialData.supplierId);
            const sName = suppliers.find(s => s.id === initialData.supplierId)?.name || initialData.supplierId;
            setSupplierSearch(sName);
            setBillDate(new Date(initialData.date).toISOString().split('T')[0]);
            setDueDate(initialData.dueDate ? new Date(initialData.dueDate).toISOString().split('T')[0] : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })());
            setReference(initialData.reference || '');

            const items = (initialData.items || []).map(pItem => {
                const invItem = inventory.find(i => i.id === pItem.itemId);
                const fullItem = invItem || {
                    id: pItem.itemId,
                    name: pItem.name,
                    sku: 'N/A',
                    price: pItem.cost,
                    cost: pItem.cost,
                    type: 'Material',
                    category: 'Unknown',
                    stock: 0,
                    minStockLevel: 0
                } as Item;

                return { item: fullItem, qty: pItem.quantity, cost: pItem.cost };
            });
            setPoItems(items);
        } else {
            setSelectedSupplierId('');
            setSupplierSearch('');
            setPoItems([]);
            setBillDate(getDefaultDate());
            setDueDate((() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })());
            setReference(generateNextId('VR', purchases, companyConfig));
        }
    }, [initialData, inventory, suppliers]);

    const filteredSuppliers = useMemo(() => {
        if (!supplierSearch) return suppliers;
        return suppliers.filter(s =>
            (s.name || '').toLowerCase().includes(supplierSearch.toLowerCase()) ||
            (s.email || '').toLowerCase().includes(supplierSearch.toLowerCase())
        );
    }, [suppliers, supplierSearch]);

    const selectSupplier = (supplier: any) => {
        setSelectedSupplierId(supplier.id);
        setSupplierSearch(supplier.name);
        setIsSupplierDropdownOpen(false);
    };

    const handleAddSupplier = async (supplierData: Supplier) => {
        try {
            const newSupplier = await addSupplier(supplierData);
            selectSupplier(newSupplier);
            setIsSupplierModalOpen(false);
        } catch (error) {
            notify('Failed to add supplier', 'error');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
                setIsSupplierDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const availableItems = inventory.filter(i =>
        (i.type === 'Raw Material' || i.type === 'Stationery') &&
        ((i.name || '').toLowerCase().includes(searchItem.toLowerCase()) ||
        (i.sku || '').toLowerCase().includes(searchItem.toLowerCase()))
    );

    const addItemToPO = (item: Item, qty: number = 10, cost?: number) => {
        setPoItems(prev => {
          const exists = prev.find(p => p.item.id === item.id);
          if(exists) return prev;
          return [...prev, { item, qty, cost: cost || item.cost || item.price }];
        });
    };

    const updatePOItem = (id: string, field: 'qty' | 'cost', value: number) => {
        setPoItems(prev => prev.map(p =>
          p.item.id === id ? { ...p, [field]: value } : p
        ));
    };

    const removePOItem = (id: string) => {
        setPoItems(prev => prev.filter(p => p.item.id !== id));
    };

    const handleSubmit = () => {
        if(!selectedSupplierId || poItems.length === 0) return;

        const dateError = validateDateInFY(billDate);
        if (dateError) { notify(dateError, "error"); return; }

        const payload = {
            supplierId: selectedSupplierId,
            items: poItems,
            reference,
            dueDate,
            date: billDate
        };

        if (initialData && onUpdateOrder) {
            onUpdateOrder(initialData.id, payload);
        } else {
            onCreateOrder(payload);
            setPoItems([]);
            setSelectedSupplierId('');
            setReference('');
        }
        setScannedImage(null);
    };

    const handleScanInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!isOnline) { notify("Scanning requires internet connection.", "error"); return; }

        setIsScanning(true);
        try {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target?.result as string;
                setScannedImage(base64);

                try {
                    const extracted = await extractInvoiceData(base64);

                    if (extracted) {
                        const supplierName = extracted.supplierName || extracted.clientName;
                        if (supplierName) {
                            const match = suppliers.find(s => (s.name || '').toLowerCase().includes((supplierName || '').toLowerCase()));
                            if (match) {
                                setSelectedSupplierId(match.id);
                                setSupplierSearch(match.name);
                                notify(`Matched Supplier: ${match.name}`, "success");
                            } else {
                                notify(`Supplier '${supplierName}' not found. Please select manually.`, "info");
                            }
                        }

                        const newItems: {item: Item, qty: number, cost: number}[] = [];
                        extracted.items?.forEach((scanItem: any) => {
                            const itemName = scanItem.desc || scanItem.name || "";
                            const matchedInv = inventory.find(i => (i.name || '').toLowerCase().includes(itemName.toLowerCase()));
                            if (matchedInv && (matchedInv.type === 'Raw Material' || matchedInv.type === 'Stationery')) {
                                newItems.push({
                                    item: matchedInv,
                                    qty: scanItem.qty || 1,
                                    cost: scanItem.price || scanItem.unitPrice || matchedInv.cost || 0
                                });
                            }
                        });

                        if (newItems.length > 0) {
                            setPoItems(prev => [...prev, ...newItems]);
                            notify(`Matched ${newItems.length} items from invoice.`, "success");
                        } else {
                            notify("No matching purchaseable inventory items found in invoice.", "info");
                        }

                        if(extracted.date) setBillDate(extracted.date);
                    } else {
                        notify("Could not extract data from image.", "error");
                    }
                } catch (err) {
                    logger.error(err);
                    notify("AI Analysis failed.", "error");
                } finally {
                    setIsScanning(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            logger.error(err);
            setIsScanning(false);
        }
        e.target.value = '';
    };

    const totalCost = poItems.reduce((sum, p) => sum + (p.qty * p.cost), 0);

    const inputStyle: React.CSSProperties = { width:'100%',border:`1.4px solid ${hairline}`,borderRadius:9,padding:'9px 12px',background:paper,fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,color:ink,outline:'none',transition:'border-color .15s ease, box-shadow .15s ease' };
    const btnScan: React.CSSProperties = { padding:'8px 10px',background:`linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,color:'#fff',borderRadius:9,border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:'0 4px 12px -4px rgba(15,84,76,.5)',display:'flex',alignItems:'center',gap:4,transition:'all .15s ease' };
    const btnPrimary: React.CSSProperties = { background:`linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,color:'#fff',borderRadius:9,padding:'9px 22px',border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease' };
    const btnGhost: React.CSSProperties = { background:paper,border:`1.4px solid ${hairline}`,color:inkSoft,borderRadius:9,padding:'9px 22px',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7,transition:'all .15s ease' };

    return (
        <div style={{display:'flex',gap:16,flex:1,minHeight:0,height:'100%',overflow:'hidden',background:paper,padding:16,borderRadius:14,border:`1.4px solid ${hairline}`}}>
            <style>{`
              .pbuilder-scan-panel{background:linear-gradient(180deg,#082e2a 0%,#0b3e39 100%)!important;border:1.4px solid #0b3e39;border-radius:14px;overflow:hidden!important;position:relative;flex-shrink:0;width:25%!important;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
              .pbuilder-header-bar{display:flex;align-items:center;justify-content:space-between;padding:'10px 14px';borderBottom:'1px solid rgba(255,255,255,.1)';background:'rgba(8,46,42,.7)';backdropFilter:'blur(8px)';fontFamily:"'Inter',sans-serif"}
              .pbuilder-col-left{border:1.4px solid #e4ddd1;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:#FEFDFB;box-shadow:0 2px 8px rgba(0,0,0,.06)}
              .pbuilder-col-left-bar{display:flex;align-items:center;justify-content:space-between;padding:'10px 14px';borderBottom:'1.4px solid #e4ddd1';background:'linear-gradient(135deg,#eef7f6 0%,#FEFDFB 100%)'}
              .pbuilder-col-right{border:1.4px solid #e4ddd1;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;background:#FEFDFB;box-shadow:0 2px 8px rgba(0,0,0,.06)}
              .pbuilder-total-chip{display:inline-flex;align-items:center;gap:6px;padding:'5px 14px';background:'linear-gradient(135deg,#eef7f6,#d3ece9)',border:'1.4px solid #a6d9d3',borderRadius:999,fontFamily:"'JetBrains Mono',monospace";fontSize:12.5;fontWeight:700;color:#0f544c;textTransform:'uppercase';letterSpacing:'.03em'}
              .pbuilder-supplier-row{display:flex;align-items:center;justify-content:space-between;padding:'10px 14px';borderBottom:'1px solid #e4ddd1';transition:'all .12s ease',cursor:'pointer'}
              .pbuilder-supplier-row:hover{background:'#eef7f6'}
              .pbuilder-input-focus:focus{borderColor:'#3fa294'!important;boxShadow:'0 0 0 3px rgba(31,133,119,.1)'!important}
              .pbuilder-dropdown{position:absolute;zIndex:60;marginTop:4;width:'100%';background:'#FEFDFB';border:'1.4px solid #a6d9d3';borderRadius:12;boxShadow:'0 20px 50px -16px rgba(0,0,0,.18)';maxHeight:240;overflowY:'auto';animation:'fadeInUp .12s ease'}
              .pbuilder-item-row{transition:'all .15s ease',cursor:'pointer'}
              .pbuilder-item-row:hover{borderColor:'#a6d9d3'!important;background:'#eef7f6'!important}
            `}</style>

            {/* Scan Preview Panel */}
            {scannedImage && (
                <div className="pbuilder-scan-panel">
                    <div className="pbuilder-header-bar" style={{borderBottom:'1px solid rgba(255,255,255,.1)',background:'rgba(8,46,42,.7)',backdropFilter:'blur(8px)',padding:'10px 14px'}}>
                        <h3 style={{fontFamily:"'Inter',sans-serif",fontWeight:700,fontSize:13,color:'#fff',display:'flex',alignItems:'center',gap:8}}>
                            <ScanLine size={16} style={{color:'#72c0b7'}}/> Scanned Invoice
                        </h3>
                        <button onClick={() => setScannedImage(null)} style={{padding:4,borderRadius:'50%',border:'none',background:'transparent',color:'rgba(255,255,255,.6)',cursor:'pointer',transition:'all .15s ease',display:'flex'}} onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.12)';e.currentTarget.style.color='#fff'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,.6)'}}><X size={16}/></button>
                    </div>
                    <img src={scannedImage} alt="Scanned" style={{width:'100%',height:'100%',objectFit:'contain',opacity:.85,transition:'opacity .2s'}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.85'}/>
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-10 gap-5 h-full min-h-0">
                {/* 30% Column: Select Items */}
                <div className="lg:col-span-3 pbuilder-col-left">
                    <div className="pbuilder-col-left-bar" style={{padding:'10px 14px',borderBottom:`1.4px solid ${hairline}`,background:`linear-gradient(135deg, ${teal[50]} 0%, #FEFDFB 100%)`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <h2 style={{fontFamily:"'DM Serif Display','Georgia',serif",fontWeight:400,fontSize:15,color:teal[800],display:'flex',alignItems:'center',gap:8}}>
                            <Search size={16} style={{color:teal[500]}}/> Select Items
                        </h2>
                        {isOnline && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={btnScan}
                                disabled={isScanning}
                                title="Scan Bill"
                                onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.06)';e.currentTarget.style.boxShadow='0 6px 18px -4px rgba(15,84,76,.65)'}}
                                onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 4px 12px -4px rgba(15,84,76,.5)'}}
                            >
                                {isScanning ? <Loader2 size={14} style={{animation:'spin 1s linear infinite'}}/> : <Sparkles size={14}/>}
                            </button>
                        )}
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleScanInvoice}/>
                    </div>
                    <div style={{padding:'12px 12px 6px'}}>
                        <input type="text" placeholder="e.g. Paper, Ink" value={searchItem}
                            onChange={e => setSearchTerm(e.target.value)} aria-label="Search materials"
                            style={{...inputStyle,borderRadius:10,padding:'8px 12px'}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                    </div>
                    <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
                        {availableItems.map(item => (
                            <button key={item.id} onClick={() => addItemToPO(item)}
                                className="pbuilder-item-row"
                                style={{width:'100%',textAlign:'left',padding:'8px 10px',border:`1.4px solid ${hairline}`,borderRadius:10,background:paper,display:'flex',gap:10,alignItems:'center',cursor:'pointer',transition:'all .15s ease'}}
                                onMouseEnter={e=>{e.currentTarget.style.borderColor=teal[300];e.currentTarget.style.background=teal[50]}}
                                onMouseLeave={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.background=paper}}
                            >
                                <div style={{width:34,height:34,borderRadius:9,background:teal[50],border:`1px solid ${teal[100]}`,overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                    <OfflineImage src={item.image} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                                </div>
                                <div style={{flex:1,minWidth:0,padding:'2px 0'}}>
                                    <div style={{fontWeight:700,fontSize:13,color:ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                                    <div style={{fontSize:10,color:inkSoft,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'.03em',textTransform:'uppercase'}}>{item.sku}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 70% Column: Bill Summary */}
                <div className="lg:col-span-7 pbuilder-col-right" style={{display:'flex',flexDirection:'column'}}>
                    <div style={{padding:'10px 16px',borderBottom:`1.4px solid ${hairline}`,background:`linear-gradient(135deg, ${teal[50]} 0%, #FEFDFB 100%)`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <h2 style={{fontFamily:"'DM Serif Display','Georgia',serif",fontWeight:400,fontSize:15,color:teal[800],display:'flex',alignItems:'center',gap:8}}>
                            <ShoppingCart size={16} style={{color:teal[500]}}/> Bill Summary
                        </h2>
                        <div style={{display:'inline-flex',alignItemsItems:'center',gap:6,padding:'5px 14px',background:`linear-gradient(135deg, ${teal[100]}, ${teal[50]})`,border:`1px solid ${teal[200]}`,borderRadius:999,fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:teal[700],letterSpacing:'.03em'}}>
                            Total: {currency}{totalCost.toLocaleString(undefined,{minimumFractionDigits:2})}
                        </div>
                    </div>

                    <div style={{padding:14,borderBottom:`1.4px solid ${hairline}`,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,background:`linear-gradient(135deg,#eef7f6,#FEFDFB)`}}>
                        <div ref={supplierDropdownRef} style={{position:'relative'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,padding:'0 2px'}}>
                                <label style={{fontSize:12,fontWeight:600,color:teal[800],letterSpacing:'.01'}}>Supplier Entity</label>
                                {selectedSupplierObj && (
                                    <button type="button" onClick={()=>navigate('/purchases/suppliers',{state:{selectedId:selectedSupplierObj.id}})}
                                        style={{fontSize:10,fontWeight:800,color:teal[500],textTransform:'uppercase',letterSpacing:'.03em',background:'none',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:3,padding:0}}
                                        onMouseEnter={e=>e.currentTarget.style.color=teal[700]} onMouseLeave={e=>e.currentTarget.style.color=teal[500]}>
                                        View Profile <ExternalLink size={10}/>
                                    </button>
                                )}
                            </div>
                            <div style={{position:'relative'}}>
                                <input type="text" placeholder="e.g. ABC Suppliers" value={supplierSearch}
                                    onChange={e=>{setSupplierSearch(e.target.value);setIsSupplierDropdownOpen(true)}}
                                    style={{...inputStyle,borderRadius:9,fontWeight:700,fontFamily:"'Inter','DM Sans',sans-serif"}}
                                    onFocus={e=>{setIsSupplierDropdownOpen(true);e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}}
                                    onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}
                                />
                                <ChevronDown size={14} style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:inkSoft,pointerEvents:'none'}} />
                            </div>
                            {isSupplierDropdownOpen && (
                                <div className="pbuilder-dropdown" style={{background:paper,border:`1.4px solid ${teal[200]}`,borderRadius:12,boxShadow:'0 20px 50px -16px rgba(0,0,0,.18)',maxHeight:240,overflowY:'auto',position:'absolute',zIndex:60,marginTop:4,width:'100%'}}>
                                    {filteredSuppliers.length === 0 ? (
                                        <div style={{padding:16,display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
                                            <p style={{fontSize:11,color:inkSoft,fontStyle:'italic'}}>No vendors found</p>
                                            <button onClick={()=>{setIsSupplierModalOpen(true);setIsSupplierDropdownOpen(false)}}
                                                style={{width:'100%',padding:'9px 12px',background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:9,border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:12,fontWeight:600,cursor:'pointer',boxShadow:'0 4px 12px -4px rgba(15,84,76,.5)',display:'flex',alignItems:'center',justifyContent:'center',gap:6,transition:'all .15s ease'}}>
                                                <Plus size={12}/> Add "{supplierSearch}" as New Supplier
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {filteredSuppliers.map(s => {
                                                const outstanding = getSupplierOutstanding(s.id);
                                                return (
                                                    <button key={s.id} onClick={()=>selectSupplier(s)}
                                                        className="pbuilder-supplier-row"
                                                        onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                                        <div>
                                                            <span style={{fontWeight:700,fontSize:13,color:ink}}>{s.name}</span>
                                                            <span style={{fontSize:10,color:inkSoft,fontWeight:500,display:'block'}}>{s.category || 'General Vendor'}</span>
                                                        </div>
                                                        <div style={{textAlign:'right'}}>
                                                            <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:11,color:outstanding > 0 ? '#b5493f' : teal[600]}}>
                                                                {currency}{outstanding.toLocaleString()}
                                                            </div>
                                                            <div style={{fontSize:9,color:inkSoft,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em'}}>Outstanding</div>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                            {supplierSearch && !filteredSuppliers.some(s=>(s.name||'').toLowerCase().includes(supplierSearch.toLowerCase())) && (
                                                <button onClick={()=>{setIsSupplierModalOpen(true);setIsSupplierDropdownOpen(false)}}
                                                    style={{width:'100%',padding:'11px 16px',background:teal[50],color:teal[600],borderTop:`1px solid ${hairline}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontFamily:"'Inter','DM Sans',sans-serif",fontSize:12,fontWeight:600,transition:'all .15s ease',border:'none'}}
                                                    onMouseEnter={e=>e.currentTarget.style.background=teal[100]} onMouseLeave={e=>e.currentTarget.style.background=teal[50]}>
                                                    <Plus size={14}/><span style={{fontWeight:700}}>Add "{supplierSearch}" as New Supplier</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div>
                            <label style={{...inputStyle,display:'block',fontSize:12,fontWeight:600,color:teal[800],marginBottom:6,letterSpacing:'.01',padding:0,border:'none',background:'transparent'}}>Bill Date</label>
                            <input type="date" value={billDate} onChange={e=>setBillDate(e.target.value)}
                                style={{...inputStyle,fontWeight:700}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                        </div>
                        <div>
                            <label style={{...inputStyle,display:'block',fontSize:12,fontWeight:600,color:teal[800],marginBottom:6,letterSpacing:'.01',padding:0,border:'none',background:'transparent'}}>Due Date</label>
                            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}
                                style={{...inputStyle,fontWeight:700}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                        </div>
                        <div>
                            <label style={{...inputStyle,display:'block',fontSize:12,fontWeight:600,color:teal[800],marginBottom:6,letterSpacing:'.01',padding:0,border:'none',background:'transparent'}}>Vendor Ref #</label>
                            <input type="text" placeholder="e.g. INV-2024-001" value={reference} onChange={e=>setReference(e.target.value)}
                                style={{...inputStyle,textTransform:'uppercase',fontWeight:700}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                        </div>
                    </div>

                    <div style={{flex:1,overflowY:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
                            <thead>
                                <tr style={{position:'sticky',top:0,zIndex:10,background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`}}>
                                    <th style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em'}}>Item Identity</th>
                                    <th style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center',width:90}}>Qty</th>
                                    <th style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center',width:140}}>Unit Cost</th>
                                    <th style={{padding:'10px 16px',fontSize:10.5,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.06em',textAlign:'right',width:140}}>Line Total</th>
                                    <th style={{padding:'10px 16px',width:48}}></th>
                                </tr>
                            </thead>
                            <tbody style={{divideY:`1px solid ${hairline}`}}>
                                {poItems.length === 0 && (
                                    <tr><td colSpan={5} style={{padding:48,textAlign:'center',color:inkSoft,fontWeight:600,fontStyle:'italic',fontSize:13}}>No items added to bill yet. Select from left panel.</td></tr>
                                )}
                                {poItems.map(p => (
                                    <tr key={p.item.id} style={{borderBottom:`1px solid ${hairline}`,transition:'all .15s ease',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=teal[50]} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                        <td style={{padding:'10px 16px'}}>
                                            <div style={{display:'flex',alignItems:'center',gap:12}}>
                                                <div style={{width:42,height:42,borderRadius:10,background:teal[50],border:`1px solid ${teal[100]}`,overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                                                    <OfflineImage src={p.item.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                                                </div>
                                                <div>
                                                    <div style={{fontWeight:700,fontSize:13,color:ink}}>{p.item.name}</div>
                                                    <div style={{fontSize:10,color:inkSoft,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",letterSpacing:'.04em',textTransform:'uppercase'}}>{p.item.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{padding:'10px 16px'}}>
                                            <input type="number" min="1" value={p.qty || 0} onChange={e=>updatePOItem(p.item.id,'qty',parseFloat(e.target.value)||0)}
                                                style={{...inputStyle,borderRadius:10,fontWeight:700,textAlign:'center',fontFamily:"'JetBrains Mono',monospace"}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                                        </td>
                                        <td style={{padding:'10px 16px'}}>
                                            <div style={{position:'relative'}}>
                                                <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:10,fontWeight:700,color:teal[600],letterSpacing:'.03em',textTransform:'uppercase',fontFamily:"'JetBrains Mono',monospace"}}>{currency}</span>
                                                <input type="number" min="0" step="0.01" value={p.cost || 0} onChange={e=>updatePOItem(p.item.id,'cost',parseFloat(e.target.value)||0)}
                                                    style={{...inputStyle,borderRadius:10,fontWeight:700,textAlign:'center',paddingLeft:26,fontFamily:"'JetBrains Mono',monospace"}} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow='0 0 0 3px rgba(31,133,119,.1)'}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}} />
                                            </div>
                                        </td>
                                        <td style={{padding:'10px 16px',textAlign:'right',fontWeight:700,color:teal[800],fontFamily:"'JetBrains Mono',monospace",fontSize:13.5}}>
                                            {currency}{(p.qty * p.cost).toLocaleString(undefined,{minimumFractionDigits:2})}
                                        </td>
                                        <td style={{padding:'10px 16px',textAlign:'center'}}>
                                            <button onClick={()=>removePOItem(p.item.id)}
                                                style={{padding:6,border:'none',background:'transparent',color:inkSoft,cursor:'pointer',borderRadius:7,display:'inline-flex',transition:'all .12s ease'}}
                                                onMouseEnter={e=>{e.currentTarget.style.background='#fde8e7';e.currentTarget.style.color='#b5493f'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=inkSoft}}>
                                                <Trash2 size={15}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{padding:'12px 16px',borderTop:`1.4px solid ${hairline}`,background:`linear-gradient(135deg,#eef7f6 0%,#FEFDFB 100%)`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <button onClick={onCancel} style={btnGhost} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[800];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}>
                            <X size={14}/> Discard
                        </button>
                        <button onClick={handleSubmit} disabled={!selectedSupplierId || poItems.length === 0} style={btnPrimary} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                            <Save size={15}/> {initialData ? 'Update Bill' : 'Save Bill'}
                        </button>
                    </div>
                </div>
            </div>

            <SupplierModal
                isOpen={isSupplierModalOpen}
                onClose={()=>setIsSupplierModalOpen(false)}
                onSave={handleAddSupplier}
                mode="create"
                initialSupplier={{name:supplierSearch} as Partial<Supplier>}
            />
        </div>
    );
};
