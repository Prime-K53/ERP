import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useInventory } from '../../context/InventoryContext';
import { Upload, FileText, CheckCircle, AlertTriangle, ArrowLeft, Users, Package, Download, Info, Loader2, Sparkles, FileSpreadsheet, Share, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseCSV, exportToCSV } from '../../services/excelService';
import { generateAccountNumber, generateCustomerId, generateNextId, generateSku } from '../../utils/helpers';
import type { Item, ItemType } from '../../types';
import type { InventoryRole, ResourceSubtype } from '../../types/inventory';
import type { ProductType } from '../../types/service';
import { validateMinimumMarkup } from '../../services/pricingValidationService';

const t = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39' };
const amber = { 100: '#fbead0', 500: '#d99a3f' };
const paper = '#FEFDFB', ink = '#23282A', inkSoft = '#5c6567', hairline = '#e4ddd1', danger = '#b5493f';

const DataImport: React.FC = () => {
    const { notify, companyConfig } = useAuth();
    const { addCustomer, updateCustomer, customers } = useSales();
    const { addItem, updateItem, inventory } = useInventory();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const typeMeta: Record<string, { inventoryRole: InventoryRole; productType: ProductType; resourceSubtype?: ResourceSubtype }> = {
        'Raw Material': { inventoryRole: 'internal', productType: 'INVENTORY', resourceSubtype: 'raw_material' },
        'Material': { inventoryRole: 'internal', productType: 'INVENTORY', resourceSubtype: 'raw_material' },
        'Stationery': { inventoryRole: 'both', productType: 'INVENTORY' },
        'Product': { inventoryRole: 'sellable', productType: 'MANUFACTURED' },
        'Service': { inventoryRole: 'sellable', productType: 'SERVICE' },
    };

    const [importingType, setImportingType] = useState<'Products' | 'Customers' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [importStats, setImportStats] = useState<{ success: number; failed: number } | null>(null);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [importResults, setImportResults] = useState<{ accepted: any[]; rejected: any[] } | null>(null);
    const [activeResultsTab, setActiveResultsTab] = useState<'accepted' | 'rejected'>('accepted');
    const [progress, setProgress] = useState<{ current: number; total: number; percent: number; timeLeft: string } | null>(null);
    const progressStartTime = useRef<number>(0);

    // All business logic preserved — only styling changed
    const normalizePhone = (val: any): string => {
        if (!val) return '';
        let phone = String(val).replace(/^'/, '').trim();
        phone = phone.replace(/[^\d+]/g, '');
        if (phone && !phone.startsWith('+')) phone = '+' + phone;
        return phone;
    };

    const handleFileClick = (type: 'Products' | 'Customers') => { setImportingType(type); setImportStats(null); setPreviewData([]); setImportResults(null); fileInputRef.current?.click(); };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !importingType) return;
        setIsProcessing(true);
        try { const data = await parseCSV(file); setPreviewData(data); }
        catch (error) { notify("Failed to parse CSV file. Please check formatting.", "error"); }
        finally { setIsProcessing(false); e.target.value = ''; }
    };

