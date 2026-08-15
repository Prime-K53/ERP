import React from 'react';
import { CompanyConfig } from '../../../types';
import { Shield, ExternalLink, Globe, Plus, Trash2, Webhook } from 'lucide-react';

interface IntegrationsTabProps {
  config: CompanyConfig;
  setConfig: React.Dispatch<React.SetStateAction<CompanyConfig>>;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ config, setConfig }) => {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4">
      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Shield size={18} className="text-[#b5493f]" /> Authorization & API Policy
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-black text-[#23282A] uppercase text-base">Force Multi-Factor Auth</p>
              <p className="text-[10px] text-[#5c6567] mt-1 italic font-medium">Require 6-digit TOTP for all administrative roles.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-14 h-7 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#b5493f]"></div>
            </label>
          </div>
          <div className="h-px bg-[#D4D7DC]"></div>
          <div className="grid grid-cols-2 gap-10">
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Min Password Length</label>
                <input
                type="number"
                className="w-full px-3 py-2.5 bg-[#eef7f6] border border-[#D4D7DC] rounded-lg font-bold text-sm outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] transition-all"
                placeholder="e.g. 8"
                defaultValue="8"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Complexity Requirement</label>
              <div className="flex gap-3">
                <span className="px-6 py-3 bg-[#eef7f6] text-[#1f8577] border border-[#D4D7DC] rounded-lg text-[10px] font-black tracking-widest">NUMERIC</span>
                <span className="px-6 py-3 bg-[#1f8577]/50 text-[#1f8577] border border-[#1f8577]/50 rounded-lg text-[10px] font-black tracking-widest">SPECIAL CHAR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <ExternalLink size={18} className="text-[#1f8577]" /> External API Connections
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          {(config.integrationSettings?.externalApis || []).map((apiItem, index) => (
            <div key={apiItem.id} style={{ background: '#eef7f6', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24 }}>
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-white rounded-md shadow-sm text-[#5c6567] border border-[#D4D7DC]">
                    <Globe size={28} />
                  </div>
                  <div>
                    <input
                      type="text"
                      className="bg-transparent font-bold text-[#23282A] uppercase text-xl outline-none border-b-2 border-transparent focus:border-[#1f8577] mb-1 transition-all"
                      value={apiItem.name}
                      onChange={e => {
                        const newApis = [...(config.integrationSettings?.externalApis || [])];
                        newApis[index] = { ...apiItem, name: e.target.value };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } });
                      }}
                    />
                    <p className="text-[10px] text-[#5c6567] font-bold italic tracking-tight">Endpoint: {apiItem.baseUrl}</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={apiItem.enabled}
                    onChange={e => {
                      const newApis = [...(config.integrationSettings?.externalApis || [])];
                      newApis[index] = { ...apiItem, enabled: e.target.checked };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } });
                    }}
                  />
                  <div className="w-12 h-6 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1f8577]"></div>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-10">
                <div>
                  <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">API Base URL</label>
                  <input
                    type="text"
                    placeholder="https://api.example.com"
                    className="w-full px-3 py-2.5 bg-white border border-[#D4D7DC] rounded-lg font-bold text-sm outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] transition-all"
                    value={apiItem.baseUrl}
                    onChange={e => {
                      const newApis = [...(config.integrationSettings?.externalApis || [])];
                      newApis[index] = { ...apiItem, baseUrl: e.target.value };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Authorization Token</label>
                  <div className="relative">
                    <input
                      type="password"
                      className="w-full px-3 py-2.5 bg-white border border-[#D4D7DC] rounded-lg font-bold text-sm outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] pr-12 transition-all"
                      placeholder="xxxxxxxxxxxx"
                      value={apiItem.apiKey || ''}
                      onChange={e => {
                        const newApis = [...(config.integrationSettings?.externalApis || [])];
                        newApis[index] = { ...apiItem, apiKey: e.target.value };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              const newApis = [...(config.integrationSettings?.externalApis || []), { id: `api-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: 'New API Connection', enabled: false, baseUrl: 'https://' }];
              setConfig({ ...config, integrationSettings: { ...config.integrationSettings, externalApis: newApis } });
            }}
            className="w-full py-6 border-2 border-dashed border-[#D4D7DC] rounded-lg text-[#5c6567] font-bold uppercase text-xs tracking-widest hover:border-[#1f8577] hover:text-[#1f8577] hover:bg-[#eef7f6] transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <Plus size={20} /> Register New API Endpoint
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-black text-[#5c6567] uppercase tracking-[0.2em] mb-10 flex items-center gap-3">
          <Webhook size={18} className="text-[#1f8577]" /> Webhook Outlets
        </h3>
        <div style={{ background: '#FEFDFB', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }} className="space-y-8">
          {(config.integrationSettings?.webhooks || []).map((hook, index) => (
            <div key={hook.id} style={{ background: '#eef7f6', borderRadius: 12, border: '1px solid #D4D7DC', padding: 24 }}>
              <div className="flex justify-between items-start mb-10">
                <div className="flex-1">
                  <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-3 px-1">Target Payload URL</label>
                  <input
                    type="text"
                    placeholder="https://your-webhook-endpoint.com"
                    className="w-full bg-white border border-[#D4D7DC] rounded-lg px-3 py-2.5 font-bold text-[#23282A] outline-none focus:ring-4 focus:ring-[#1f8577]/5 focus:border-[#1f8577] transition-all text-sm"
                    value={hook.url}
                    onChange={e => {
                      const newHooks = [...(config.integrationSettings?.webhooks || [])];
                      newHooks[index] = { ...hook, url: e.target.value };
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } });
                    }}
                  />
                </div>
                <div className="ml-10 flex items-center gap-6 pt-7">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={hook.enabled}
                      onChange={e => {
                        const newHooks = [...(config.integrationSettings?.webhooks || [])];
                        newHooks[index] = { ...hook, enabled: e.target.checked };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } });
                      }}
                    />
                    <div className="w-14 h-7 bg-[#e4ddd1] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#1f8577]"></div>
                  </label>
                  <button
                    onClick={() => {
                      const newHooks = (config.integrationSettings?.webhooks || []).filter(h => h.id !== hook.id);
                      setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } });
                    }}
                    className="p-4 bg-white rounded-xl border border-[#D4D7DC] text-[#D4D7DC] hover:text-[#b5493f] hover:border-[#a6d9d3] hover:bg-[#eef7f6] transition-all shadow-sm active:scale-90"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-[#5c6567] uppercase tracking-widest mb-5 px-1">Trigger Events Pipeline</label>
                <div className="flex flex-wrap gap-4">
                  {['sale.created', 'inventory.low', 'customer.created', 'production.complete'].map(event => (
                    <button
                      key={event}
                      onClick={() => {
                        const newEvents = (hook.events || []).includes(event)
                          ? (hook.events || []).filter(e => e !== event)
                          : [...(hook.events || []), event];
                        const newHooks = [...(config.integrationSettings?.webhooks || [])];
                        newHooks[index] = { ...hook, events: newEvents };
                        setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } });
                      }}
                      className={`px-8 py-4 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${(hook.events || []).includes(event) ? 'bg-[#1f8577] text-white border-[#1f8577] shadow-lg shadow-[#1f8577]/20' : 'bg-white text-[#5c6567] border-[#D4D7DC] hover:border-[#a6d9d3] hover:bg-[#eef7f6] hover:text-[#1f8577]'}`}
                    >
                      {event.replace('.', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => {
              const newHooks = [...(config.integrationSettings?.webhooks || []), { id: `hook-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, url: 'https://', events: [], enabled: false }];
              setConfig({ ...config, integrationSettings: { ...config.integrationSettings, webhooks: newHooks } });
            }}
            className="w-full py-6 border-2 border-dashed border-[#D4D7DC] rounded-lg text-[#5c6567] font-bold uppercase text-xs tracking-widest hover:border-[#1f8577] hover:text-[#1f8577] hover:bg-[#eef7f6] transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            <Plus size={20} /> Configure New Webhook Outlet
          </button>
        </div>
      </section>
    </div>
  );
};
