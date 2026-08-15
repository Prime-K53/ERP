import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Filter, RefreshCw, FileText, Clock, CheckCircle, Printer
} from 'lucide-react';
import { useSalesStore } from '../../stores/salesStore';
import { SalesExchange } from '../../types';
import { ExchangeRequestModal } from './components/ExchangeRequestModal';
import { ExchangeDetailsModal } from './components/ExchangeDetailsModal';
import { SalesExchangeList } from './components/SalesLists';
import { useDocumentPreview } from '../../hooks/useDocumentPreview';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog, useConfirmDialog } from '../../components/ConfirmDialog';

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

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.4px solid #e4ddd1', borderRadius: 9,
  padding: '9px 12px', background: '#FEFDFB', fontFamily: "'Inter',sans-serif",
  fontSize: 13.5, color: '#23282A', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease'
};

const btnPrimaryStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
  background: 'linear-gradient(155deg, #1f8577, #0f544c)',
  color: '#fff', display: 'flex', alignItems: 'center', gap: 7,
  boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
  transition: 'all .15s ease'
};

const btnGhostStyle: React.CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600,
  padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
  background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567',
  display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease'
};

const pageStyle: React.CSSProperties = {
  padding: '24px', background: '#FEFDFB', minHeight: '100vh',
  fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: ink
};

const cardStyle: React.CSSProperties = {
  background: '#FEFDFB', borderRadius: 14, border: '1px solid #e4ddd1'
};

