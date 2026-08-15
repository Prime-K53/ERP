import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Printer, Truck, Wrench, Monitor, Package, MoreVertical, Edit2, Trash2, X, ChevronDown, Calendar, DollarSign, MapPin, User, FileText, AlertCircle } from 'lucide-react';
import { dbService } from '../services/db';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

interface Asset {
  id: string;
  name: string;
  asset_type: string;
  serial_number: string | null;
  model: string | null;
  manufacturer: string | null;
  purchase_date: string | null;
  purchase_cost: number;
  current_value: number;
  useful_life_years: number;
  status: string;
  location: string | null;
  assigned_to: string | null;
  notes: string | null;
  warranty_expiry: string | null;
  last_maintenance: string | null;
  next_maintenance: string | null;
  created_at: string;
}

const ASSET_TYPES = [
  { value: 'printer', label: 'Printer', icon: Printer },
  { value: 'vehicle', label: 'Vehicle', icon: Truck },
  { value: 'equipment', label: 'Equipment', icon: Wrench },
  { value: 'furniture', label: 'Furniture', icon: Package },
  { value: 'computer', label: 'Computer', icon: Monitor },
  { value: 'other', label: 'Other', icon: Package },
];

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  printer: Printer, vehicle: Truck, equipment: Wrench, furniture: Package, computer: Monitor, other: Package,
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'maintenance', label: 'In Maintenance', color: 'bg-amber-100 text-amber-700' },
  { value: 'retired', label: 'Retired', color: 'bg-slate-100 text-slate-600' },
  { value: 'sold', label: 'Sold', color: 'bg-red-100 text-red-700' },
];

const emptyForm = {
  name: '', asset_type: 'printer', serial_number: '', model: '', manufacturer: '',
  purchase_date: '', purchase_cost: 0, current_value: 0, useful_life_years: 5,
  status: 'active', location: '', assigned_to: '', notes: '', warranty_expiry: '',
};

