import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Printer, Plus, Minus, X, ScanLine, Box, FileText, Loader2, Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useInventoryStore } from '../../stores/inventoryStore';
import { Item } from '../../types';
import html2canvas from 'html2canvas';
import { currencyService } from '../../services/currencyService';
import { generateBarcodeDataUrl } from '../../utils/barcodeGenerator';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1';

const BarcodePrinter: React.FC = () => {
    const { companyConfig, notify } = useAuth();
    const { inventory, fetchInventory } = useInventory();
    const { isLoading } = useInventoryStore();
    const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';
    const [searchTerm, setSearchTerm] = useState('');
    const [printQueue, setPrintQueue] = useState<{ item: Item; qty: number }[]>([]);
    const [labelSize, setLabelSize] = useState<'Standard' | 'Small'>('Standard');
    const [showName, setShowName] = useState(true);
    const [showSKU, setShowSKU] = useState(true);
    const [barcodeDataUrls, setBarcodeDataUrls] = useState<Record<string, string>>({});
    const [searchParams] = useSearchParams();
    const initialized = useRef(false);

    useEffect(() => {
        const urls: Record<string, string> = {};
        const isStandard = labelSize === 'Standard';
        for (const p of printQueue) {
            if (urls[p.item.id]) continue;
            const barcodeText = p.item.barcode || p.item.sku || p.item.id || p.item.name;
            if (barcodeText) urls[p.item.id] = generateBarcodeDataUrl(barcodeText, { height: isStandard ? 36 : 28, width: 1.5, margin: 8, marginTop: isStandard ? 6 : 4, marginBottom: isStandard ? 6 : 4, fontSize: isStandard ? 10 : 9, displayValue: true });
        }
        setBarcodeDataUrls(urls);
    }, [printQueue, labelSize]);

    useEffect(() => { if ((!inventory || inventory.length === 0) && !isLoading) fetchInventory(); }, [inventory, isLoading, fetchInventory]);

    useEffect(() => {
        if (initialized.current || !inventory) return;
        initialized.current = true;
        const itemId = searchParams.get('item');
        if (itemId) {
            const found = inventory.find(i => i.id === itemId);
            if (found) { setPrintQueue(prev => { if (prev.some(p => p.item.id === found.id)) return prev; return [...prev, { item: found, qty: 1 }]; }); setSearchTerm(found.name); }
        }
    }, [searchParams, inventory]);

    const handlePrint = () => { if (printQueue.length === 0) { notify("Print queue is empty", "error"); return; } window.print(); };

    const handleSaveImage = async () => {
        if (printQueue.length === 0) { notify("Print queue is empty", "error"); return; }
        const el = document.getElementById('printable-labels');
        if (!el) return;
        try { const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false }); const link = document.createElement('a'); link.download = `barcode-labels-${Date.now()}.png`; link.href = canvas.toDataURL('image/png'); link.click(); }
        catch (err) { notify("Failed to save image", "error"); }
    };

    const items = Array.isArray(inventory) ? inventory : [];
    const term = searchTerm.toLowerCase();
    const filteredItems = term ? items.filter(i => ((i && i.name) || '').toLowerCase().includes(term) || ((i && i.sku) || '').toLowerCase().includes(term)).slice(0, 10) : items.slice(0, 10);

    const addToQueue = (item: Item) => { setPrintQueue(prev => { const exists = prev.find(p => p.item.id === item.id); if (exists) return prev.map(p => p.item.id === item.id ? { ...p, qty: p.qty + 1 } : p); return [...prev, { item, qty: 1 }]; }); };
    const updateQty = (id: string, delta: number) => { setPrintQueue(prev => prev.map(p => { if (p.item.id === id) { const newQty = p.qty + delta; return newQty > 0 ? { ...p, qty: newQty } : p; } return p; })); };
    const remove = (id: string) => setPrintQueue(prev => prev.filter(p => p.item.id !== id));
    const renderBarcode = (item: Item) => { const url = barcodeDataUrls[item.id]; if (!url) return null; return <img src={url} alt={`Barcode ${item.barcode}`} style={{ width: '100%', height: 'auto' }} />; };

    const printStyles = `@media print { body * { visibility: hidden; } #printable-labels, #printable-labels * { visibility: visible; } #printable-labels { position: absolute; left: 0; top: 0; width: 100%; display: grid; grid-template-columns: repeat(auto-fill, ${labelSize === 'Standard' ? '50mm' : '38mm'}); gap: 2mm; } .label-item { break-inside: avoid; border: 1px solid #ddd; page-break-inside: avoid; overflow: hidden; } @page { margin: 5mm; size: auto; } }`;

    const inputStyle: React.CSSProperties = { fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '7px 10px', outline: 'none' };

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column', background: t[50] }}>
            <style>{printStyles}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><ScanLine color={t[500]} /> Barcode Label Printer</h1>
                    <p style={{ fontSize: 12, color: inkSoft, marginTop: 2 }}>Generate and print product labels</p>
                </div>
            </div>
            <div style={{ display: 'flex', flex: 1, gap: 24, overflow: 'hidden' }}>
                <div style={{ width: '33%', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="prime-card" style={{ background: paper, padding: 16, borderRadius: 14, border: `1.4px solid ${hairline}` }}>
                        <div style={{ position: 'relative', marginBottom: 16 }}>
                            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
                            <input className="prime-input" placeholder="Search Item..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: 32, width: '100%' }} />
                        </div>
                        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {isLoading ? <div style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} /></div>
                                : items.length === 0 ? <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: inkSoft }}>No items found. Add inventory items first.</div>
                                    : filteredItems.length === 0 ? <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: inkSoft }}>No items matching "{searchTerm}"</div>
                                        : filteredItems.map(item => (
                                            <button key={item.id} onClick={() => addToQueue(item)} style={{ width: '100%', textAlign: 'left', padding: 8, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all .15s ease' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = t[50]; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <div>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: ink }}>{item.name}</div>
                                                    <div style={{ fontSize: 10, color: inkSoft }}>{item.sku}</div>
                                                </div>
                                                <Plus size={14} color={inkSoft} />
                                            </button>
                                        ))}
                        </div>
                    </div>
                    <div className="prime-card" style={{ background: paper, padding: 16, borderRadius: 14, border: `1.4px solid ${hairline}`, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: ink, margin: '0 0 8px' }}>Print Queue</h3>
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {printQueue.map(p => (
                                <div key={p.item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', border: `1px solid ${hairline}`, borderRadius: 8, background: t[50] }}>
                                    <div style={{ fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: ink }}>{p.item.name}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button className="prime-btn-secondary" onClick={() => updateQty(p.item.id, -1)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: inkSoft }}><Minus size={12} /></button>
                                        <span style={{ fontSize: 12, fontWeight: 700, width: 16, textAlign: 'center', color: ink }}>{p.qty}</span>
                                        <button className="prime-btn-secondary" onClick={() => updateQty(p.item.id, 1)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: inkSoft }}><Plus size={12} /></button>
                                        <button className="prime-btn-secondary" onClick={() => remove(p.item.id)} style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#b5493f' }}><X size={12} /></button>
                                    </div>
                                </div>
                            ))}
                            {printQueue.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: inkSoft, padding: 32 }}>Queue empty.</div>}
                        </div>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t[50], borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                    <div style={{ padding: 14, background: paper, borderBottom: `1.4px solid ${hairline}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 16 }}>
                            {(['showName', 'showSKU'] as const).map(f => (
                                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: inkSoft, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={f === 'showName' ? showName : showSKU} onChange={e => f === 'showName' ? setShowName(e.target.checked) : setShowSKU(e.target.checked)} style={{ width: 16, height: 16, accentColor: t[500], cursor: 'pointer' }} />
                                    {f === 'showName' ? 'Name' : 'SKU'}
                                </label>
                            ))}
                            <select className="prime-select" value={labelSize} onChange={e => setLabelSize(e.target.value as 'Standard' | 'Small')} style={{ fontSize: 12, border: `1.4px solid ${hairline}`, borderRadius: 8, padding: '4px 8px', background: paper, color: ink, outline: 'none' }}>
                                <option value="Standard">50x30mm</option>
                                <option value="Small">38x25mm</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="prime-btn" onClick={handleSaveImage} disabled={printQueue.length === 0} style={{ padding: '7px 14px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: printQueue.length === 0 ? 0.5 : 1 }}
                                onMouseEnter={e => { if (printQueue.length > 0) e.currentTarget.style.background = t[700]; }}
                                onMouseLeave={e => { if (printQueue.length > 0) e.currentTarget.style.background = t[500]; }}
                            ><Download size={14} /> Save as Image</button>
                            <button className="prime-btn" onClick={handlePrint} disabled={printQueue.length === 0} style={{ padding: '7px 14px', background: t[500], color: '#fff', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', opacity: printQueue.length === 0 ? 0.5 : 1 }}
                                onMouseEnter={e => { if (printQueue.length > 0) e.currentTarget.style.background = t[700]; }}
                                onMouseLeave={e => { if (printQueue.length > 0) e.currentTarget.style.background = t[500]; }}
                            ><Printer size={14} /> Print</button>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 16 }}>
                        <div id="printable-labels" style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                            {printQueue.flatMap(p => Array(p.qty).fill(p.item)).map((item, i) => (
                                <div key={i} className="label-item" style={{ background: '#fff', border: `1px solid ${hairline}`, borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 8, overflow: 'hidden', width: labelSize === 'Standard' ? '50mm' : '38mm', height: labelSize === 'Standard' ? '30mm' : '25mm' }}>
                                    {showName && <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2, marginBottom: 4, color: ink }}>{item.name}</div>}
                                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>{renderBarcode(item)}</div>
                                    {showSKU && <div style={{ fontSize: 8, fontFamily: "'JetBrains Mono', monospace", color: inkSoft, marginTop: 4 }}>{item.sku}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BarcodePrinter;