const processImport = async () => {
    if (!importingType || previewData.length === 0) return;

    setIsProcessing(true);
    setImportStats(null);
    setImportResults(null);
    const total = previewData.length;
    progressStartTime.current = Date.now();
    setProgress({ current: 0, total, percent: 0, timeLeft: 'Calculating...' });

    const accepted: any[] = [];
    const rejected: any[] = [];

    let currentCustomers = [...customers];
    let currentInventory = [...inventory];

    try {
      for (let i = 0; i < previewData.length; i++) {
        const row = previewData[i];
        const elapsed = Date.now() - progressStartTime.current;
        const percent = Math.round(((i + 1) / total) * 100);
        const estimatedTotal = elapsed / ((i + 1) / total);
        const remaining = estimatedTotal - elapsed;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeLeft = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        setProgress({ current: i + 1, total, percent, timeLeft });

        try {
          if (importingType === 'Customers') {
            const name = row['Full name'] || row.Name || row.name || row.CustomerName;
            if (name) {
              const nameLower = name.toLowerCase();
              const exists = currentCustomers.some(
                c => c.name.toLowerCase() === nameLower
              );
              if (exists) {
                rejected.push({ ...row, status: 'Skipped', message: 'Duplicate - customer already exists' });
                continue;
              }
              const phoneValue = normalizePhone(row['Phone number'] || row.Contact || row.Phone || row.contact || row['Phone Number'] || row.PhoneNumber || row.Mobile || row['Mobile Number'] || row.MobileNumber || row.Telephone || row['Phone No'] || row.Phone_Number || '');
                const customer = {
                 id: row['Customer ID'] || row.ID || row.id || generateCustomerId(currentCustomers),
                 name,
                 accountNumber: row['Branch Account'] || row.AccountNumber || row.accountNumber || generateAccountNumber(),
                 contact: phoneValue,
                 phone: phoneValue,
                 email: row.Email || row.email || '',
                 address: row['Billing Address'] || row.Address || row.address || row['Street Address'] || row['Addr'] || row.Addr || '',
                 billingAddress: row['Billing Address'] || row.Address || row.address || row['Street Address'] || row['Addr'] || row.Addr || '',
                 shippingAddress: row['Shipping Address'] || row['Delivery Address'] || '',
                 segment: row.Segment || row.segment || '',
                 balance: Number(row['Opening Balance'] || row.balance || 0),
                 customerType: (row.Type || row.type || row.CustomerType) === 'Credit' ? 'Credit' : 'Retail',
                 walletBalance: Number(row['Wallet Balance'] || row.WalletBalance || row.balance || 0),
                 loyaltyPoints: Number(row.LoyaltyPoints || row.points || 0)
               };
                 const credentials = await addCustomer(customer, { invite: true });
               currentCustomers.push(customer);
               accepted.push({
                 ...row,
                 status: 'Accepted',
                 message: 'Successfully imported',
                 customer_id: customer.id,
                 portal_email: credentials?.email ?? '',
                 invite_code: credentials?.inviteCode ?? '',
               });
             } else {
               rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
             }
           } else {
             const name = row.Name || row.name || row.ItemName;
             if (name) {
               const nameLower = name.toLowerCase();
               const sku = (row.SKU || row.sku || '').toString().trim();
               const exists = currentInventory.some(
                 item => item.name.toLowerCase() === nameLower || (sku && item.sku === sku)
               );
               if (exists) {
                 rejected.push({ ...row, status: 'Skipped', message: 'Duplicate - product/service already exists' });
                 continue;
               }
               const category = row.Category || row.category || 'General';
               const costPriceVal = Number(row.Cost || row.cost || 0);
               const sellingPriceVal = Number(row.Price || row.price || 0);
               const itemType = (row.Type || row.type || 'Product') as ItemType;
               const validation = itemType !== 'Stationery'
                 ? validateMinimumMarkup(sellingPriceVal, costPriceVal)
                 : { valid: true, profit: 0, profitMarkup: 0, minimumMarkup: 0 };
               const meta = typeMeta[itemType] || typeMeta['Product'];
               const item: Item = {
                 id: row.ID || row.id || generateNextId('item', currentInventory, companyConfig),
                 name,
                 sku: sku || generateSku(category, currentInventory),
                 price: sellingPriceVal,
                 cost: costPriceVal,
                 costPrice: costPriceVal,
                 sellingPrice: sellingPriceVal,
                 profitAmount: validation.profit,
                 profitMargin: validation.profitMarkup,
                 minimumMargin: validation.minimumMarkup,
                 pricingValidated: validation.valid,
                 validationTimestamp: new Date().toISOString(),
                 stock: Number(row.Stock || row.stock || 0),
                 minStockLevel: Number(row.MinStock || row.minStock || 10),
                 category: category,
                 type: itemType,
                 unit: row.Unit || row.unit || 'pcs',
                 status: 'Active',
                 inventoryRole: meta.inventoryRole,
                 productType: meta.productType,
                 resourceSubtype: meta.resourceSubtype,
               };
               await addItem(item);
               currentInventory.push(item);
               if (!validation.valid) {
                 accepted.push({ ...row, status: 'Accepted', message: `Imported with low margin (${validation.profitMarkup.toFixed(1)}% vs min ${validation.minimumMarkup}%)` });
               } else {
                 accepted.push({ ...row, status: 'Accepted', message: 'Successfully imported' });
               }
             } else {
               rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
             }
           }
         } catch (err: any) {
           rejected.push({ ...row, status: 'Rejected', message: err.message || 'Unknown error' });
         }
       }

       setImportStats({ success: accepted.length, failed: rejected.length });
       setImportResults({ accepted, rejected });
       setPreviewData([]);
       notify(`Import complete: ${accepted.length} successful, ${rejected.length} skipped.`, accepted.length > 0 ? 'success' : 'error');
     } catch (error) {
       notify("Import failed unexpectedly.", "error");
     } finally {
       setIsProcessing(false);
       setProgress(null);
     }
   };

