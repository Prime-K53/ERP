import React, { useMemo } from 'react';
import { CompanyConfig, FinishingOption, Item } from '../../../types';
import { currencyService } from '../../../services/currencyService';
import { BookOpen, Image, Paperclip, Scissors, Triangle, PanelTop } from 'lucide-react';

const BOM_DEFAULT_RATES = {
  cover: 15.00,
  staple: 0.50,
  tape: 1.20,
};

function computeBomRates(items: Item[]) {
  const rawItems = items?.filter(i => i.type === 'Raw Material' || (i as any).classification === 'raw') || [];
  const coverItem = rawItems.find(i => /card|cover|board/i.test(i.name));
  const stapleItem = rawItems.find(i => /staple/i.test(i.name));
  const tapeItem = rawItems.find(i => /tape|binding tape/i.test(i.name));
  return {
    cover: coverItem ? ((coverItem.cost_price || coverItem.cost || 0) / ((coverItem as any).conversionRate || 1)) : BOM_DEFAULT_RATES.cover,
    staple: stapleItem ? ((stapleItem.cost_price || stapleItem.cost || 0) / ((stapleItem as any).conversionRate || 1)) : BOM_DEFAULT_RATES.staple,
    tape: tapeItem ? ((tapeItem.cost_price || tapeItem.cost || 0) / ((tapeItem as any).conversionRate || 1)) : BOM_DEFAULT_RATES.tape,
  };
}

const OPTION_META: Record<string, { icon: React.ReactNode; bomSource?: 'tape' | 'cover' | 'staple'; desc: string }> = {
  binding: { icon: <BookOpen size={20} />, bomSource: 'tape', desc: 'Per cm of binding tape' },
  coverPages: { icon: <Image size={20} />, bomSource: 'cover', desc: 'Per cover page' },
  stapling: { icon: <Paperclip size={20} />, bomSource: 'staple', desc: 'Per staple' },
  cutting: { icon: <Scissors size={20} />, desc: 'Per batch of sheets' },
  holePunch: { icon: <Triangle size={20} />, desc: 'Per batch of sheets' },
  folding: { icon: <PanelTop size={20} />, desc: 'Per batch of sheets' },
};

const BOM_OPTION_IDS = new Set(['binding', 'coverPages', 'stapling']);

const DEFAULT_FINISHING_OPTIONS: FinishingOption[] = [
  { id: 'binding', name: 'Binding', enabled: false, price: 1.20, description: 'Book binding - comb or spiral', items: [], quantity: 1 },
  { id: 'coverPages', name: 'Cover Pages', enabled: false, price: 15.00, description: 'Front and back cover pages per copy', items: [], quantity: 1 },
  { id: 'stapling', name: 'Stapling', enabled: false, price: 0.50, description: 'Corner or saddle stapling', items: [], quantity: 1 },
  { id: 'cutting', name: 'Cutting & Trimming', enabled: false, price: 30, description: 'Trim edges to clean finish', items: [], batchSize: 10 },
  { id: 'holePunch', name: 'Hole Punching', enabled: false, price: 20, description: 'Punch holes for folder binding', items: [], batchSize: 10 },
  { id: 'folding', name: 'Folding', enabled: false, price: 15, description: 'Fold pages for insertion', items: [], batchSize: 10 },
];

const ALL_OPTION_IDS = new Set(DEFAULT_FINISHING_OPTIONS.map(o => o.id));

function getOptions(config: CompanyConfig): FinishingOption[] {
  const stored = config.productionSettings?.finishingOptions;
  if (stored && stored.length > 0) {
    return stored.filter(o => ALL_OPTION_IDS.has(o.id));
  }
  return DEFAULT_FINISHING_OPTIONS.map(o => ({ ...o }));
}

function setOptions(config: CompanyConfig, options: FinishingOption[]): CompanyConfig {
  const existing = config.productionSettings?.finishingOptions || [];
  const nonFinishing = existing.filter(o => !ALL_OPTION_IDS.has(o.id));
  return {
    ...config,
    productionSettings: {
      ...config.productionSettings,
      finishingOptions: [...nonFinishing, ...options],
    },
  };
}

interface FinishingOptionsTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
  notify: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  items: Item[];
}

