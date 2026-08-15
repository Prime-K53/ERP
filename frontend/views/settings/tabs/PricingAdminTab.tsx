import React, { useState, useEffect } from 'react';
import { Percent, Tags, Plus, X, Trash2, Save } from 'lucide-react';
import { CompanyConfig, DiscountRule, CustomerPricingTier, TaxRate } from '../../../types';
import { dbService } from '../../../services/db';
import { saveTaxRate } from '../../../services/taxRateService';

interface PricingAdminTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const SCOPE_OPTIONS = ['global', 'category', 'customer_segment', 'customer_specific', 'item_specific'];
const TIER_OPTIONS = ['standard', 'premium', 'wholesale', 'distributor'];

export const PricingAdminTab: React.FC<PricingAdminTabProps> = ({ config, setConfig, notify }) => {
  const [activeSection, setActiveSection] = useState<'discounts' | 'tiers' | 'taxes'>('discounts');
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dbService.getAll<any>('discountRules'),
      dbService.getAll<any>('customerPricingTiers'),
      dbService.getAll<any>('taxRates'),
    ]).then(([d, t, tx]) => {
      setDiscounts(d || []);
      setTiers(t || []);
      setTaxRates(tx || []);
      setLoading(false);
    });
  }, []);

  const saveDiscounts = async (updated: DiscountRule[]) => {
    setDiscounts(updated);
    await dbService.put('discountRules', updated);
    notify('Discount rules saved', 'success');
  };

  const saveTiers = async (updated: any[]) => {
    setTiers(updated);
    await dbService.put('customerPricingTiers', updated);
    notify('Pricing tiers saved', 'success');
  };

  const saveTaxes = async (updated: TaxRate[]) => {
    setTaxRates(updated);
    for (const t of updated) await saveTaxRate(t);
    notify('Tax rates saved', 'success');
  };

  if (loading) return <div className="text-sm text-[#5c6567] p-8">Loading pricing configuration...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex gap-2 border-b border-[#D4D7DC] pb-2">
        {(['discounts', 'tiers', 'taxes'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all ${activeSection === s ? 'bg-white text-[#1f8577] border border-[#D4D7DC] border-b-white -mb-[2px]' : 'text-[#5c6567] hover:text-[#23282A]'}`}>
            {s === 'discounts' ? 'Discount Rules' : s === 'tiers' ? 'Customer Pricing Tiers' : 'Tax Rates'}
          </button>
        ))}
      </div>

      {activeSection === 'discounts' && (
        <DiscountRulesSection rules={discounts} onUpdate={saveDiscounts} notify={notify} />
      )}
      {activeSection === 'tiers' && (
        <PricingTiersSection tiers={tiers} onUpdate={saveTiers} notify={notify} />
      )}
      {activeSection === 'taxes' && (
        <TaxRatesSection rates={taxRates} onUpdate={saveTaxes} notify={notify} />
      )}
    </div>
  );
};

function DiscountRulesSection({ rules, onUpdate, notify }: { rules: DiscountRule[]; onUpdate: (r: DiscountRule[]) => void; notify: any }) {
  const addRule = () => {
    const newRule: DiscountRule = {
      id: `DR-${Date.now()}`,
      name: '',
      type: 'percentage',
      value: 0,
      scope: 'global',
      active: true,
      priority: rules.length,
    };
    onUpdate([...rules, newRule]);
  };

  const updateRule = (idx: number, field: string, value: any) => {
    const updated = rules.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    onUpdate(updated);
  };

  const removeRule = (idx: number) => {
    onUpdate(rules.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="px-6 py-4 border-b border-[#D4D7DC] flex justify-between items-center bg-[#eef7f6]">
        <h3 className="text-xs font-black text-[#23282A] uppercase tracking-wider flex items-center gap-2">
          <Percent size={14} style={{ color: '#1f8577' }} /> Discount Rules
        </h3>
        <button onClick={addRule} className="flex items-center gap-1 px-3 py-1.5 bg-[#1f8577] text-white text-xs font-bold rounded hover:bg-[#1a7366] transition-colors">
          <Plus size={12} /> Add Rule
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="text-sm text-[#5c6567] p-6 text-center">No discount rules configured. Add your first rule above.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#eef7f6] text-[10px] font-bold text-[#5c6567] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-3 py-3">Type</th>
                <th className="text-right px-3 py-3">Value</th>
                <th className="text-left px-3 py-3">Scope</th>
                <th className="text-left px-3 py-3">Scope Value</th>
                <th className="text-center px-3 py-3">Active</th>
                <th className="text-right px-3 py-3">Priority</th>
                <th className="text-center px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4D7DC]">
              {rules.map((rule, idx) => (
                <tr key={rule.id} className="hover:bg-[#eef7f6]">
                  <td className="px-4 py-2.5">
                    <input className="w-full p-1.5 border border-[#D4D7DC] rounded text-xs font-medium" value={rule.name} onChange={e => updateRule(idx, 'name', e.target.value)} placeholder="Rule name" />
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="p-1.5 border border-[#D4D7DC] rounded text-xs" value={rule.type} onChange={e => updateRule(idx, 'type', e.target.value)}>
                      <option value="percentage">%</option>
                      <option value="fixed_amount">Fixed</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input className="w-20 p-1.5 border border-[#D4D7DC] rounded text-xs font-mono text-right" type="number" min="0" step="0.01" value={rule.value} onChange={e => updateRule(idx, 'value', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="p-1.5 border border-[#D4D7DC] rounded text-xs" value={rule.scope} onChange={e => updateRule(idx, 'scope', e.target.value)}>
                      {SCOPE_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input className="w-full p-1.5 border border-[#D4D7DC] rounded text-xs" value={rule.scopeValue || ''} onChange={e => updateRule(idx, 'scopeValue', e.target.value)} placeholder="e.g. segment name" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={rule.active} onChange={e => updateRule(idx, 'active', e.target.checked)} className="w-4 h-4 accent-[#1f8577]" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <input className="w-14 p-1.5 border border-[#D4D7DC] rounded text-xs font-mono text-center" type="number" min="0" value={rule.priority} onChange={e => updateRule(idx, 'priority', parseInt(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => removeRule(idx)} className="text-[#b5493f] hover:text-[#b5493f] transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PricingTiersSection({ tiers, onUpdate, notify }: { tiers: any[]; onUpdate: (r: any[]) => void; notify: any }) {
  const addTier = () => {
    const newTier = { customerId: '', tier: 'standard', markupMultiplier: 1, discountPercent: 0 };
    onUpdate([...tiers, newTier]);
  };

  const updateTier = (idx: number, field: string, value: any) => {
    const updated = tiers.map((t, i) => i === idx ? { ...t, [field]: value } : t);
    onUpdate(updated);
  };

  const removeTier = (idx: number) => {
    onUpdate(tiers.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="px-6 py-4 border-b border-[#D4D7DC] flex justify-between items-center bg-[#eef7f6]">
        <h3 className="text-xs font-black text-[#23282A] uppercase tracking-wider flex items-center gap-2">
          <Tags size={14} style={{ color: '#1f8577' }} /> Customer Pricing Tiers
        </h3>
        <button onClick={addTier} className="flex items-center gap-1 px-3 py-1.5 bg-[#1f8577] text-white text-xs font-bold rounded hover:bg-[#1a7366] transition-colors">
          <Plus size={12} /> Add Tier
        </button>
      </div>
      {tiers.length === 0 ? (
        <p className="text-sm text-[#5c6567] p-6 text-center">No pricing tiers configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#eef7f6] text-[10px] font-bold text-[#5c6567] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Customer ID</th>
                <th className="text-left px-3 py-3">Tier</th>
                <th className="text-right px-3 py-3">Markup Multiplier</th>
                <th className="text-right px-3 py-3">Discount %</th>
                <th className="text-center px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4D7DC]">
              {tiers.map((tier, idx) => (
                <tr key={idx} className="hover:bg-[#eef7f6]">
                  <td className="px-4 py-2.5">
                    <input className="w-full p-1.5 border border-[#D4D7DC] rounded text-xs font-mono" value={tier.customerId} onChange={e => updateTier(idx, 'customerId', e.target.value)} placeholder="Customer ID" />
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="p-1.5 border border-[#D4D7DC] rounded text-xs" value={tier.tier} onChange={e => updateTier(idx, 'tier', e.target.value)}>
                      {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <input className="w-24 p-1.5 border border-[#D4D7DC] rounded text-xs font-mono text-right" type="number" min="0" step="0.01" value={tier.markupMultiplier || 1} onChange={e => updateTier(idx, 'markupMultiplier', parseFloat(e.target.value) || 1)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <input className="w-20 p-1.5 border border-[#D4D7DC] rounded text-xs font-mono text-right" type="number" min="0" max="100" step="0.1" value={tier.discountPercent || 0} onChange={e => updateTier(idx, 'discountPercent', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => removeTier(idx)} className="text-[#b5493f] hover:text-[#b5493f] transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TaxRatesSection({ rates, onUpdate, notify }: { rates: TaxRate[]; onUpdate: (r: TaxRate[]) => void; notify: any }) {
  const addRate = () => {
    const newRate: TaxRate = {
      id: `TAX-${Date.now()}`,
      name: '',
      rate: 0,
      type: 'sales',
      isDefault: false,
      applicableItemTypes: [],
      active: true,
    };
    onUpdate([...rates, newRate]);
  };

  const updateRate = (idx: number, field: string, value: any) => {
    const updated = rates.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    onUpdate(updated);
  };

  const removeRate = (idx: number) => {
    onUpdate(rates.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="px-6 py-4 border-b border-[#D4D7DC] flex justify-between items-center bg-[#eef7f6]">
        <h3 className="text-xs font-black text-[#23282A] uppercase tracking-wider flex items-center gap-2">
          <Save size={14} style={{ color: '#1f8577' }} /> Tax Rates
        </h3>
        <button onClick={addRate} className="flex items-center gap-1 px-3 py-1.5 bg-[#1f8577] text-white text-xs font-bold rounded hover:bg-[#1a7366] transition-colors">
          <Plus size={12} /> Add Tax Rate
        </button>
      </div>
      {rates.length === 0 ? (
        <p className="text-sm text-[#5c6567] p-6 text-center">No tax rates configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#eef7f6] text-[10px] font-bold text-[#5c6567] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-3 py-3">Rate %</th>
                <th className="text-left px-3 py-3">Type</th>
                <th className="text-center px-3 py-3">Default</th>
                <th className="text-center px-3 py-3">Active</th>
                <th className="text-center px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4D7DC]">
              {rates.map((rate, idx) => (
                <tr key={rate.id} className="hover:bg-[#eef7f6]">
                  <td className="px-4 py-2.5">
                    <input className="w-full p-1.5 border border-[#D4D7DC] rounded text-xs font-medium" value={rate.name} onChange={e => updateRate(idx, 'name', e.target.value)} placeholder="e.g. VAT 16%" />
                  </td>
                  <td className="px-3 py-2.5">
                    <input className="w-20 p-1.5 border border-[#D4D7DC] rounded text-xs font-mono text-right" type="number" min="0" max="100" step="0.01" value={rate.rate} onChange={e => updateRate(idx, 'rate', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <select className="p-1.5 border border-[#D4D7DC] rounded text-xs" value={rate.type} onChange={e => updateRate(idx, 'type', e.target.value)}>
                      <option value="sales">Sales</option>
                      <option value="purchase">Purchase</option>
                      <option value="both">Both</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={rate.isDefault} onChange={e => updateRate(idx, 'isDefault', e.target.checked)} className="w-4 h-4 accent-[#1f8577]" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input type="checkbox" checked={rate.active} onChange={e => updateRate(idx, 'active', e.target.checked)} className="w-4 h-4 accent-[#1f8577]" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button onClick={() => removeRate(idx)} className="text-[#b5493f] hover:text-[#b5493f] transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
