import React, { useState } from 'react';
import { Shield, Clock, Download, Trash2, AlertTriangle } from 'lucide-react';

export interface ComplianceConfig {
  gdprEnabled: boolean;
  dataRetentionDays: number;
  autoAnonymizeAfterDays: number;
  consentRequired: boolean;
  privacyPolicyUrl: string;
  dataDeletionEnabled: boolean;
}

const ComplianceSettings: React.FC<{ config: ComplianceConfig; onChange: (c: ComplianceConfig) => void }> = ({ config, onChange }) => {
  const update = (key: keyof ComplianceConfig, value: any) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-4"><Shield size={18} className="text-indigo-600" /><h3 className="font-bold text-slate-900">GDPR & Data Compliance</h3></div>
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
        <div><p className="font-medium text-sm text-slate-800">GDPR Compliance Mode</p><p className="text-xs text-slate-500">Enable GDPR data protection features</p></div>
        <label className="relative inline-flex cursor-pointer"><input type="checkbox" checked={config.gdprEnabled} onChange={e => update('gdprEnabled', e.target.checked)} className="sr-only peer" /><div className={`w-10 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${config.gdprEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`} /></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-700 mb-1">Data Retention Period (days)</label>
          <input type="number" value={config.dataRetentionDays} onChange={e => update('dataRetentionDays', parseInt(e.target.value) || 365)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" min={30} />
          <p className="text-[10px] text-slate-400 mt-1">Data older than this is automatically archived</p></div>
        <div><label className="block text-xs font-semibold text-slate-700 mb-1">Auto-anonymize After (days)</label>
          <input type="number" value={config.autoAnonymizeAfterDays} onChange={e => update('autoAnonymizeAfterDays', parseInt(e.target.value) || 730)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" min={90} />
          <p className="text-[10px] text-slate-400 mt-1">Customer data anonymized after inactivity</p></div>
      </div>
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
        <div><p className="font-medium text-sm text-slate-800">Require Consent for Data Collection</p><p className="text-xs text-slate-500">Show consent prompts for new customers</p></div>
        <label className="relative inline-flex cursor-pointer"><input type="checkbox" checked={config.consentRequired} onChange={e => update('consentRequired', e.target.checked)} className="sr-only peer" /><div className={`w-10 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${config.consentRequired ? 'bg-indigo-600' : 'bg-slate-300'}`} /></label>
      </div>
      <div><label className="block text-xs font-semibold text-slate-700 mb-1">Privacy Policy URL</label>
        <input type="text" value={config.privacyPolicyUrl} onChange={e => update('privacyPolicyUrl', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder="https://yourcompany.com/privacy" /></div>
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
        <div><p className="font-medium text-sm text-slate-800">Enable Right to Erasure</p><p className="text-xs text-slate-500">Allow customers to request data deletion</p></div>
        <label className="relative inline-flex cursor-pointer"><input type="checkbox" checked={config.dataDeletionEnabled} onChange={e => update('dataDeletionEnabled', e.target.checked)} className="sr-only peer" /><div className={`w-10 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${config.dataDeletionEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`} /></label>
      </div>
      <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
        <div><p className="text-xs font-medium text-amber-800">Data Retention Notice</p><p className="text-[10px] text-amber-700 mt-1">Enabling data retention policies will permanently archive or anonymize data that exceeds the configured thresholds. This action cannot be undone.</p></div>
      </div>
    </div>
  );
};

export default ComplianceSettings;