const SalesExchanges: React.FC = () => {
  const {
    salesExchanges, reprintJobs, fetchExchanges, isLoading,
    deleteSalesExchange, approveSalesExchange, cancelSalesExchange,
    bulkCancelSalesExchanges
  } = useSalesStore();
  const { notify } = useAuth();
  const { handlePreview } = useDocumentPreview();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [selectedExchange, setSelectedExchange] = useState<SalesExchange | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { confirm: confirmDialog, ConfirmDialogComponent } = useConfirmDialog();

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  const filteredExchanges = salesExchanges.filter(ex => {
    const matchesSearch =
      (ex.exchange_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ex.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ex.invoice_id || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || ex.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const handleBulkCancel = async () => {
    const ok = await confirmDialog({
      title: 'Cancel Selected Exchange Requests',
      message: `Cancel ${selectedIds.length} selected exchange request(s)?`,
      type: 'danger',
      confirmText: 'Cancel Requests',
    });
    if (ok) {
      await bulkCancelSalesExchanges(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleAction = async (item: SalesExchange, action: string) => {
    if (action === 'print_note' || action === 'download_pdf') {
      handlePreview('SALES_EXCHANGE', item);
    } else if (action === 'email_note') {
      notify("Email feature for exchanges is managed via the main Sales Dashboard", "info");
    } else if (action === 'approve_exchange') {
      const ok = await confirmDialog({
        title: 'Approve Exchange Request',
        message: 'Approve this exchange request and authorize replacement/reprint?',
        type: 'info',
        confirmText: 'Approve',
      });
      if (ok) {
        await approveSalesExchange(item.id, "Approved from exchanges view");
      }
    } else if (action === 'cancel_exchange') {
      const ok = await confirmDialog({
        title: 'Cancel Exchange Request',
        message: 'Cancel this exchange request and void it?',
        type: 'danger',
        confirmText: 'Cancel Request',
      });
      if (ok) {
        await cancelSalesExchange(item.id);
      }
    }
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div style={pageStyle} className="space-y-6">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{
            fontFamily: "'DM Serif Display', 'Georgia', serif", fontWeight: 400,
            fontSize: 22, color: teal[800], margin: 0, letterSpacing: 0.2
          }}>
            Sales Exchanges
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: inkSoft }}>
            Manage print job replacements and reprints
          </p>
        </div>
        <button
          onClick={() => setIsRequestModalOpen(true)}
          style={btnPrimaryStyle}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
        >
          <Plus size={16} />
          New Exchange Request
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div style={{ ...cardStyle, borderLeft: '4px solid ' + teal[500], padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ padding: '10px', background: teal[50], color: teal[600], borderRadius: 9, flexShrink: 0 }}>
            <RefreshCw size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Total Exchanges</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{salesExchanges.length}</p>
          </div>
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid ' + amber[500], padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ padding: '10px', background: amber[100], color: amber[600], borderRadius: 9, flexShrink: 0 }}>
            <Clock size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Pending Approval</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{salesExchanges.filter(e => e.status.toLowerCase() === 'pending').length}</p>
          </div>
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid ' + teal[400], padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ padding: '10px', background: teal[50], color: teal[500], borderRadius: 9, flexShrink: 0 }}>
            <Printer size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Active Reprints</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{reprintJobs.filter(j => j.status !== 'completed').length}</p>
          </div>
        </div>
        <div style={{ ...cardStyle, borderLeft: '4px solid ' + teal[600], padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ padding: '10px', background: teal[50], color: teal[600], borderRadius: 9, flexShrink: 0 }}>
            <CheckCircle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.08, margin: '0 0 6px' }}>Completed</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{salesExchanges.filter(e => e.status.toLowerCase() === 'completed').length}</p>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 600 }}>
        {selectedIds.length > 0 ? (
          <div style={{
            padding: '14px 18px', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{selectedIds.length} items selected</span>
              <button
                onClick={() => setSelectedIds([])}
                style={{
                  fontSize: 12, background: 'rgba(255,255,255,.18)', color: '#fff',
                  padding: '6px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.06
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.28)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.18)'}
              >
                Clear Selection
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleBulkCancel}
                style={{
                  padding: '8px 16px', background: '#fff', color: teal[700],
                  borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06
                }}
                onMouseEnter={e => e.currentTarget.style.background = teal[50]}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                Cancel Selected
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid ' + hairline, display: 'flex', flexDirection: 'column', gap: 12, background: paper }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, width: 16, height: 16, pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search by SE#, Customer or Invoice..."
                style={{ ...inputStyle, paddingLeft: 36, paddingRight: 14 }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(31,133,119,.08)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter style={{ color: inkSoft, width: 16, height: 16 }} />
              <select
                style={{ ...inputStyle, width: 'auto', minWidth: 160 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                onFocus={e => { e.currentTarget.style.borderColor = teal[400]; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(31,133,119,.08)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="completed">Completed</option>
              </select>
              <button
                onClick={() => fetchExchanges()}
                style={{
                  padding: '9px 12px', color: inkSoft, background: paper,
                  border: '1.4px solid ' + hairline, borderRadius: 9, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', transition: 'all .15s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.color = teal[700]; e.currentTarget.style.borderColor = teal[200]; e.currentTarget.style.background = teal[50]; }}
                onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                title="Refresh"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <SalesExchangeList
            data={filteredExchanges}
            viewMode="List"
            onView={(ex) => setSelectedExchange(ex)}
            onEdit={() => {}}
            onDelete={async (id) => {
              const ok = await confirmDialog({
                title: 'Mark Exchange as Deleted',
                message: 'Mark this exchange record as deleted? Physical deletion remains restricted for audit compliance.',
                type: 'danger',
                confirmText: 'Mark Deleted',
              });
              if (ok) {
                await deleteSalesExchange(id);
              }
            }}
            onAction={handleAction}
            selectedIds={selectedIds}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <ConfirmDialogComponent />

      {isRequestModalOpen && (
        <ExchangeRequestModal
          onClose={() => setIsRequestModalOpen(false)}
        />
      )}

      {selectedExchange && (
        <ExchangeDetailsModal
          exchange={selectedExchange}
          onClose={() => setSelectedExchange(null)}
        />
      )}
    </div>
  );
};

export default SalesExchanges;
