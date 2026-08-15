import React, { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight, ExternalLink, Target, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { useSales } from '../../context/SalesContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { currencyService } from '../../services/currencyService';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';

const pipelineStages = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.4px solid #e4ddd1', borderRadius: 9,
  padding: '9px 12px', background: '#FEFDFB',
  fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: '#23282A',
  outline: 'none'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: 'linear-gradient(155deg, #1f8577, #0f544c)',
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567',
  display: 'flex', alignItems: 'center', gap: 7
};

const cardStyle: React.CSSProperties = {
  background: '#FEFDFB', borderRadius: 14, border: '1px solid #e4ddd1'
};

const LeadBoard: React.FC = () => {
  const { customers = [], updateCustomer, isLoading } = useSales();
  const { companyConfig, notify } = useAuth();
  const navigate = useNavigate();
  const currency = companyConfig?.currencySymbol || currencyService.getCurrency(currencyService.getBaseCurrency())?.symbol || '$';

  const [searchTerm, setSearchTerm] = useState('');
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});

  const leads = useMemo(() => {
    return (customers || []).filter((customer: any) => {
      const status = String(customer.status || '').toLowerCase();
      const hasPipeline = Boolean(customer.pipelineStage);
      return hasPipeline || status === 'lead' || status === 'prospect';
    });
  }, [customers]);

  const filteredLeads = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((customer: any) =>
      String(customer.name || '').toLowerCase().includes(q)
      || String(customer.id || '').toLowerCase().includes(q)
      || String(customer.leadSource || '').toLowerCase().includes(q)
    );
  }, [leads, searchTerm]);

  const leadsByStage = useMemo(() => {
    return pipelineStages.reduce((acc: Record<string, any[]>, stage) => {
      acc[stage] = filteredLeads.filter((lead: any) => (lead.pipelineStage || 'New') === stage);
      return acc;
    }, {});
  }, [filteredLeads]);

  const moveStage = async (lead: any, direction: 'prev' | 'next') => {
    const currentStage = lead.pipelineStage || 'New';
    const currentIndex = pipelineStages.indexOf(currentStage);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= pipelineStages.length) return;
    const nextStage = pipelineStages[nextIndex];
    setIsUpdating(prev => ({ ...prev, [lead.id]: true }));
    try {
      await updateCustomer({
        ...lead,
        pipelineStage: nextStage,
        status: nextStage === 'Won' ? 'Active' : lead.status
      });
      notify(`Moved ${lead.name} to ${nextStage}`, 'success');
    } catch (error: any) {
      notify(error?.message || 'Failed to update stage', 'error');
    } finally {
      setIsUpdating(prev => ({ ...prev, [lead.id]: false }));
    }
  };

  const totalPipelineValue = filteredLeads.reduce((sum: number, lead: any) => sum + Number(lead.estimatedDealValue || 0), 0);
  const wonCount = leadsByStage.Won?.length || 0;
  const conversionRate = filteredLeads.length > 0 ? Math.round((wonCount / filteredLeads.length) * 100) : 0;

  return (
    <div style={{ padding: '12px 12px 24px', background: '#FEFDFB', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }} className="md:!px-6 md:!py-4">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h1 style={{
              fontFamily: "'DM Serif Display', 'Georgia', serif",
              fontSize: 24, fontWeight: 400, color: teal[800], margin: 0, letterSpacing: 0.2
            }}>
              Lead Board
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: inkSoft, fontWeight: 500 }}>
              Track opportunities across your sales pipeline.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3" style={{ gap: 12 }}>
            <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: teal[50], color: teal[600], borderRadius: 8, display: 'flex' }}>
                <Target size={20} />
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, margin: '0 0 6px' }}>Total Leads</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{filteredLeads.length}</p>
              </div>
            </div>
            <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 16, borderLeft: '4px solid #1f8577' }}>
              <div style={{ padding: 10, background: teal[50], color: teal[600], borderRadius: 8, display: 'flex' }}>
                <DollarSign size={20} />
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, margin: '0 0 6px' }}>Pipeline Value</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{totalPipelineValue.toLocaleString()}</p>
              </div>
            </div>
            <div style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'flex-start', gap: 16, borderLeft: '4px solid #d99a3f' }}>
              <div style={{ padding: 10, background: amber[100], color: amber[600], borderRadius: 8, display: 'flex' }}>
                <TrendingUp size={20} />
              </div>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, margin: '0 0 6px' }}>Win Rate</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{conversionRate}%</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search lead by name, id, or source..."
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6" style={{ gap: 12 }}>
          {pipelineStages.map((stage) => (
            <div key={stage} style={{ ...cardStyle, overflow: 'hidden', minHeight: 360, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '10px 12px', borderBottom: `1px solid ${teal[200]}`, background: teal[50],
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target size={14} style={{ color: teal[600] }} />
                  <h3 style={{ fontSize: 11, fontWeight: 700, color: teal[800], textTransform: 'uppercase', letterSpacing: 0.05, margin: 0 }}>
                    {stage}
                  </h3>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                  {leadsByStage[stage]?.length || 0}
                </span>
              </div>
              <div style={{ padding: 8, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isLoading && (
                  <div style={{ fontSize: 12, color: inkSoft, fontStyle: 'italic', padding: 8 }}>Loading...</div>
                )}
                {!isLoading && (leadsByStage[stage]?.length || 0) === 0 && (
                  <div style={{ fontSize: 12, color: inkSoft, fontStyle: 'italic', padding: 8 }}>No leads</div>
                )}
                {(leadsByStage[stage] || []).map((lead: any) => (
                  <div key={lead.id} style={{ ...cardStyle, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: 0 }}>{lead.name}</p>
                        <p style={{ fontSize: 10, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.05, margin: '2px 0 0' }}>{lead.id}</p>
                      </div>
                      <button
                        onClick={() => navigate('/sales-flow/clients', { state: { customerId: lead.id } })}
                        style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: inkSoft, cursor: 'pointer', display: 'flex' }}
                        title="Open client workspace"
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: inkSoft }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <DollarSign size={12} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currency}{Number(lead.estimatedDealValue || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={12} />
                        <span>{lead.nextFollowUpDate || 'No follow-up date'}</span>
                      </div>
                      <div>Source: {lead.leadSource || 'Unspecified'}</div>
                      <div>Score: {Number(lead.leadScore || 0)}</div>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <button
                        onClick={() => moveStage(lead, 'prev')}
                        disabled={stage === 'New' || Boolean(isUpdating[lead.id])}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 10px', borderRadius: 9, fontSize: 11, fontWeight: 600,
                          color: inkSoft, background: paper, border: `1.4px solid ${hairline}`,
                          cursor: 'pointer', opacity: stage === 'New' || Boolean(isUpdating[lead.id]) ? 0.4 : 1
                        }}
                      >
                        <ChevronLeft size={12} />
                        Back
                      </button>
                      <button
                        onClick={() => moveStage(lead, 'next')}
                        disabled={stage === 'Won' || stage === 'Lost' || Boolean(isUpdating[lead.id])}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          padding: '6px 10px', borderRadius: 9, fontSize: 11, fontWeight: 600,
                          color: '#fff', background: 'linear-gradient(155deg, #1f8577, #0f544c)',
                          border: '1.4px solid transparent',
                          boxShadow: '0 4px 10px -4px rgba(15,84,76,.4)',
                          cursor: 'pointer', opacity: (stage === 'Won' || stage === 'Lost' || Boolean(isUpdating[lead.id])) ? 0.4 : 1
                        }}
                      >
                        Next
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LeadBoard;