const AssetManagement: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchAssets = async () => {
    try {
      const data = await dbService.getAll('assets');
      setAssets(data || []);
    } catch { setAssets([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAssets(); }, []);

  const filtered = useMemo(() => {
    return assets.filter(a => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.serial_number?.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && a.asset_type !== typeFilter) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return true;
    });
  }, [assets, search, typeFilter, statusFilter]);

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Asset name is required');
    try {
      const assetData = { ...form, id: editingId || `AST-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, createdAt: new Date().toISOString() };
      await dbService.put('assets', assetData);
      setShowForm(false); setEditingId(null); setForm(emptyForm);
      await fetchAssets();
    } catch (err) { alert('Failed to save asset'); }
  };

  const handleEdit = (asset: Asset) => {
    setForm({
      name: asset.name, asset_type: asset.asset_type, serial_number: asset.serial_number || '',
      model: asset.model || '', manufacturer: asset.manufacturer || '',
      purchase_date: asset.purchase_date?.split('T')[0] || '', purchase_cost: asset.purchase_cost,
      current_value: asset.current_value, useful_life_years: asset.useful_life_years,
      status: asset.status, location: asset.location || '', assigned_to: asset.assigned_to || '',
      notes: asset.notes || '', warranty_expiry: asset.warranty_expiry?.split('T')[0] || '',
    });
    setEditingId(asset.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return;
    try { await dbService.delete('assets', id); await fetchAssets(); }
    catch { alert('Failed to delete'); }
  };

  const totalValue = useMemo(() => assets.reduce((s, a) => s + a.current_value, 0), [assets]);
  const activeCount = useMemo(() => assets.filter(a => a.status === 'active').length, [assets]);
  const maintenanceCount = useMemo(() => assets.filter(a => a.status === 'maintenance').length, [assets]);

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', marginLeft: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#23282A' }}>Asset Management</h1>
          <p style={{ fontSize: '13px', color: '#5c6567', marginTop: '4px' }}>Track printers, vehicles, equipment, and other physical assets</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm(emptyForm); setShowForm(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '16px', paddingTop: '10px', color: '#fff', borderRadius: '12px', fontSize: '13px', fontWeight: 600, boxShadow: '0 4px 14px 0 rgba(31,133,119,.08)', paddingRight: '16px', paddingBottom: '10px' }}>
          <Plus size={16} /> Add Asset
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Total Value</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>K {totalValue.toLocaleString()}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#1f8577', transition: 'all .15s ease' }}>
          <div style={{ padding: '10px', background: '#eef7f6', color: '#1f8577', borderRadius: '10px' }}>
            <Monitor size={20} />
          </div>
          <div>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>Active Assets</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{activeCount}</p>
          </div>
        </div>
        <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', display: 'flex', alignItems: 'center', gap: '16px', borderLeftWidth: '4px', borderLeftColor: '#d99a3f', transition: 'all .15s ease' }}>
          <div style={{ padding: '10px', background: '#fbead0', color: '#d99a3f', borderRadius: '10px' }}>
            <Wrench size={20} />
          </div>
          <div>
            <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em', lineHeight: 1, marginBottom: '6px' }}>In Maintenance</p>
            <p style={{ fontSize: '16px', fontWeight: 600, color: '#23282A' }}>{maintenanceCount}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingBottom: '8px' }} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', background: '#FEFDFB', paddingRight: '12px', paddingBottom: '8px' }}>
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', background: '#FEFDFB', paddingRight: '12px', paddingBottom: '8px' }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: '48px', color: '#5c6567', paddingBottom: '48px' }}>Loading assets...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '48px', color: '#5c6567', paddingBottom: '48px' }}>
          <Package size={40} style={{ marginLeft: 'auto', marginBottom: '12px', color: '#5c6567' }} />
          <p style={{ fontWeight: 500 }}>No assets found</p>
          <p style={{ fontSize: '13px', marginTop: '4px' }}>Add your first asset to start tracking.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '16px' }}>
          {filtered.map(asset => {
            const TypeIcon = TYPE_ICONS[asset.asset_type] || Package;
            const statusCfg = STATUS_OPTIONS.find(s => s.value === asset.status) || STATUS_OPTIONS[0];
            return (
              <div key={asset.id} style={{ background: '#FEFDFB', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', padding: '16px', transition: 'boxShadow .15s ease' }}>
                <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '10px', borderRadius: '10px' }}>
                      <TypeIcon size={20} style={{ color: '#1f8577' }} />
                    </div>
                    <div>
                      <h3 style={{ fontWeight: 600, color: '#23282A', fontSize: '13px' }}>{asset.name}</h3>
                      {asset.model && <p style={{ fontSize: '11px', color: '#5c6567' }}>{asset.model}</p>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button onClick={() => handleEdit(asset)} style={{ padding: '6px', color: '#5c6567', borderRadius: '10px' }}><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(asset.id)} style={{ padding: '6px', color: '#5c6567', borderRadius: '10px' }}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                  {asset.asset_type && <span style={{ color: '#5c6567', textTransform: 'capitalize' }}>{asset.asset_type}</span>}
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#5c6567' }}>
                  {asset.serial_number && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={12} /> SN: {asset.serial_number}</div>}
                  {asset.location && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={12} /> {asset.location}</div>}
                  {asset.assigned_to && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><User size={12} /> {asset.assigned_to}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><DollarSign size={12} /> Current value: <span style={{ fontWeight: 600, color: '#23282A' }}>K {asset.current_value.toLocaleString()}</span></div>
                  {asset.next_maintenance && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={12} /> Next maintenance: {new Date(asset.next_maintenance).toLocaleDateString()}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.3)', right: 0, bottom: 0, left: 0 }} onClick={() => setShowForm(false)}>
          <div style={{ background: '#FEFDFB', borderRadius: '16px', width: '100%', maxWidth: '512px', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#23282A' }}>{editingId ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={() => setShowForm(false)} style={{ padding: '4px', color: '#5c6567' }}><X size={20} /></button>
            </div>
            <div style={{ marginTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Asset Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} placeholder="e.g., Heidelberg Press X4" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Type</label>
                  <select value={form.asset_type} onChange={e => setForm({...form, asset_type: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', background: '#FEFDFB', paddingRight: '12px', paddingBottom: '8px' }}>
                    {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Status</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', background: '#FEFDFB', paddingRight: '12px', paddingBottom: '8px' }}>
                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Serial Number</label>
                  <input type="text" value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Model</label>
                  <input type="text" value={form.model} onChange={e => setForm({...form, model: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Manufacturer</label>
                <input type="text" value={form.manufacturer} onChange={e => setForm({...form, manufacturer: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Purchase Date</label>
                  <input type="date" value={form.purchase_date} onChange={e => setForm({...form, purchase_date: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Warranty Expiry</label>
                  <input type="date" value={form.warranty_expiry} onChange={e => setForm({...form, warranty_expiry: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Purchase Cost (K)</label>
                  <input type="number" value={form.purchase_cost} onChange={e => setForm({...form, purchase_cost: parseFloat(e.target.value) || 0})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} min={0} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Current Value (K)</label>
                  <input type="number" value={form.current_value} onChange={e => setForm({...form, current_value: parseFloat(e.target.value) || 0})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} min={0} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Location</label>
                  <input type="text" value={form.location} onChange={e => setForm({...form, location: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} placeholder="e.g., Building A, Floor 2" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Assigned To</label>
                  <input type="text" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} placeholder="Employee name" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#23282A', marginBottom: '4px' }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} style={{ width: '100%', paddingLeft: '12px', paddingTop: '8px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', paddingRight: '12px', paddingBottom: '8px' }} rows={2} />
              </div>
              <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                <button onClick={handleSave} style={{ flex: 1, paddingTop: '10px', color: '#fff', borderRadius: '12px', fontSize: '13px', fontWeight: 600, paddingBottom: '10px' }}>
                  {editingId ? 'Update Asset' : 'Add Asset'}
                </button>
                <button onClick={() => setShowForm(false)} style={{ paddingLeft: '24px', paddingTop: '10px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', fontSize: '13px', color: '#5c6567', paddingRight: '24px', paddingBottom: '10px' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetManagement;
