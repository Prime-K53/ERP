import React, { useState, useMemo } from 'react';
import { X, Package, ChevronRight, Scale } from 'lucide-react';
import { inventoryResourceService } from '../../../services/inventoryResourceService';
import { useInventory } from '../../../context/InventoryContext';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';

const teal = { 50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a' };
const paper = '#FEFDFB'; const ink = '#23282A'; const inkSoft = '#5c6567'; const hairline = '#e4ddd1';

interface PurchaseReceiveModalProps {
    purchase: any;
    onClose: () => void;
    onComplete: () => void;
}

export const PurchaseReceiveModal: React.FC<PurchaseReceiveModalProps> = ({ purchase, onClose, onComplete }) => {
    const { inventory, updatePurchase } = useInventory();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const items = purchase.items || [];
    const findItem = (itemId: string) => inventory.find((i: any) => i.id === itemId);

    const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>(() => {
        const initial: Record<string, number> = {};
        for (const item of items) {
            const remaining = (item.quantity || 0) - (item.receivedQty || 0);
            if (remaining > 0) initial[item.itemId || item.itemId] = remaining;
        }
        return initial;
    });

    const handleQtyChange = (itemId: string, value: string) => {
        const parsed = parseFloat(value);
        setReceivedQuantities(prev => ({ ...prev, [itemId]: isNaN(parsed) ? 0 : Math.max(0, parsed) }));
    };

    const handleReceiveAll = () => {
        const all: Record<string, number> = {};
        for (const item of items) {
            const remaining = (item.quantity || 0) - (item.receivedQty || 0);
            if (remaining > 0) all[item.itemId || item.itemId] = remaining;
        }
        setReceivedQuantities(all);
    };

    const handleSubmit = async () => {
        setLoading(true); setError(null);
        try {
            const updatedItems = [...items];
            let allFullyReceived = true;
            for (let i = 0; i < updatedItems.length; i++) {
                const poItem = updatedItems[i];
                const itemId = poItem.itemId || poItem.itemId;
                const qtyToReceive = receivedQuantities[itemId] || 0;
                if (qtyToReceive <= 0) continue;
                const invItem = findItem(itemId);
                try {
                    await inventoryResourceService.recordPurchase({
                        itemId, purchaseQuantity: qtyToReceive,
                        purchaseUnit: poItem.unit || invItem?.purchaseUnit || invItem?.unit || 'pcs',
                        totalCost: qtyToReceive * (poItem.cost || 0),
                        supplierId: purchase.supplierId, supplierName: purchase.supplierName || purchase.supplierName,
                        invoiceRef: purchase.id,
                    });
                } catch (err) { console.warn(`[PurchaseReceive] Could not record purchase lot for ${poItem.name}:`, err); }
                const oldReceived = poItem.receivedQty || 0;
                updatedItems[i] = { ...poItem, receivedQty: oldReceived + qtyToReceive };
                if ((oldReceived + qtyToReceive) < (poItem.quantity || 0)) allFullyReceived = false;
            }
            await updatePurchase({ ...purchase, items: updatedItems, status: allFullyReceived ? 'Received' : 'Partially Received' });
            onComplete();
        } catch (err: any) { setError(err?.message || 'Failed to process receipt'); }
        finally { setLoading(false); }
    };

    const inputStyle: React.CSSProperties = { width:'100%',border:`1.4px solid ${hairline}`,borderRadius:9,padding:'9px 12px',background:paper,fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,color:ink,outline:'none',transition:'border-color .15s ease, box-shadow .15s ease',fontWeight:600 };
    const btnPrimary: React.CSSProperties = { background:`linear-gradient(155deg,${teal[500]},${teal[700]})`,color:'#fff',borderRadius:9,padding:'10px 24px',border:'none',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',boxShadow:'0 6px 16px -6px rgba(15,84,76,.55)',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,transition:'all .15s ease',flex:2 };
    const btnGhost: React.CSSProperties = { background:paper,border:`1.4px solid ${hairline}`,color:inkSoft,borderRadius:9,padding:'10px 24px',fontFamily:"'Inter','DM Sans',sans-serif",fontSize:13.5,fontWeight:600,cursor:'pointer',transition:'all .15s ease',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:7,flex:1 };

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogHeader className="flex items-center justify-between" style={{background:`linear-gradient(135deg,${teal[50]} 0%,#FEFDFB 100%)`,borderBottom:`1px solid ${hairline}`,padding:'18px 24px'}}>
                <div>
                    <DialogTitle style={{fontFamily:"'DM Serif Display','Georgia',serif",fontSize:20,color:teal[800],fontWeight:400,letterSpacing:'.2'}}>Receive Goods</DialogTitle>
                    <p style={{margin:'2px 0 0',fontSize:11.5,color:inkSoft,letterSpacing:'.02',fontFamily:"'Inter','DM Sans',sans-serif"}}>Bill #{purchase.id}</p>
                </div>
                <button onClick={onClose} style={{padding:8,borderRadius:9,border:`1px solid ${hairline}`,background:paper,color:inkSoft,cursor:'pointer',display:'inline-flex',transition:'all .12s ease',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[700];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}><X size={20}/></button>
            </DialogHeader>

            <div style={{maxHeight:'60vh',overflowY:'auto',padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>
                {error && (
                    <div style={{padding:'12px 16px',background:'#fdf2f2',border:`1px solid #f5c6c6`,borderRadius:10,fontSize:13,color:'#b5493f',fontWeight:600}}>{error}</div>
                )}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{fontSize:10,fontWeight:700,color:inkSoft,textTransform:'uppercase',letterSpacing:'.06em',fontFamily:"'Inter','DM Sans',sans-serif"}}>
                        {items.filter((i: any)=>(i.quantity||0)-(i.receivedQty||0)>0).length} items pending
                    </span>
                    <button onClick={handleReceiveAll} style={{fontSize:10,fontWeight:700,color:teal[600],textTransform:'uppercase',letterSpacing:'.04em',background:'none',border:'none',cursor:'pointer',padding:0,transition:'color .12s',fontFamily:"'Inter','DM Sans',sans-serif"}} onMouseEnter={e=>e.currentTarget.style.color=teal[800]} onMouseLeave={e=>e.currentTarget.style.color=teal[600]}>Receive All</button>
                </div>

                {items.map((poItem: any, idx: number) => {
                    const itemId = poItem.itemId || poItem.itemId;
                    const ordered = poItem.quantity || 0;
                    const received = poItem.receivedQty || 0;
                    const remaining = ordered - received;
                    if (remaining <= 0) return null;
                    const invItem = findItem(itemId);
                    const isInventoryResource = invItem?.inventoryRole === 'internal' || invItem?.inventoryRole === 'both' || invItem?.type === 'Raw Material' || invItem?.type === 'Material';
                    const currentQty = receivedQuantities[itemId] ?? remaining;
                    const lineTotal = currentQty * (poItem.cost || 0);

                    return (
                        <div key={itemId||idx} style={{background:`linear-gradient(135deg,${teal[50]},#FEFDFB)`,border:`1.4px solid ${teal[100]}`,borderRadius:14,padding:16,transition:'all .15s ease'}} onMouseEnter={e=>{e.currentTarget.style.borderColor=teal[300];e.currentTarget.style.boxShadow='0 4px 14px -8px rgba(15,84,76,.12)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=teal[100];e.currentTarget.style.boxShadow='none'}}>
                            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12}}>
                                <div>
                                    <div style={{fontWeight:700,fontSize:14,color:ink,fontFamily:"'DM Serif Display','Georgia',serif"}}>{poItem.name}</div>
                                    <div style={{fontSize:10,color:inkSoft,fontWeight:600,marginTop:3,fontFamily:"'JetBrains Mono',monospace"}}>
                                        Ordered: {ordered} &times; {poItem.unit||'pcs'} @ ${(poItem.cost||0).toFixed(2)}
                                        {received>0&&<span style={{color:teal[600],marginLeft:8,fontWeight:700}}>(Previously received: {received})</span>}
                                    </div>
                                </div>
                                {isInventoryResource && (
                                    <div style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',background:teal[100],border:`1px solid ${teal[200]}`,borderRadius:8}}>
                                        <Scale size={10} style={{color:teal[600]}}/>
                                        <span style={{fontSize:9,fontWeight:700,color:teal[700],textTransform:'uppercase',letterSpacing:'.03em'}}>
                                            {invItem?.consumptionUnit||invItem?.unit||'pcs'} {invItem?.conversionFactor&&invItem.conversionFactor!==1?`(×${invItem.conversionFactor})`:''}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div style={{display:'flex',alignItems:'flex-end',gap:14}}>
                                <div style={{flex:1}}>
                                    <label style={{...inputStyle,display:'block',fontSize:9,fontWeight:700,color:inkSoft,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5,padding:0,border:'none',background:'transparent'}}>Receive Qty</label>
                                    <input type="number" min={0} max={remaining} step="any" value={currentQty} onChange={(e)=>handleQtyChange(itemId,e.target.value)} style={inputStyle} onFocus={e=>{e.currentTarget.style.borderColor=teal[400];e.currentTarget.style.boxShadow=`0 0 0 3px rgba(31,133,119,.1)`}} onBlur={e=>{e.currentTarget.style.borderColor=hairline;e.currentTarget.style.boxShadow='none'}}/>
                                </div>
                                <div style={{textAlign:'right',minWidth:80}}>
                                    <div style={{fontSize:9,fontWeight:700,color:inkSoft,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Line Total</div>
                                    <div style={{fontSize:14,fontWeight:700,color:teal[800],fontFamily:"'JetBrains Mono',monospace"}}>${lineTotal.toFixed(2)}</div>
                                </div>
                            </div>
                            {isInventoryResource && invItem && (
                                <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${teal[100]}`}}>
                                    <div style={{fontSize:10,color:inkSoft}}>
                                        Purchase unit: <span style={{fontWeight:700,color:ink}}>{poItem.unit||invItem.purchaseUnit||'pcs'}</span>
                                        {invItem.conversionFactor&&invItem.conversionFactor!==1&&<>
                                            <ChevronRight size={10} style={{display:'inline',margin:'0 3px',verticalAlign:'middle',color:teal[400]}}/>
                                            Consumption: <span style={{fontWeight:700,color:ink}}>{invItem.consumptionUnit||invItem.unit}</span>
                                            <span style={{marginLeft:2}}>(×{invItem.conversionFactor})</span>
                                            <span style={{marginLeft:6,color:teal[600],fontWeight:700}}>= {(currentQty*(invItem.conversionFactor||1)).toFixed(2)} {invItem.consumptionUnit||invItem.unit}</span>
                                        </>}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {items.every((i: any)=>(i.quantity||0)<=(i.receivedQty||0))&&(
                    <div style={{textAlign:'center',padding:36,background:teal[50],border:`1px dashed ${teal[200]}`,borderRadius:16}}>
                        <Package size={40} style={{margin:'0 auto 12',color:teal[300],display:'block'}}/>
                        <p style={{fontSize:13,fontWeight:700,color:teal[700],margin:0,fontFamily:"'DM Serif Display','Georgia',serif"}}>All items already received</p>
                    </div>
                )}
            </div>

            <DialogFooter style={{borderTop:`1px solid ${hairline}`,padding:'14px 24px 20px',background:paper,display:'flex',gap:10}}>
                <button type="button" onClick={onClose} style={btnGhost} onMouseEnter={e=>{e.currentTarget.style.background=teal[50];e.currentTarget.style.color=teal[800];e.currentTarget.style.borderColor=teal[200]}} onMouseLeave={e=>{e.currentTarget.style.background=paper;e.currentTarget.style.color=inkSoft;e.currentTarget.style.borderColor=hairline}}>Cancel</button>
                <button type="button" onClick={handleSubmit} disabled={loading||!Object.values(receivedQuantities).some((q:number)=>q>0)} style={btnPrimary} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                    {loading?'Processing...':'Confirm Receive'}
                </button>
            </DialogFooter>
        </Dialog>
    );
};
