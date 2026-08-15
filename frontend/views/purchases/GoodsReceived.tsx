import React, { useState, useMemo, useRef } from 'react';
import { logger } from '@/services/logger';
import { 
  PackageCheck, Plus, Search, Calendar, Filter, CheckCircle, 
  AlertTriangle, Truck, Save, X, Printer, Trash2, Edit2, 
  ClipboardCheck, Barcode, Scale, AlertCircle, Eye, Package, Sparkles, Loader2,
  Ship, ArrowDownRight, Landmark, FileText, Download
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProcurement } from '../../context/ProcurementContext';
import { useInventory } from '../../context/InventoryContext';
import { GoodsReceipt, Purchase, Item, LandingCostItem } from '../../types';
import { useNavigate } from 'react-router-dom';
import { OfflineImage } from '../../components/OfflineImage';
import { pdf } from '@react-pdf/renderer';
import { InvoiceTemplate } from '../shared/components/PDF/InvoiceTemplate';
import { initializePrimePdfFonts } from '../shared/components/PDF/templateSettings';
import { PrimeDocData } from '../shared/components/PDF/schemas';
import { extractDeliveryNoteData } from '../../services/geminiService';
import { attachDocumentSecurity } from '../../utils/documentSecurity';
import { getDefaultDate, validateDateInFY } from '../../utils/financialYearUtils';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const input: React.CSSProperties = { width: '100%', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9, padding: '8px 12px', outline: 'none' };

