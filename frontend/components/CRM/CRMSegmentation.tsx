import React, { useState } from 'react';
import { X, Plus, Tag, Users, Target, Calendar, CheckCircle } from 'lucide-react';

interface Segment {
  id: string;
  name: string;
  criteria: { field: string; operator: string; value: string }[];
  count: number;
}

interface FollowUp {
  id: string;
  customerId: string;
  customerName: string;
  type: 'call' | 'email' | 'meeting';
  note: string;
  dueDate: string;
  completed: boolean;
}

interface Campaign {
  id: string;
  name: string;
  segment: string;
  message: string;
  status: 'draft' | 'active' | 'completed';
  sent: number;
  responded: number;
}

const CRMSegmentation: React.FC = () => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<'segments' | 'followups' | 'campaigns'>('segments');

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-4 mb-6">
        {(['segments', 'followups', 'campaigns'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>
            {t === 'segments' ? 'Segments' : t === 'followups' ? 'Follow-ups' : 'Campaigns'}
          </button>
        ))}
      </div>

      {tab === 'segments' && (
        <div>
          {segments.length === 0 ? (
            <div className="text-center py-8 text-slate-400"><Target size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-sm">No segments yet. Create customer segments based on purchase behavior.</p></div>
          ) : segments.map(s => <div key={s.id} className="p-3 border border-slate-100 rounded-lg mb-2"><p className="font-medium text-sm">{s.name}</p><p className="text-xs text-slate-400">{s.count} customers</p></div>)}
        </div>
      )}

      {tab === 'followups' && (
        <div>
          {followUps.length === 0 ? (
            <div className="text-center py-8 text-slate-400"><Calendar size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-sm">No follow-ups scheduled. Add follow-ups to stay engaged with customers.</p></div>
          ) : followUps.map(f => <div key={f.id} className="p-3 border border-slate-100 rounded-lg mb-2 flex items-center justify-between"><div><p className="font-medium text-sm">{f.customerName}</p><p className="text-xs text-slate-400">{f.type} — {f.note}</p></div><span className="text-[10px] text-slate-400">{new Date(f.dueDate).toLocaleDateString()}</span></div>)}
        </div>
      )}

      {tab === 'campaigns' && (
        <div>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-slate-400"><Users size={32} className="mx-auto mb-2 text-slate-300" /><p className="text-sm">No campaigns yet. Create targeted marketing campaigns.</p></div>
          ) : campaigns.map(c => <div key={c.id} className="p-3 border border-slate-100 rounded-lg mb-2"><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-slate-400">{c.sent} sent • {c.responded} responded</p></div>)}
        </div>
      )}
    </div>
  );
};

export default CRMSegmentation;
