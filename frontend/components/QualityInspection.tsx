import React, { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, FileText, User, Clock } from 'lucide-react';

interface QCItem {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'pending';
  notes?: string;
  checkedBy?: string;
  checkedAt?: string;
}

interface QualityInspectionProps {
  jobId: string;
  jobName: string;
  open: boolean;
  onClose: () => void;
  onComplete: (results: { passed: boolean; items: QCItem[]; notes: string }) => void;
}

const DEFAULT_CHECKS: Omit<QCItem, 'status'>[] = [
  { id: 'color', name: 'Color accuracy matches proof' },
  { id: 'registration', name: 'Registration / alignment' },
  { id: 'trim', name: 'Trim & cut quality' },
  { id: 'binding', name: 'Binding / finishing quality' },
  { id: 'blemishes', name: 'No blemishes, streaks, or marks' },
  { id: 'pages', name: 'Page count & sequence correct' },
  { id: 'stock', name: 'Correct paper stock used' },
];

const QualityInspection: React.FC<QualityInspectionProps> = ({ jobId, jobName, open, onClose, onComplete }) => {
  const [checks, setChecks] = useState<QCItem[]>(DEFAULT_CHECKS.map(c => ({ ...c, status: 'pending' })));
  const [inspector, setInspector] = useState('');
  const [notes, setNotes] = useState('');

  const updateCheck = (id: string, status: 'pass' | 'fail') => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, status, checkedBy: inspector || 'Unassigned', checkedAt: new Date().toISOString() } : c));
  };

  const allChecked = checks.every(c => c.status !== 'pending');
  const hasFailures = checks.some(c => c.status === 'fail');

  const handleComplete = () => {
    onComplete({ passed: !hasFailures, items: checks, notes });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div><h2 className="text-lg font-bold text-slate-900">Quality Inspection</h2><p className="text-sm text-slate-500">{jobName}</p></div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Inspector Name</label>
          <input type="text" value={inspector} onChange={e => setInspector(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" placeholder="Enter your name" />
        </div>
        <div className="space-y-2 mb-6">
          {checks.map(check => (
            <div key={check.id} className={`p-3 rounded-xl border text-sm ${check.status === 'pass' ? 'border-emerald-200 bg-emerald-50' : check.status === 'fail' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{check.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => updateCheck(check.id, 'pass')} className={`p-1.5 rounded-lg ${check.status === 'pass' ? 'bg-emerald-200 text-emerald-700' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'}`}><CheckCircle size={18} /></button>
                  <button onClick={() => updateCheck(check.id, 'fail')} className={`p-1.5 rounded-lg ${check.status === 'fail' ? 'bg-red-200 text-red-700' : 'text-slate-300 hover:text-red-600 hover:bg-red-50'}`}><XCircle size={18} /></button>
                </div>
              </div>
              {check.checkedAt && <p className="text-[10px] text-slate-400 mt-1"><Clock size={10} className="inline mr-1" />{new Date(check.checkedAt).toLocaleTimeString()}</p>}
            </div>
          ))}
        </div>
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Inspection Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none" rows={2} placeholder="Any observations..." />
        </div>
        <div className="flex gap-3">
          <button onClick={handleComplete} disabled={!allChecked} className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <CheckCircle size={16} /> {hasFailures ? 'Complete with Issues' : 'Pass Inspection'}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default QualityInspection;