const GoodsReceived: React.FC = () => {
  const { purchases, goodsReceipts, inventory, warehouses, saveGoodsReceipt, processGoodsReceipt, deleteGoodsReceipt } = useInventory();
  const { suppliers } = useProcurement(); const { notify, companyConfig, isOnline, user } = useAuth();
  const navigate = useNavigate();
  const currency = companyConfig.currencySymbol;

  const [view, setView] = useState<'List' | 'Form'>('List');
  const [activeTab, setActiveTab] = useState<'Pending' | 'History'>('Pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingGrn, setEditingGrn] = useState<Partial<GoodsReceipt>>({});
  const [selectedPO, setSelectedPO] = useState<Purchase | null>(null);
  const magicScanRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  const getSupplierName = (id: string) => suppliers.find(s => s.id === id)?.name || id;
  const getItemName = (id: string) => inventory.find(i => i.id === id)?.name || id;
  const getItemSKU = (id: string) => inventory.find(i => i.id === id)?.sku || '';

  const pendingPOs = useMemo(() => (purchases || []).filter(p => (p.status === 'Ordered' || p.status === 'Partially Received') && getSupplierName(p.supplierId).toLowerCase().includes(searchTerm.toLowerCase())), [purchases, searchTerm, suppliers]);
  const historyGRNs = useMemo(() => (goodsReceipts || []).filter(g => (g.id || '').toLowerCase().includes(searchTerm.toLowerCase()) || (g.reference || '').toLowerCase().includes(searchTerm.toLowerCase()) || (g.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase())).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [goodsReceipts, searchTerm]);

  const handleScanGRN = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!isOnline) { notify("Scanning requires internet connection.", "error"); return; }
      setIsScanning(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          try {
              const extracted = await extractDeliveryNoteData(base64);
              if (extracted) {
                  const matchingPO = (purchases || []).find(po => po.id === extracted.purchaseOrderId || (extracted.purchaseOrderId && po.id.includes(extracted.purchaseOrderId)) || (extracted.reference && po.reference === extracted.reference));
                  const grnItems = (extracted.items || []).map((item: any) => { const matchedInv = (inventory || []).find(i => (i.name || '').toLowerCase().includes((item.name || '').toLowerCase()) || (item.name || '').toLowerCase().includes((i.name || '').toLowerCase())); return { itemId: matchedInv ? matchedInv.id : 'UNKNOWN', name: matchedInv ? matchedInv.name : item.name, orderedQty: item.qty || 0, quantityReceived: item.qty || 0, quantityRejected: 0, warehouseId: (warehouses && warehouses[0]?.id) || 'WH-MAIN', cost: matchedInv?.cost || 0, batchNumber: '', expiryDate: '' }; });
                  setEditingGrn({ id: '', purchaseOrderId: matchingPO ? matchingPO.id : (extracted.purchaseOrderId || 'MANUAL'), date: extracted.date || getDefaultDate(), supplierId: matchingPO ? matchingPO.supplierId : (suppliers.find(s => (s.name || '').toLowerCase().includes((extracted.supplierName || '').toLowerCase()))?.id || 'UNKNOWN'), supplierName: extracted.supplierName || 'Unknown Supplier', status: 'Draft', items: grnItems, reference: extracted.reference || '', receivedBy: 'System AI', landingCosts: matchingPO?.landingCosts || [] });
                  if (matchingPO) { setSelectedPO(matchingPO); notify(`Delivery Note matched to PO #${matchingPO.id}`, "success"); } else notify("Delivery Note scanned. No matching PO found, created as standalone.", "info");
                  setView('Form');
              } else notify("Could not extract data from the image.", "error");
          } catch (err) { logger.error(err); notify("AI Analysis failed.", "error"); }
          finally { setIsScanning(false); }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const handleCreateFromPO = (po: Purchase) => {
      const newItems = (po.items || []).map(item => ({ itemId: item.itemId, name: item.name, orderedQty: item.quantity || 0, quantityReceived: Math.max(0, (item.quantity || 0) - (item.receivedQty || 0)), quantityRejected: 0, warehouseId: po.targetWarehouseId || (warehouses && warehouses[0]?.id) || 'WH-MAIN', cost: item.cost || 0, batchNumber: '', expiryDate: '' }));
      setEditingGrn({ purchaseOrderId: po.id, date: getDefaultDate(), supplierId: po.supplierId, supplierName: getSupplierName(po.supplierId), status: 'Draft', items: newItems, receivedBy: user?.name || 'Current User', landingCosts: po.landingCosts || [] });
      setSelectedPO(po);
      setView('Form');
  };

  const handleEditGrn = (grn: GoodsReceipt) => { setEditingGrn(grn); setSelectedPO((purchases || []).find(p => p.id === grn.purchaseOrderId) || null); setView('Form'); };

  const handleDownloadPDF = async (grn: GoodsReceipt) => {
        try {
            notify("Preparing GRN PDF...", "info");
            const pdfData: PrimeDocData = { number: grn.id, date: new Date(grn.date).toLocaleDateString(), clientName: grn.supplierName, address: 'N/A', items: grn.items.map((i: any) => ({ desc: i.name, qty: i.quantityReceived })), notes: `Ref: ${grn.purchaseOrderId || 'N/A'}` };
            const securedPdfData = await attachDocumentSecurity(pdfData, companyConfig?.companyName);
            await initializePrimePdfFonts();
            const blob = await pdf(<InvoiceTemplate data={securedPdfData as PrimeDocData} type="DELIVERY_NOTE" />).toBlob();
            const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `GRN-${grn.id}.pdf`;
          link.click();
          URL.revokeObjectURL(url);
          notify("GRN PDF downloaded successfully", "success");
      } catch (error) { logger.error("PDF generation failed:", error); notify("Failed to generate PDF", "error"); }
  };

  const handleSaveDraft = async () => {
      if (!editingGrn.purchaseOrderId || !editingGrn.items) return;
      const dateError = validateDateInFY(editingGrn.date || '');
      if (dateError) { notify(dateError, "error"); return; }
      const grnData = { ...editingGrn, id: editingGrn.id || '', supplierName: getSupplierName(editingGrn.supplierId || '') } as GoodsReceipt;
      const savedId = await saveGoodsReceipt(grnData);
      setEditingGrn(prev => ({ ...prev, id: savedId }));
      notify("GRN Draft Saved", "success");
  };

  const handleVerify = async () => {
      if (!editingGrn.id) { notify("Please save draft first.", "error"); return; }
      const dateError = validateDateInFY(editingGrn.date || '');
      if (dateError) { notify(dateError, "error"); return; }
      if (confirm("Verify GRN? This will update inventory stock and capitalize Landing Costs.")) { await processGoodsReceipt(editingGrn as GoodsReceipt); setView('List'); setActiveTab('History'); }
  };

  const handleDelete = (id: string) => { if (confirm("Delete this GRN Draft?")) deleteGoodsReceipt(id); };

  const updateLineItem = (index: number, field: string, value: any) => { const newItems = [...(editingGrn.items || [])]; newItems[index] = { ...newItems[index], [field]: value }; setEditingGrn({ ...editingGrn, items: newItems }); };
  const updateLandingCost = (index: number, field: string, value: any) => { const newCosts = [...(editingGrn.landingCosts || [])]; newCosts[index] = { ...newCosts[index], [field]: value }; setEditingGrn({ ...editingGrn, landingCosts: newCosts }); };
  const toggleAllReceived = () => { const newItems = (editingGrn.items || []).map(item => ({ ...item, quantityReceived: item.orderedQty || 0 })); setEditingGrn({ ...editingGrn, items: newItems }); };

  const renderList = () => (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: paper, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: `1.4px solid ${teal[100]}` }}>
              <button onClick={() => setActiveTab('Pending')}
                style={{ flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: activeTab === 'Pending' ? teal[50] : 'transparent', color: activeTab === 'Pending' ? teal[500] : inkSoft, borderBottom: activeTab === 'Pending' ? `2px solid ${teal[500]}` : '2px solid transparent' }}>
                Pending Orders ({(pendingPOs || []).length})
              </button>
              <button onClick={() => setActiveTab('History')}
                style={{ flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: activeTab === 'History' ? teal[50] : 'transparent', color: activeTab === 'History' ? teal[500] : inkSoft, borderBottom: activeTab === 'History' ? `2px solid ${teal[500]}` : '2px solid transparent' }}>
                Received History
              </button>
          </div>
          <div style={{ padding: 16, borderBottom: `1.4px solid ${teal[100]}`, display: 'flex', gap: 16, background: teal[50] }}>
              <div style={{ position: 'relative', flex: 1 }}>
                  <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} size={16}/>
                  <input type="text" placeholder={activeTab === 'Pending' ? "Search POs or Suppliers..." : "Search GRNs..."} value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    style={{ ...input, paddingLeft: 36 }} className="prime-input"/>
              </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead style={{ background: teal[50], borderBottom: `1.4px solid ${teal[100]}`, position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                        {['PO Number', 'Date', 'Supplier', 'Items', 'Status', 'Action'].map(h => (
                            <th key={h} style={{ padding: 16, fontWeight: 700, fontSize: 12, color: inkSoft, textTransform: 'uppercase', letterSpacing: -0.01, textAlign: h === 'Items' || h === 'Status' ? 'center' : h === 'Action' ? 'right' : 'left' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {activeTab === 'Pending' ? (
                        (pendingPOs || []).length === 0 ? (<tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: inkSoft }}>No pending orders found.</td></tr>
                        ) : (
                            pendingPOs.map(po => (
                                <tr key={po.id} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                  onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: 16, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: teal[600], fontSize: 13 }}>{po.id}</td>
                                    <td style={{ padding: 16, color: inkSoft }}>{new Date(po.date).toLocaleDateString()}</td>
                                    <td style={{ padding: 16, fontWeight: 700, color: ink }}>{getSupplierName(po.supplierId)}</td>
                                    <td style={{ padding: 16, textAlign: 'center' }}>{(po.items || []).length} Lines</td>
                                    <td style={{ padding: 16, textAlign: 'center' }}>
                                        <span style={{ padding: '2px 6px', background: amber[100], color: amber[500], borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1.4px solid ${amber[300]}`, textTransform: 'uppercase', letterSpacing: -0.01 }}>{po.status}</span>
                                    </td>
                                    <td style={{ padding: 16, textAlign: 'right' }}>
                                        <button onClick={() => handleCreateFromPO(po)}
                                          style={{ background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', padding: '6px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 4px 10px -4px rgba(15,84,76,.4)` }}>
                                            <Truck size={14}/> Receive
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )
                    ) : (
                        (historyGRNs || []).length === 0 ? (<tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: inkSoft }}>No received notes found.</td></tr>
                        ) : (
                            historyGRNs.map(grn => (
                                <tr key={grn.id} style={{ borderBottom: `1.4px solid ${teal[50]}` }}
                                  onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: 16, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: ink, fontSize: 13 }}>
                                        {grn.id}
                                        <div style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01 }}>Ref: {grn.purchaseOrderId}</div>
                                    </td>
                                    <td style={{ padding: 16, color: inkSoft }}>{new Date(grn.date).toLocaleDateString()}</td>
                                    <td style={{ padding: 16, fontWeight: 700, color: ink }}>{grn.supplierName}</td>
                                    <td style={{ padding: 16, textAlign: 'center' }}>{(grn.items || []).length} Lines</td>
                                    <td style={{ padding: 16, textAlign: 'center' }}>
                                        <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1.4px solid`, textTransform: 'uppercase', letterSpacing: -0.01, background: grn.status === 'Verified' ? teal[50] : paper, color: grn.status === 'Verified' ? teal[700] : inkSoft, borderColor: grn.status === 'Verified' ? teal[200] : hairline }}>{grn.status}</span>
                                    </td>
                                    <td style={{ padding: 16, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                        <button onClick={() => handleDownloadPDF(grn)} style={{ padding: 8, background: teal[50], border: 'none', borderRadius: 9, color: inkSoft, cursor: 'pointer' }}
                                          onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.background = paper; e.currentTarget.style.border = `1.4px solid ${hairline}`; }}
                                          onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = teal[50]; e.currentTarget.style.border = 'none'; }}>
                                          <Download size={16}/>
                                        </button>
                                        {grn.status === 'Draft' ? (
                                            <button onClick={() => handleEditGrn(grn)} style={{ padding: 8, background: teal[50], border: 'none', borderRadius: 9, color: inkSoft, cursor: 'pointer' }}
                                              onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.background = paper; e.currentTarget.style.border = `1.4px solid ${hairline}`; }}
                                              onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = teal[50]; e.currentTarget.style.border = 'none'; }}>
                                              <Edit2 size={16}/>
                                            </button>
                                        ) : (
                                            <button onClick={() => handleEditGrn(grn)} style={{ padding: 8, background: teal[50], border: 'none', borderRadius: 9, color: inkSoft, cursor: 'pointer' }}
                                              onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.background = paper; e.currentTarget.style.border = `1.4px solid ${hairline}`; }}
                                              onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = teal[50]; e.currentTarget.style.border = 'none'; }}>
                                              <Eye size={16}/>
                                            </button>
                                        )}
                                        {grn.status === 'Draft' && (
                                            <button onClick={() => handleDelete(grn.id)} style={{ padding: 8, background: teal[50], border: 'none', borderRadius: 9, color: inkSoft, cursor: 'pointer' }}
                                              onMouseEnter={e => { e.currentTarget.style.color = danger; e.currentTarget.style.background = paper; e.currentTarget.style.border = `1.4px solid ${hairline}`; }}
                                              onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = teal[50]; e.currentTarget.style.border = 'none'; }}>
                                              <Trash2 size={16}/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )
                    )}
                </tbody>
              </table>
          </div>
      </div>
  );

  const renderForm = () => (
      <div id="grn-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: paper, borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,.1)', border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: `1.4px solid ${teal[100]}`, background: teal[50], display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button onClick={() => setView('List')} style={{ padding: 8, background: 'transparent', border: 'none', borderRadius: '50%', color: inkSoft, cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = hairline; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      <X size={20}/>
                  </button>
                  <div>
                      <h2 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ClipboardCheck style={{ color: teal[500] }}/> Goods Received Note
                      </h2>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, color: inkSoft, marginTop: 4 }}>
                          <span style={{ background: paper, padding: '2px 8px', borderRadius: 4, border: `1.4px solid ${hairline}`, fontFamily: "'JetBrains Mono',monospace", fontSize: 13 }}>{editingGrn.id || 'NEW'}</span>
                          <span>PO: <b>{editingGrn.purchaseOrderId}</b></span>
                          <span>Supplier: <b>{editingGrn.supplierName}</b></span>
                      </div>
                  </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ padding: '4px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700, border: `1.4px solid`, textTransform: 'uppercase', letterSpacing: -0.01, background: editingGrn.status === 'Verified' ? teal[50] : amber[100], color: editingGrn.status === 'Verified' ? teal[700] : amber[500], borderColor: editingGrn.status === 'Verified' ? teal[200] : amber[300] }}>
                      {editingGrn.status?.toUpperCase()}
                  </div>
              </div>
          </div>

          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                  {(editingGrn.landingCosts?.length || 0) > 0 && (
                      <div style={{ marginBottom: 40 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                              <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Ship size={18} style={{ color: teal[500] }}/> Capitalized Landing Costs</h3>
                              <span style={{ fontSize: 10, fontWeight: 700, color: teal[500], textTransform: 'uppercase', letterSpacing: -0.01, background: teal[50], padding: '2px 8px', borderRadius: 20, border: `1.4px solid ${teal[100]}` }}>Verification Phase</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                              {editingGrn.landingCosts?.map((cost, idx) => (
                                  <div key={cost.id} style={{ padding: 16, background: teal[50], borderRadius: 14, border: `1.4px solid ${teal[100]}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                              <div style={{ padding: 6, background: paper, borderRadius: 9, border: `1.4px solid ${teal[100]}`, color: teal[500] }}><Landmark size={14}/></div>
                                              <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{cost.category}</span>
                                          </div>
                                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, fontFamily: "'JetBrains Mono',monospace", color: inkSoft }}>#{(cost.id || '').split('-').pop()}</span>
                                      </div>
                                      <div style={{ position: 'relative' }}>
                                          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: teal[600] }}>{currency}</span>
                                          <input type="number" disabled={editingGrn.status === 'Verified'}
                                            style={{ ...input, paddingLeft: 28, borderColor: teal[200], background: paper, fontWeight: 700 }}
                                            value={cost.amount || ''} onChange={e => updateLandingCost(idx, 'amount', parseFloat(e.target.value) || 0)} className="prime-input"/>
                                      </div>
                                      <p style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, fontStyle: 'italic', margin: 0 }} title={cost.description}>{cost.description || 'No description'}</p>
                                  </div>
                              ))}
                          </div>
                          <div style={{ marginTop: 16, padding: 16, background: teal[800], borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, color: teal[200] }}>Total Capitalized Load</span>
                              <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{currency}{(editingGrn.landingCosts?.reduce((s,c)=>s+(c.amount || 0),0) || 0).toLocaleString()}</span>
                          </div>
                      </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><PackageCheck size={18} style={{ color: teal[500] }}/> Line Items</h3>
                      {editingGrn.status === 'Draft' && (
                          <button onClick={toggleAllReceived} style={{ fontSize: 10, color: teal[600], fontWeight: 700, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: -0.01 }}>
                              <CheckCircle size={14}/> Receive All Ordered
                          </button>
                      )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {(editingGrn.items || []).map((item, idx) => (
                          <div key={idx} style={{ padding: 16, border: `1.4px solid ${hairline}`, borderRadius: 12, background: teal[50] }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = teal[200]}
                            onMouseLeave={e => e.currentTarget.style.borderColor = hairline}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 40, height: 40, background: paper, borderRadius: 9, border: `1.4px solid ${hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <Package size={20} style={{ color: inkSoft }}/>
                                      </div>
                                      <div>
                                          <div style={{ fontWeight: 700, color: ink, fontSize: 13 }}>{getItemName(item.itemId)}</div>
                                          <div style={{ fontSize: 10, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, fontFamily: "'JetBrains Mono',monospace" }}>SKU: {getItemSKU(item.itemId)}</div>
                                      </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase', fontWeight: 700, letterSpacing: -0.01 }}>Ordered</div>
                                      <div style={{ fontWeight: 700, fontSize: 22, color: ink }}>{item.orderedQty || 0}</div>
                                  </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                                  <div>
                                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Received Qty</label>
                                      <input type="number" min="0" disabled={editingGrn.status === 'Verified'}
                                        style={{ ...input, textAlign: 'center', fontWeight: 700, color: teal[600], background: paper }}
                                        value={item.quantityReceived || 0} onChange={e => updateLineItem(idx, 'quantityReceived', parseFloat(e.target.value) || 0)} className="prime-input"/>
                                  </div>
                                  <div>
                                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Rejected Qty</label>
                                      <input type="number" min="0" disabled={editingGrn.status === 'Verified'}
                                        style={{ ...input, textAlign: 'center', fontWeight: 700, background: paper, color: (item.quantityRejected || 0) > 0 ? danger : inkSoft, borderColor: (item.quantityRejected || 0) > 0 ? danger : hairline }}
                                        value={item.quantityRejected || 0} onChange={e => updateLineItem(idx, 'quantityRejected', parseFloat(e.target.value) || 0)} className="prime-input"/>
                                  </div>
                                  <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: -0.01 }}>
                                          <Barcode size={10}/> Batch / Lot #
                                      </label>
                                      <input type="text" disabled={editingGrn.status === 'Verified'}
                                        style={input} placeholder="Optional" value={item.batchNumber || ''} onChange={e => updateLineItem(idx, 'batchNumber', e.target.value)} className="prime-input"/>
                                  </div>
                                  <div>
                                      <label style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, letterSpacing: -0.01 }}>
                                          <Calendar size={10}/> Expiry
                                      </label>
                                      <input type="date" disabled={editingGrn.status === 'Verified'}
                                        style={input} value={item.expiryDate || ''} onChange={e => updateLineItem(idx, 'expiryDate', e.target.value)} className="prime-input"/>
                                  </div>
                              </div>
                              {(item.quantityRejected || 0) > 0 && (
                                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1.4px solid ${hairline}` }}>
                                      <input type="text" disabled={editingGrn.status === 'Verified'}
                                        style={{ ...input, background: `${danger}08`, borderColor: danger, color: danger, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01 }}
                                        placeholder="Reason for rejection (e.g. Damaged, Expired)" value={item.rejectionReason || ''} onChange={e => updateLineItem(idx, 'rejectionReason', e.target.value)} className="prime-input"/>
                                  </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>

              <div style={{ width: 320, background: teal[50], borderLeft: `1.4px solid ${hairline}`, padding: 24, display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>
                  <h3 style={{ fontWeight: 700, color: ink, fontSize: 13, margin: '0 0 16px' }}>GRN Details</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Received Date</label>
                          <input type="date" disabled={editingGrn.status === 'Verified'}
                            style={input} value={editingGrn.date || ''} onChange={e => setEditingGrn({...editingGrn, date: e.target.value})} className="prime-input"/>
                      </div>
                      <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Vendor Delivery Note #</label>
                          <input type="text" disabled={editingGrn.status === 'Verified'}
                            style={input} placeholder="e.g. DN-9988" value={editingGrn.reference || ''} onChange={e => setEditingGrn({...editingGrn, reference: e.target.value})} className="prime-input"/>
                      </div>
                      <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Received To</label>
                          <select style={{ ...input, cursor: 'pointer' }} disabled value={(warehouses && warehouses[0]?.id) || ''} className="prime-select">
                              {(warehouses || []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', marginBottom: 4, letterSpacing: -0.01 }}>Notes</label>
                          <textarea style={{ ...input, minHeight: 96, resize: 'none' }} disabled={editingGrn.status === 'Verified'} placeholder="Condition of goods, delivery method..." value={editingGrn.notes || ''} onChange={e => setEditingGrn({...editingGrn, notes: e.target.value})} className="prime-input"/>
                      </div>
                  </div>
                  {editingGrn.status === 'Draft' && (
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 24, borderTop: `1.4px solid ${hairline}` }}>
                          <button onClick={handleSaveDraft}
                            style={{ width: '100%', padding: 12, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 12, color: inkSoft, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
                            onMouseEnter={e => e.currentTarget.style.background = teal[50]}>
                              <Save size={16}/> Save Draft
                          </button>
                          <button onClick={handleVerify}
                            style={{ width: '100%', padding: 12, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 12, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)` }}>
                              <CheckCircle size={16}/> Verify & Commit Stock
                          </button>
                      </div>
                  )}
                  {editingGrn.status === 'Verified' && (
                       <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                           <div style={{ background: teal[50], border: `1.4px solid ${teal[100]}`, padding: 16, borderRadius: 12, textAlign: 'center' }}>
                               <CheckCircle size={32} style={{ margin: '0 auto 8', color: teal[600] }}/>
                               <h4 style={{ fontWeight: 700, color: teal[800], fontSize: 13, margin: 0 }}>Verified</h4>
                               <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: -0.01, color: teal[600], margin: '4px 0 0' }}>Stock and Landed Costs committed.</p>
                           </div>
                           <button onClick={() => handleDownloadPDF(editingGrn as GoodsReceipt)}
                             style={{ width: '100%', padding: 12, background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', borderRadius: 12, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, boxShadow: `0 6px 16px -6px rgba(15,84,76,.55)` }}>
                               <Download size={16}/> Download GRN PDF
                           </button>
                       </div>
                  )}
              </div>
          </div>
      </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto', height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',sans-serif", fontSize: 13, color: ink }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
           <div>
               <h1 style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase' }}>
                   <PackageCheck style={{ color: teal[500] }} size={20}/> Goods Received
               </h1>
               <p style={{ fontSize: 13, color: inkSoft, marginTop: 2 }}>Receive inventory and finalize Landing Cost capitalization.</p>
           </div>
           <div style={{ display: 'flex', gap: 8 }}>
                {isOnline && view === 'List' && (
                    <>
                        <button onClick={() => magicScanRef.current?.click()} disabled={isScanning}
                          style={{ background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`, color: '#fff', padding: '8px 16px', borderRadius: 12, fontWeight: 700, fontSize: 13, border: 'none', cursor: isScanning ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isScanning ? 0.7 : 1 }}>
                            {isScanning ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }}/> : <Sparkles size={16}/>}
                            {isScanning ? 'Processing...' : 'Scan Delivery Note'}
                        </button>
                        <input type="file" accept="image/*" ref={magicScanRef} style={{ display: 'none' }} onChange={handleScanGRN}/>
                    </>
                )}
           </div>
        </div>
        {view === 'List' ? renderList() : renderForm()}
    </div>
  );
};

export default GoodsReceived;