export const FinishingOptionsTab: React.FC<FinishingOptionsTabProps> = ({ config, setConfig, notify, items }) => {
  const options = getOptions(config);
  const bomRates = useMemo(() => computeBomRates(items), [items]);

  const resolveBomPrice = (bomSource?: 'tape' | 'cover' | 'staple') => {
    if (!bomSource) return 0;
    return Math.round(bomRates[bomSource] * 100) / 100;
  };

  const updateOption = (id: string, field: keyof FinishingOption, value: any) => {
    const updated = options.map(opt =>
      opt.id === id ? { ...opt, [field]: value } : opt
    );
    setConfig(prev => setOptions(prev, updated));
  };

  const resetDefaults = () => {
    setConfig(prev => setOptions(prev, DEFAULT_FINISHING_OPTIONS.map(o => ({ ...o }))));
    notify('Finishing options reset to defaults', 'info');
  };

  const currency = config.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Scissors size={18} style={{ color: '#1f8577' }} />
            <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em]">Finishing Options Pricing</h3>
          </div>
          <button
            onClick={resetDefaults}
            className="px-4 py-2 text-xs font-bold text-[#5c6567] border border-[#D4D7DC] rounded-lg hover:bg-[#eef7f6] transition-all"
          >
            Reset to Defaults
          </button>
        </div>

        <p className="text-sm text-[#5c6567] mb-6">
          Set the default price and quantity for each finishing option. Binding, Cover Pages, and Stapling prices
          are auto-calculated from inventory raw material costs. Cutting, Hole Punching, and Folding use manual
          prices with a batch size (per how many sheets).
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {options.map(option => {
            const meta = OPTION_META[option.id];
            const isBom = BOM_OPTION_IDS.has(option.id);

            return (
              <div
                key={option.id}
                className="flex flex-col p-4 bg-[#eef7f6] rounded-lg border border-[#D4D7DC] group hover:border-[#a6d9d3] transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-white rounded-lg shadow-sm text-[#1f8577] border border-[#D4D7DC]">
                      {meta?.icon}
                    </div>
                    <div>
                      <p className="font-bold text-[#23282A] text-sm">{option.name}</p>
                      <p className="text-[10px] text-[#5c6567] mt-0.5">{meta?.desc || option.description}</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-2">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={option.enabled}
                      onChange={e => updateOption(option.id, 'enabled', e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1f8577]"></div>
                  </label>
                </div>
                <div className="flex items-center gap-4">
                  {isBom ? (
                    <>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5c6567] font-medium mb-1">Unit Price (from inventory)</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[#5c6567] font-medium">{currency}</span>
                          <input
                            type="number"
                            value={resolveBomPrice(meta?.bomSource)}
                            readOnly
                            className="w-20 px-2.5 py-1.5 border border-[#D4D7DC] rounded-lg text-right text-sm font-bold text-[#5c6567] bg-[#e4ddd1]"
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5c6567] font-medium mb-1">Qty per Copy</p>
                        <input
                          type="number"
                          value={option.quantity ?? 1}
                          onChange={e => updateOption(option.id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                          className="w-16 px-2.5 py-1.5 border border-[#D4D7DC] rounded-lg text-center text-sm font-bold text-[#23282A] bg-white"
                          min={1}
                          step={1}
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[#5c6567] font-medium mb-1">Cost per Copy</p>
                        <p className="text-sm font-bold text-[#1f8577]">
                          {currency}{(resolveBomPrice(meta?.bomSource) * (option.quantity ?? 1)).toFixed(2)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5c6567] font-medium mb-1">Price</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[#5c6567] font-medium">{currency}</span>
                          <input
                            type="number"
                            value={option.price}
                            onChange={e => updateOption(option.id, 'price', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2.5 py-1.5 border border-[#D4D7DC] rounded-lg text-right text-sm font-bold text-[#23282A] bg-white"
                            min={0}
                            step={0.5}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-[#5c6567] font-medium mb-1">Per How Many Sheets</p>
                        <input
                          type="number"
                          value={option.batchSize ?? 10}
                          onChange={e => updateOption(option.id, 'batchSize', Math.max(1, Number(e.target.value) || 1))}
                          className="w-16 px-2.5 py-1.5 border border-[#D4D7DC] rounded-lg text-center text-sm font-bold text-[#23282A] bg-white"
                          min={1}
                          step={1}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