const processUpdate = async () => {
    if (!importingType || previewData.length === 0) return;

    setIsProcessing(true);
    setImportStats(null);
    setImportResults(null);
    const total = previewData.length;
    progressStartTime.current = Date.now();
    setProgress({ current: 0, total, percent: 0, timeLeft: 'Calculating...' });

    const accepted: any[] = [];
    const rejected: any[] = [];

    try {
      for (let i = 0; i < previewData.length; i++) {
        const row = previewData[i];
        const elapsed = Date.now() - progressStartTime.current;
        const percent = Math.round(((i + 1) / total) * 100);
        const estimatedTotal = elapsed / ((i + 1) / total);
        const remaining = estimatedTotal - elapsed;
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        const timeLeft = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        setProgress({ current: i + 1, total, percent, timeLeft });

        try {
          if (importingType === 'Customers') {
            const name = row['Full name'] || row.Name || row.name || row.CustomerName;
            if (name) {
              const nameLower = name.toLowerCase();
              const existing = customers.find(c => c.name.toLowerCase() === nameLower);
              if (existing) {
                  const phoneValue = normalizePhone(row['Phone number'] || row.Contact || row.Phone || row.contact || row['Phone Number'] || row.PhoneNumber || row.Mobile || row['Mobile Number'] || row.MobileNumber || row.Telephone || row['Phone No'] || row.Phone_Number || row['Tel'] || row.Tel || row['Contact Number'] || row['ContactNo'] || row['Cell'] || row.Cell || '');
                  const updatedCustomer = {
                    ...existing,
                    name,
                    accountNumber: row['Branch Account'] || row.AccountNumber || row.accountNumber || existing.accountNumber,
                    contact: phoneValue || existing.contact,
                    phone: phoneValue || existing.phone,
                    email: row.Email || row.email || existing.email || '',
                    address: row['Billing Address'] || row.Address || row.address || row['Street Address'] || row['Addr'] || row.Addr || existing.address || '',
                    billingAddress: row['Billing Address'] || row.Address || row.address || row['Street Address'] || row['Addr'] || row.Addr || existing.billingAddress || existing.address || '',
                    shippingAddress: row['Shipping Address'] || row['Delivery Address'] || existing.shippingAddress || '',
                   segment: row.Segment || row.segment || existing.segment || '',
                   balance: Number(row['Opening Balance'] || row.balance || existing.balance || 0),
                   customerType: (row.Type || row.type || row.CustomerType) === 'Credit' ? 'Credit' : (existing.customerType || 'Retail'),
                   walletBalance: Number(row['Wallet Balance'] || row.WalletBalance || row.balance || existing.walletBalance || 0),
                   loyaltyPoints: Number(row.LoyaltyPoints || row.points || existing.loyaltyPoints || 0)
                 };
                 await updateCustomer(updatedCustomer);
                 accepted.push({ ...row, status: 'Updated', message: 'Successfully updated' });
               } else {
                 rejected.push({ ...row, status: 'Skipped', message: 'Customer not found - no matching record to update' });
               }
             } else {
               rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
             }
           } else {
             const name = row.Name || row.name || row.ItemName;
             if (name) {
               const nameLower = name.toLowerCase();
               const sku = (row.SKU || row.sku || '').toString().trim();
               const existing = inventory.find(
                 item => item.name.toLowerCase() === nameLower || (sku && item.sku === sku)
               );
               if (existing) {
                 const costPriceVal = Number(row.Cost || row.cost || existing.cost || 0);
                 const sellingPriceVal = Number(row.Price || row.price || existing.price || 0);
                 const itemType = (row.Type || row.type || existing.type || 'Product') as ItemType;
                 const validation = itemType !== 'Stationery'
                   ? validateMinimumMarkup(sellingPriceVal, costPriceVal, existing)
                   : { valid: true, profit: 0, profitMarkup: 0, minimumMarkup: 0 };
                 const meta = typeMeta[itemType] || typeMeta['Product'];
                 const updatedItem: Item = {
                   ...existing,
                   name,
                   sku: sku || existing.sku,
                   price: sellingPriceVal,
                   cost: costPriceVal,
                   costPrice: costPriceVal,
                   sellingPrice: sellingPriceVal,
                   profitAmount: validation.profit,
                   profitMargin: validation.profitMarkup,
                   minimumMargin: validation.minimumMarkup,
                   pricingValidated: validation.valid,
                   validationTimestamp: new Date().toISOString(),
                   stock: Number(row.Stock || row.stock || existing.stock || 0),
                   minStockLevel: Number(row.MinStock || row.minStock || existing.minStockLevel || 10),
                   category: row.Category || row.category || existing.category || 'General',
                   type: itemType,
                   unit: row.Unit || row.unit || existing.unit || 'pcs',
                   inventoryRole: meta.inventoryRole,
                   productType: meta.productType,
                   resourceSubtype: meta.resourceSubtype,
                 };
                 await updateItem(updatedItem);
                 if (!validation.valid) {
                   accepted.push({ ...row, status: 'Updated', message: `Updated with low margin (${validation.profitMarkup.toFixed(1)}% vs min ${validation.minimumMarkup}%)` });
                 } else {
                   accepted.push({ ...row, status: 'Updated', message: 'Successfully updated' });
                 }
               } else {
                 rejected.push({ ...row, status: 'Skipped', message: 'Product not found - no matching record to update' });
               }
             } else {
               rejected.push({ ...row, status: 'Rejected', message: 'Missing Name field' });
             }
           }
         } catch (err: any) {
           rejected.push({ ...row, status: 'Rejected', message: err.message || 'Unknown error' });
         }
       }

       setImportStats({ success: accepted.length, failed: rejected.length });
       setImportResults({ accepted, rejected });
       setPreviewData([]);
       notify(`Update complete: ${accepted.length} updated, ${rejected.length} skipped.`, accepted.length > 0 ? 'success' : 'error');
     } catch (error) {
       notify("Update failed unexpectedly.", "error");
     } finally {
       setIsProcessing(false);
       setProgress(null);
     }
   };

    const handleExportCustomers = () => {
        const data = customers.map(c => ({ 'Customer ID': c.id, 'Full name': c.name, 'Billing Address': c.billingAddress || c.address || '', 'Phone number': c.phone, 'Segment': c.segment, 'Shipping Address': c.shippingAddress || '', 'Opening Balance': c.balance || 0, 'Wallet Balance': c.walletBalance || 0, 'Branch Account': c.accountNumber || '' }));
        exportToCSV(data, `customers_export_${new Date().toISOString().split('T')[0]}`);
        notify("Customer records exported to CSV", "success");
    };

    const handleExportProducts = () => {
        const data = inventory.map(item => ({ ID: item.id, Name: item.name, SKU: item.sku, Type: item.type, Category: item.category, Price: item.sellingPrice || item.price || 0, Cost: item.costPrice || item.cost || 0, Stock: item.stock, Unit: item.unit, 'Min Stock': item.minStockLevel || '', Status: item.status || 'Active' }));
        exportToCSV(data, `inventory_export_${new Date().toISOString().split('T')[0]}`);
        notify("Inventory records exported to CSV", "success");
    };

    const handleExportInvites = () => {
        const portalUrl = `${window.location.origin}/portal/login`;
        const data = (importResults?.accepted || [])
            .filter((r: any) => r.customer_id && r.invite_code)
            .map((r: any) => ({
                'Customer ID': r.customer_id,
                'Full name': r.Name || r.name || '',
                'Email': r.portal_email || '',
                'Portal URL': portalUrl,
                'Invite code': r.invite_code,
            }));
        if (data.length === 0) { notify("No portal invites were generated for this import", "error"); return; }
        exportToCSV(data, `portal_invites_${new Date().toISOString().split('T')[0]}`);
        notify(`${data.length} portal invites exported to CSV`, "success");
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
        color: ink, background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
        padding: '9px 12px', outline: 'none', transition: 'border-color .15s ease'
    };

    return (
        <div style={{ padding: 24, maxWidth: 960, margin: '0 auto', background: t[50], minHeight: '100vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <button onClick={() => navigate(-1)} style={{ padding: 8, borderRadius: '50%', border: `1.4px solid ${hairline}`, background: paper, color: inkSoft, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ArrowLeft size={20} /></button>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: ink, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><Share size={24} color={t[500]} /> Data Migration Center</h1>
                    <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>Bulk import and export your records via CSV</p>
                </div>
            </div>

            {/* Preview Section */}
            {previewData.length > 0 && (
                <div className="prime-card" style={{ background: paper, padding: 16, borderRadius: 14, border: `1.4px solid ${t[200]}`, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                            <h3 style={{ fontSize: 13, fontWeight: 800, color: ink, textTransform: 'uppercase', margin: 0 }}>Import Preview</h3>
                            <p style={{ fontSize: 9, color: inkSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Reviewing {previewData.length} {importingType}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="prime-btn-secondary" onClick={() => setPreviewData([])} style={{ padding: '4px 12px', background: t[50], color: inkSoft, borderRadius: 8, border: 'none', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer' }}>Cancel</button>
                            <button className="prime-btn" onClick={processImport} disabled={isProcessing} style={{ padding: '4px 12px', background: t[500], color: '#fff', borderRadius: 8, border: 'none', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>{isProcessing ? <Loader2 size={10} /> : <CheckCircle size={10} />} Commit</button>
                            <button className="prime-btn" onClick={processUpdate} disabled={isProcessing} style={{ padding: '4px 12px', background: t[600], color: '#fff', borderRadius: 8, border: 'none', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>{isProcessing ? <Loader2 size={10} /> : <Upload size={10} />} Update</button>
                        </div>
                    </div>
                    {/* Progress Bar */}
                    {isProcessing && progress && (
                        <div style={{ padding: '12px 16', background: t[50], borderRadius: 8, border: `1px solid ${hairline}`, marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: ink }}>Processing {progress.current} of {progress.total}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: t[500] }}>{progress.percent}% — ~{progress.timeLeft} remaining</span>
                            </div>
                            <div style={{ width: '100%', height: 8, background: t[100], borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${progress.percent}%`, height: '100%', background: `linear-gradient(90deg, ${t[500]}, ${t[600]})`, borderRadius: 4, transition: 'width 0.3s ease' }} />
                            </div>
                        </div>
                    )}
                    <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${hairline}` }}>
                        <table style={{ width: '100%', fontSize: 9, textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead style={{ background: t[50], color: inkSoft }}>
                                <tr>{['#', ...Object.keys(previewData[0] || {}).slice(0, 5)].map(h => (<th key={h} className="prime-table-header" style={{ padding: '4px 8px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>))}</tr>
                            </thead>
                            <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                                {previewData.slice(0, 5).map((row: any, idx: number) => (
                                    <tr key={idx} style={{ transition: 'all .15s ease' }} onMouseEnter={e => { e.currentTarget.style.background = t[50]; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                        <td className="prime-table-cell" style={{ padding: '4px 8px', fontFamily: "'JetBrains Mono', monospace", color: inkSoft }}>{idx + 1}</td>
                                        {Object.values(row).slice(0, 5).map((val: any, i: number) => (
                                            <td key={i} className="prime-table-cell" style={{ padding: '4px 8px', fontWeight: 600, color: ink, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Import/Export Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                {[
                    { title: 'Import Customers', desc: 'Upload your client database via CSV. Automatically maps names, contacts, and balances.', icon: <Users size={28} />, type: 'Customers' as const, color: t[500] },
                    { title: 'Import Inventory', desc: 'Sync your product catalog via CSV. Handles SKUs, pricing, and initial stock levels.', icon: <Package size={28} />, type: 'Products' as const, color: t[600] },
                    { title: 'Export Customers', desc: 'Download your complete client list as a formatted CSV file for backup or external use.', icon: <FileSpreadsheet size={28} />, type: 'Customers' as const, color: '#d99a3f', isExport: true },
                    { title: 'Export Inventory', desc: 'Extract your entire product list with current stock levels and pricing data to CSV.', icon: <FileSpreadsheet size={28} />, type: 'Products' as const, color: '#8b5cf6', isExport: true },
                ].map((card, i) => (
                    <div key={i} className="prime-card" style={{ background: paper, padding: 24, borderRadius: 14, border: `1.4px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 16, transition: 'all .2s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                    >
                        <div style={{ width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${card.color}15`, color: card.color }}>{card.icon}</div>
                        <h3 style={{ fontSize: 16, fontWeight: 800, color: ink, margin: 0 }}>{card.title}</h3>
                        <p style={{ fontSize: 12, color: inkSoft, lineHeight: 1.5, margin: 0 }}>{card.desc}</p>
                        <button className="prime-btn" onClick={() => card.isExport ? (card.type === 'Customers' ? handleExportCustomers() : handleExportProducts()) : handleFileClick(card.type)}
                            disabled={isProcessing}
                            style={{
                                padding: '10px 20px', borderRadius: 9, fontSize: 10, fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                background: card.isExport ? paper : card.color, color: card.isExport ? ink : '#fff',
                                border: card.isExport ? `1.4px solid ${hairline}` : 'none', transition: 'all .15s ease'
                            }}
                        >{isProcessing && !card.isExport ? <Loader2 size={14} /> : card.isExport ? <Download size={14} /> : <Upload size={14} />}{card.isExport ? 'Export CSV Records' : 'Select CSV File'}</button>
                    </div>
                ))}
            </div>

            {/* Results */}
            {importStats && importResults && (
                <div className="prime-card" style={{ background: paper, borderRadius: 14, border: `1.4px solid ${hairline}`, overflow: 'hidden' }}>
                    <div style={{ background: t[800], padding: 20, color: '#fff' }}>
                        <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, color: t[200] }}><CheckCircle size={14} /> Migration Summary</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div><p style={{ fontSize: 9, fontWeight: 800, color: t[200], textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Successful</p><p style={{ fontSize: 28, fontWeight: 800, color: t[200], margin: 0 }}>{importStats.success}</p></div>
                            <div><p style={{ fontSize: 9, fontWeight: 800, color: t[200], textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Skipped/Failed</p><p style={{ fontSize: 28, fontWeight: 800, color: '#fca5a5', margin: 0 }}>{importStats.failed}</p></div>
                        </div>
                    </div>
                    <div style={{ padding: 20 }}>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            {(['accepted', 'rejected'] as const).map(tab => (
                                <button key={tab} className="prime-btn-secondary" onClick={() => setActiveResultsTab(tab)} style={{
                                    padding: '4px 12px', borderRadius: 8, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', border: 'none',
                                    background: activeResultsTab === tab ? (tab === 'accepted' ? t[100] : '#fef0ee') : t[50],
                                    color: activeResultsTab === tab ? (tab === 'accepted' ? t[800] : danger) : inkSoft
                                }}>{tab} ({importResults[tab].length})</button>
                            ))}
                        </div>
                        <div style={{ overflowX: 'auto', borderRadius: 8, border: `1px solid ${hairline}`, maxHeight: 240, overflowY: 'auto' }}>
                            <table style={{ width: '100%', fontSize: 10, textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead style={{ background: t[50], color: inkSoft, position: 'sticky', top: 0 }}>
                                    <tr>{['#', 'Details', 'Status Message'].map(h => (<th key={h} className="prime-table-header" style={{ padding: '6px 12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>))}</tr>
                                </thead>
                                <tbody style={{ borderTop: `1px solid ${hairline}` }}>
                                    {(activeResultsTab === 'accepted' ? importResults.accepted : importResults.rejected).map((row: any, idx: number) => (
                                        <tr key={idx} className="prime-table-cell" style={{ transition: 'all .15s ease' }} onMouseEnter={e => { e.currentTarget.style.background = '#fff'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                            <td style={{ padding: '6px 12px', fontFamily: "'JetBrains Mono', monospace", color: inkSoft }}>{idx + 1}</td>
                                            <td style={{ padding: '6px 12px' }}>
                                                <div style={{ fontWeight: 700, color: ink }}>{row.Name || row.name || 'Unknown Item'}</div>
                                                <div style={{ fontSize: 9, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{row.SKU || row.AccountNumber || 'No Reference'}</div>
                                                {row.invite_code && (
                                                    <div style={{ fontSize: 9, color: amber[500], fontFamily: "'JetBrains Mono', monospace", fontWeight: 800 }}>Invite: {row.invite_code}</div>
                                                )}
                                            </td>
                                            <td style={{ padding: '6px 12px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontWeight: 700, fontSize: 9, background: activeResultsTab === 'accepted' ? t[100] : '#fef0ee', color: activeResultsTab === 'accepted' ? t[700] : danger }}>
                                                    {activeResultsTab === 'accepted' ? <CheckCircle size={8} /> : <AlertTriangle size={8} />}{row.message}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {(activeResultsTab === 'accepted' ? importResults.accepted : importResults.rejected).length === 0 && (
                                        <tr><td colSpan={3} style={{ padding: '24px 12px', textAlign: 'center', color: inkSoft, fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: 1 }}>No {activeResultsTab} records to display</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {(importingType === 'Customers' && importResults.accepted.some((r: any) => r.invite_code)) && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 16, padding: 14, background: t[50], border: `1px solid ${t[200]}`, borderRadius: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${amber[500]}18`, color: amber[500], flexShrink: 0 }}>
                                        <Key size={16} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: 12, color: ink, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Customer Portal Invites
                                        </div>
                                        <div style={{ fontSize: 11, color: inkSoft, marginTop: 2 }}>
                                            {importResults.accepted.filter((r: any) => r.invite_code).length} account(s) created with a setup code — share the code with each customer. They activate at the portal sign-in screen ("Activate Account" tab). Codes expire in 30 minutes.
                                        </div>
                                    </div>
                                </div>
                                <button className="prime-btn-secondary" onClick={handleExportInvites} style={{ padding: '8px 16px', borderRadius: 9, border: `1.4px solid ${amber[500]}`, background: paper, color: amber[500], fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                                    <Download size={13} /> Export Invites CSV
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ background: t[50], border: `1px solid ${t[200]}`, borderRadius: 14, padding: 16, display: 'flex', gap: 12 }}>
                <Info size={20} color={t[500]} style={{ flexShrink: 0 }} />
                <div>
                    <h4 style={{ fontWeight: 800, color: t[800], fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Data Integrity Rules</h4>
                    <ul style={{ fontSize: 12, color: t[700], margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                        <li>Ensure the first row contains exact column headers.</li>
                        <li>Do not include currency symbols ($) in numeric columns.</li>
                        <li>Existing records with matching IDs will be updated.</li>
                        <li>Existing records with matching Names or SKUs will be skipped automatically.</li>
                        <li>Missing ID fields will trigger automatic system ID generation.</li>
                    </ul>
                </div>
            </div>

            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv" onChange={handleFileChange} />
        </div>
    );
};

export default DataImport;
