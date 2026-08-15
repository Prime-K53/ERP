import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { logger } from '@/services/logger';
import { 
  Plus, Search, Filter, Clock, CheckCircle, Truck, X, Edit2, Trash2, 
  AlertTriangle, Calendar, User, Printer, FileText, Phone, Mail,
  ChevronRight, Package, Zap, ArrowRight, MoreVertical, Play, Bell,
  Upload, Download, Send, MessageSquare, File as FileIcon, Eye, Share2, Image as ImageIcon,
  ChevronDown, Check, Ticket, Copy, SendHorizontal
} from 'lucide-react';
import { jobTicketService, JobTicketNotification } from '../../services/jobTicketService';
import { localFileStorage } from '../../services/localFileStorage';
import { JobTicket, JobTicketStatus, JobTicketPriority, JobTicketType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useSales } from '../../context/SalesContext';
import { useDocumentStore } from '../../stores/documentStore';
import { isStoredFileIdentifier } from '../../utils/documentPreview';
import html2canvas from 'html2canvas';
import QRCode from 'qrcode';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const teal = { 50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7', 400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c', 800: '#0b3e39', 900: '#082e2a' };
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const statusConfig: Record<JobTicketStatus, { label: string; color: string; icon: React.ReactNode; badgeBg: string; badgeText: string }> = {
  Received: { label: 'Received', color: 'teal', icon: <Package size={14} />, badgeBg: teal[50], badgeText: teal[700] },
  Processing: { label: 'Processing', color: 'amber', icon: <Printer size={14} />, badgeBg: amber[100], badgeText: amber[600] },
  Ready: { label: 'Ready', color: 'teal', icon: <CheckCircle size={14} />, badgeBg: teal[500], badgeText: '#ffffff' },
  Delivered: { label: 'Delivered', color: 'slate', icon: <Truck size={14} />, badgeBg: '#f1f5f9', badgeText: '#475569' },
  Cancelled: { label: 'Cancelled', color: 'red', icon: <X size={14} />, badgeBg: '#fef2f2', badgeText: '#dc2626' },
};

const priorityConfig: Record<JobTicketPriority, { label: string; bg: string; text: string; border: string }> = {
  Normal: { label: 'Normal', bg: teal[50], text: teal[700], border: teal[200] },
  Rush: { label: 'Rush', bg: amber[100], text: amber[600], border: amber[300] },
  Express: { label: 'Express', bg: '#fef2f2', text: danger, border: '#fecaca' },
  Urgent: { label: 'Urgent', bg: '#fef2f2', text: danger, border: '#fecaca' },
};

const typeConfig: Record<JobTicketType, { label: string; icon: React.ReactNode }> = {
  Photocopy: { label: 'Photocopy', icon: <Printer size={16} /> },
  Printing: { label: 'Printing', icon: <FileText size={16} /> },
  Binding: { label: 'Binding', icon: <Package size={16} /> },
  Scan: { label: 'Scan', icon: <FileText size={16} /> },
  Lamination: { label: 'Lamination', icon: <Package size={16} /> },
  Other: { label: 'Other', icon: <FileText size={16} /> },
};

export const JobTickets: React.FC = () => {
  const { companyConfig, notify } = useAuth(); const { customers } = useSales();
  const currency = companyConfig.currencySymbol;

  const [tickets, setTickets] = useState<JobTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<JobTicketStatus | 'All'>('All');
  const [priorityFilter, setPriorityFilter] = useState<JobTicketPriority | 'All'>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingTicket, setEditingTicket] = useState<JobTicket | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<JobTicket | null>(null);

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const data = await jobTicketService.getAll();
      setTickets(data);
    } catch (error) {
      logger.error('Failed to load tickets:', error);
      notify('Failed to load job tickets', 'error');
    }
    setIsLoading(false);
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const matchesSearch = !searchTerm || 
        (ticket.ticketNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ticket.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ticket.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'All' || ticket.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesPriority;
    }).sort((a, b) => {
      const priorityOrder: Record<string, number> = { Urgent: 0, Express: 1, Rush: 2, Normal: 3 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  const stats = useMemo(() => ({
    total: tickets.length,
    received: tickets.filter(t => t.status === 'Received').length,
    processing: tickets.filter(t => t.status === 'Processing').length,
    ready: tickets.filter(t => t.status === 'Ready').length,
    overdue: tickets.filter(t => {
      if (t.status === 'Delivered' || t.status === 'Cancelled') return false;
      if (!t.dueDate) return false;
      return new Date(t.dueDate) < new Date();
    }).length,
    today: tickets.filter(t => {
      const today = new Date().toISOString().split('T')[0];
      return t.dateReceived.split('T')[0] === today;
    }).length,
  }), [tickets]);

  const handleCreateTicket = async (data: Partial<JobTicket>) => {
    try {
      await jobTicketService.create(data);
      notify('Job ticket created successfully', 'success');
      loadTickets();
      setShowForm(false);
    } catch (error) {
      notify('Failed to create job ticket', 'error');
    }
  };

  const handleUpdateTicket = async (data: Partial<JobTicket>) => {
    if (!editingTicket) return;
    try {
      await jobTicketService.update(editingTicket.id, data);
      notify('Job ticket updated successfully', 'success');
      loadTickets();
      setEditingTicket(null);
    } catch (error) {
      notify('Failed to update job ticket', 'error');
    }
  };

  const handleDeleteTicket = async (id: string) => {
    setConfirmState({
      open: true,
      title: 'Delete Job Ticket',
      message: 'Are you sure you want to delete this job ticket?',
      type: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await jobTicketService.delete(id);
          notify('Job ticket deleted', 'success');
          loadTickets();
          setSelectedTicket(null);
        } catch (error) {
          notify('Failed to delete job ticket', 'error');
        }
      }
    });
  };

  const handleStatusChange = async (id: string, status: JobTicketStatus) => {
    try {
      await jobTicketService.updateStatus(id, status);
      notify(`Status updated to ${statusConfig[status].label}`, 'success');
      loadTickets();
    } catch (error) {
      notify('Failed to update status', 'error');
    }
  };

  const handleProgressChange = async (id: string, progress: number) => {
    try {
      await jobTicketService.updateProgress(id, progress);
      loadTickets();
    } catch (error) {
      notify('Failed to update progress', 'error');
    }
  };

  const getTimeRemaining = (dueDate?: string) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diff = due.getTime() - now.getTime();
    if (diff < 0) return { text: 'Overdue', className: 'color: #dc2626; fontWeight: 700' };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return { text: `${days}d ${hours % 24}h`, className: 'color: #64748b' };
    if (hours > 0) return { text: `${hours}h`, className: 'color: #b97e2b; fontWeight: 700' };
    return { text: '< 1h', className: 'color: #dc2626; fontWeight: 700' };
  };

  const handleExportCard = async (ticket: JobTicket) => {
    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }
    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: paper,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `job-ticket-${ticket.ticketNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      notify('Card exported successfully', 'success');
    } catch (error) {
      logger.error('Export failed:', error);
      notify('Failed to export card', 'error');
    }
  };

  const handleShareCard = async (ticket: JobTicket) => {
    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }
    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: paper,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          notify('Failed to generate image', 'error');
          return;
        }
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `job-ticket-${ticket.ticketNumber}.png`, { type: 'image/png' });
          const shareData = {
            title: `Job Ticket ${ticket.ticketNumber}`,
            text: `Job ticket for ${ticket.customerName} - ${currency}${ticket.total.toLocaleString()}`,
            files: [file],
          };
          if (navigator.canShare(shareData)) {
            try {
              await navigator.share(shareData);
              notify('Card shared successfully', 'success');
              return;
            } catch (shareError) {
              // fall through to copy
            }
          }
        }
        const link = document.createElement('a');
        link.download = `job-ticket-${ticket.ticketNumber}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        notify('Card downloaded', 'success');
      }, 'image/png');
    } catch (error) {
      logger.error('Share failed:', error);
      notify('Failed to share card', 'error');
    }
  };

  const handleSendCardToCustomer = async (ticket: JobTicket) => {
    if (!ticket.customerPhone) {
      notify('No customer phone number', 'error');
      return;
    }
    const cardElement = document.getElementById(`ticket-card-${ticket.id}`);
    if (!cardElement) {
      notify('Card element not found', 'error');
      return;
    }
    try {
      const canvas = await html2canvas(cardElement, {
        backgroundColor: paper,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          notify('Failed to generate image', 'error');
          return;
        }
        const file = new File([blob], `job-ticket-${ticket.ticketNumber}.png`, { type: 'image/png' });
        const message = `Job Ticket #${ticket.ticketNumber}\nCustomer: ${ticket.customerName}\nAmount: ${currency}${ticket.total.toLocaleString()}\nStatus: ${ticket.status}`;
        const waUrl = `https://wa.me/${ticket.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message + '\n\nImage attached')}`;
        window.open(waUrl, '_blank');
        notify('Opening WhatsApp...', 'success');
      }, 'image/png');
    } catch (error) {
      logger.error('Send to customer failed:', error);
      notify('Failed to send card to customer', 'error');
    }
  };

  const companyName = companyConfig?.companyName || 'Prime ERP';

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 12px 24px',
      maxWidth: 1600, margin: '0 auto', width: '100%', fontFamily: "'Inter', sans-serif",
      fontWeight: 400, overflowY: 'auto', background: paper,
    }}>
      {/* Header Section */}
      <div style={{
        marginBottom: 24, padding: '16px 20px', background: paper,
        borderRadius: 14, border: `1px solid ${hairline}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 48, height: 48,
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 4px 12px -3px rgba(15,84,76,.3)`, flexShrink: 0,
            }}>
              <Printer size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif", fontSize: 20, fontWeight: 400,
                color: teal[800], letterSpacing: 0.2, lineHeight: 1.2, margin: 0,
              }} className="md:!text-[22px]">Job Tickets</h1>
              <p style={{ fontSize: 13.5, color: inkSoft, fontWeight: 500, lineHeight: 1.6, marginTop: 4 }}>Manage print jobs and service orders</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '10px 18px',
              background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
              color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13.5,
              display: 'flex', alignItems: 'center', gap: 8,
              border: 'none', cursor: 'pointer',
              boxShadow: `0 4px 12px -4px rgba(15,84,76,.4)`,
              transition: 'all .15s ease',
            }}
          >
            <Plus size={18} />
            New Job Ticket
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { label: 'Total', value: stats.total, icon: <Ticket size={20} />, iconBg: teal[50], iconColor: teal[600] },
          { label: 'Received', value: stats.received, icon: <Package size={20} />, iconBg: teal[50], iconColor: teal[600] },
          { label: 'Processing', value: stats.processing, icon: <Clock size={20} />, iconBg: amber[100], iconColor: amber[600] },
          { label: 'Ready', value: stats.ready, icon: <CheckCircle size={20} />, iconBg: teal[50], iconColor: teal[500] },
          { label: 'Overdue', value: stats.overdue, icon: <AlertTriangle size={20} />, iconBg: '#fef2f2', iconColor: danger },
          { label: 'Today', value: stats.today, icon: <Calendar size={20} />, iconBg: teal[50], iconColor: teal[600] },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: paper, padding: '12px 16px', borderRadius: 14,
            border: `1px solid ${hairline}`, borderLeft: `4px solid ${teal[500]}`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
            transition: 'all .2s ease', cursor: 'default',
          }}>
            <div style={{
              padding: 10, borderRadius: 10,
              background: stat.iconBg, color: stat.iconColor, flexShrink: 0,
            }}>
              {stat.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, lineHeight: 1.2, marginBottom: 6 }}>
                {stat.label}
              </p>
              <p style={{ fontSize: 20, fontWeight: 600, color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 24, marginBottom: 24 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft }} />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px 9px 36px',
              background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
              fontSize: 13.5, fontWeight: 500, color: ink, outline: 'none',
              fontFamily: "'Inter', sans-serif",
              transition: 'border-color .15s ease, box-shadow .15s ease',
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as JobTicketStatus | 'All')}
          style={{
            padding: '9px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
            fontSize: 13.5, fontWeight: 500, color: ink, outline: 'none', cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <option value="All">All Status</option>
          {Object.entries(statusConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as JobTicketPriority | 'All')}
          style={{
            padding: '9px 12px', background: paper, border: `1.4px solid ${hairline}`, borderRadius: 9,
            fontSize: 13.5, fontWeight: 500, color: ink, outline: 'none', cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <option value="All">All Priority</option>
          {Object.entries(priorityConfig).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 48, color: inkSoft }}>Loading tickets...</div>
      ) : filteredTickets.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, color: inkSoft }}>
          <Package size={48} style={{ marginBottom: 12, opacity: 0.5 }} />
          <p style={{ fontSize: 14 }}>No job tickets found</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filteredTickets.map((ticket) => {
            const timeRemaining = getTimeRemaining(ticket.dueDate);
            return (
              <JobTicketCard
                key={ticket.id}
                ticket={ticket}
                currency={currency}
                timeRemaining={timeRemaining}
                onClick={() => setSelectedTicket(ticket)}
                onExport={() => handleExportCard(ticket)}
                onShare={() => handleShareCard(ticket)}
                onSendToCustomer={() => handleSendCardToCustomer(ticket)}
              />
            );
          })}
        </div>
      )}

      {(showForm || editingTicket) && (
        <JobTicketForm
          ticket={editingTicket}
          customers={customers}
          onSave={editingTicket ? handleUpdateTicket : handleCreateTicket}
          onClose={() => { setShowForm(false); setEditingTicket(null); }}
        />
      )}

      {selectedTicket && (
        <JobTicketDetail
          ticket={selectedTicket}
          currency={currency}
          onEdit={() => { setEditingTicket(selectedTicket); setSelectedTicket(null); }}
          onDelete={() => handleDeleteTicket(selectedTicket.id)}
          onStatusChange={handleStatusChange}
          onProgressChange={handleProgressChange}
          onClose={() => setSelectedTicket(null)}
          allTickets={tickets}
          onReorder={(ticket) => { setEditingTicket(ticket); setSelectedTicket(null); }}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => !open && setConfirmState(c => ({ ...c, open: false }))}
        onConfirm={() => {
          confirmState.onConfirm?.();
          setConfirmState(c => ({ ...c, open: false }));
        }}
        onCancel={() => setConfirmState(c => ({ ...c, open: false }))}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        type={confirmState.type || 'question'}
      />
    </div>
  );
};

interface JobTicketCardProps {
  ticket: JobTicket;
  currency: string;
  timeRemaining: { text: string; className?: string } | null;
  onClick: () => void;
  onExport: () => void;
  onShare?: () => void;
  onSendToCustomer?: () => void;
}

const JobTicketCard: React.FC<JobTicketCardProps> = ({ ticket, currency, timeRemaining, onClick, onExport, onShare, onSendToCustomer }) => {
  const { companyConfig, notify } = useAuth();
  const [qrSrc, setQrSrc] = useState<string>('');

  const isActive = ['Received', 'Processing', 'Ready'].includes(ticket.status);

  const statusBadge = statusConfig[ticket.status];
  const priorityBadge = priorityConfig[ticket.priority];

  useEffect(() => {
    const qrData = JSON.stringify({
      id: ticket.id,
      number: ticket.ticketNumber,
      customer: ticket.customerName,
      total: ticket.total
    });
    QRCode.toDataURL(qrData, {
      width: 200,
      margin: 1,
      color: {
        dark: '#1e293b',
        light: paper,
      }
    }).then(setQrSrc).catch(console.error);
  }, [ticket, companyConfig]);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(ticket.id);
    notify('Ticket ID copied to clipboard', 'success');
  };

  return (
    <div
      id={`ticket-card-${ticket.id}`}
      onClick={onClick}
      style={{
        fontFamily: "'Inter', sans-serif", fontFeatureSettings: '"tnum"', maxWidth: '100%',
        background: paper, borderRadius: 14, border: `1px solid ${hairline}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'all .3s ease',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `${teal[500]}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Ticket size={16} color={teal[600]} />
          </div>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif", fontSize: 16, fontWeight: 700,
            letterSpacing: -0.3, lineHeight: 1.2, color: teal[700], textTransform: 'uppercase', margin: 0,
          }}>
            Job Ticket
          </h2>
        </div>
        <div style={{
          fontSize: 10, fontWeight: 500, lineHeight: 1.4,
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 999,
          background: statusBadge.badgeBg, color: statusBadge.badgeText,
        }}>
          {isActive && (
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: teal[500],
            }} />
          )}
          {ticket.status}
        </div>
      </div>

      {/* Main Body */}
      <div style={{ display: 'flex', flex: 1, color: ink, fontSize: 12 }}>
        {/* Left Column */}
        <div style={{ flex: 1 }}>
          {/* Row 1: Ticket # | Quantity */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: `${teal[500]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Ticket size={12} color={teal[600]} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Ticket #</p>
                <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ticket.ticketNumber}
                </p>
              </div>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: `${teal[500]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Package size={12} color={teal[600]} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Qty</p>
                <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ticket.quantity.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Row 2: Customer */}
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 8,
              background: `${teal[500]}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={12} color={teal[600]} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Customer</p>
              <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ticket.customerName}
              </p>
            </div>
          </div>

          {/* Row 3: Amount | Due Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: `${teal[500]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: teal[600], fontFamily: "'JetBrains Mono', monospace" }}>{currency}</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Amount</p>
                <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currency}{ticket.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: `${teal[500]}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Calendar size={12} color={teal[600]} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Due</p>
                <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                  {ticket.dueDate
                    ? new Date(ticket.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Row 4: Description */}
          <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 8,
              background: `${teal[500]}15`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={12} color={teal[600]} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.4, color: inkSoft }}>Description</p>
              <p style={{ fontSize: 10, fontWeight: 400, lineHeight: 1.5, color: inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ticket.description || 'No description provided'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column — QR Code */}
        <div style={{
          width: 140, padding: 12, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          background: `${teal[500]}08`,
        }}>
          <div style={{ padding: 8, border: '2px dashed', borderColor: hairline, borderRadius: 12, background: paper }}>
            {qrSrc ? (
              <img src={qrSrc} alt="QR Code" style={{ width: 80, height: 80 }} />
            ) : (
              <div style={{ width: 80, height: 80, borderRadius: 8, background: `${teal[500]}08` }} />
            )}
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, fontWeight: 400, lineHeight: 1.4, color: inkSoft }}>Scan to view</p>
            <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.4, color: ink }}>QR</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `${teal[500]}08`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={10} style={{ color: inkSoft, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 400, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums', color: inkSoft }}>
            {new Date(ticket.dateReceived).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 400, lineHeight: 1.4, color: inkSoft }}>
            ID:{' '}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, fontWeight: 500, color: inkSoft }}>
              {ticket.id}
            </span>
          </span>
          <button
            onClick={handleCopyId}
            style={{ padding: 2, border: '1px solid transparent', borderRadius: 4, background: 'transparent', cursor: 'pointer', transition: 'all .15s ease' }}
            title="Copy Ticket ID"
          >
            <Copy size={10} color={inkSoft} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onShare && (
            <button
              onClick={(e) => { e.stopPropagation(); onShare(); }}
              style={{ padding: 2, border: '1px solid transparent', borderRadius: 4, background: 'transparent', cursor: 'pointer', transition: 'all .15s ease' }}
              title="Share Card"
            >
              <Share2 size={10} color={inkSoft} />
            </button>
          )}
          {onSendToCustomer && ticket.customerPhone && (
            <button
              onClick={(e) => { e.stopPropagation(); onSendToCustomer(); }}
              style={{ padding: 2, border: '1px solid transparent', borderRadius: 4, background: 'transparent', cursor: 'pointer', transition: 'all .15s ease' }}
              title="Send to Customer via WhatsApp"
            >
              <SendHorizontal size={10} color={inkSoft} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface JobTicketFormProps {
  ticket?: JobTicket | null;
  customers: any[];
  onSave: (data: Partial<JobTicket>) => void;
  onClose: () => void;
}

const JobTicketForm: React.FC<JobTicketFormProps> = ({ ticket, customers, onSave, onClose }) => {
  const { companyConfig } = useAuth();
  const currency = companyConfig.currencySymbol;
  const companyName = companyConfig?.companyName || 'Prime ERP';

  const [formData, setFormData] = useState({
    type: ticket?.type || 'Printing' as JobTicketType,
    customerId: ticket?.customerId || '',
    customerName: ticket?.customerName || 'Walk-in',
    customerPhone: ticket?.customerPhone || '',
    description: ticket?.description || '',
    quantity: ticket?.quantity || 1,
    priority: ticket?.priority || 'Normal' as JobTicketPriority,
    paperSize: ticket?.paperSize || 'A4',
    paperType: ticket?.paperType || 'A4 80g',
    colorMode: ticket?.colorMode || 'BlackWhite',
    sides: ticket?.sides || 'Single',
    unitPrice: ticket?.unitPrice || 2.00,
    totalOverride: ticket?.total || 0,
    dueDate: ticket?.dueDate?.split('T')[0] || '',
    dueTime: ticket?.dueTime || '',
    notes: ticket?.notes || '',
    operatorName: ticket?.operatorName || '',
    machineName: ticket?.machineName || '',
  });

  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchTerm) return customers.slice(0, 10);
    const search = customerSearchTerm.toLowerCase();
    return customers.filter(c =>
      c.name?.toLowerCase().includes(search) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search)
    ).slice(0, 10);
  }, [customers, customerSearchTerm]);

  const handleCustomerSelect = (customer: any) => {
    setFormData({
      ...formData,
      customerId: customer.id?.toString() || '',
      customerName: customer.name || 'Walk-in',
      customerPhone: customer.phone || '',
    });
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalPreview = useMemo(() => {
    const subtotal = formData.quantity * formData.unitPrice;
    let rushFee = 0;
    if (formData.priority === 'Rush') rushFee = subtotal * 0.25;
    else if (formData.priority === 'Express') rushFee = subtotal * 0.50;
    else if (formData.priority === 'Urgent') rushFee = subtotal * 1.00;
    const afterRush = subtotal + rushFee;
    const hasCustomTotal = formData.totalOverride > 0;
    const finalTotal = hasCustomTotal ? formData.totalOverride : afterRush;
    return { subtotal, rushFee, total: finalTotal };
  }, [formData.quantity, formData.unitPrice, formData.priority, formData.totalOverride]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...formData, dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)', padding: '20px',
      fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div style={{
        width: '100%', maxWidth: 1020, maxHeight: '92vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
      }}>
        {/* Teal Accent Stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          background: `linear-gradient(90deg, ${teal[600]}, ${teal[400]} 40%, ${amber[500]} 100%)`
        }} />

        {/* Modal Header */}
        <div style={{
          background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
          padding: '22px 28px 18px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(255,255,255,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Printer size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: '#fff', lineHeight: 1.2, margin: 0 }}>
                {ticket ? 'Edit Job Ticket' : 'New Job Ticket'}
              </h2>
              <p style={{ fontSize: 12, color: `${teal[100]}`, fontWeight: 500, marginTop: 2 }}>{companyName}</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: 8, background: 'rgba(255,255,255,.1)', borderRadius: 10,
            border: 'none', cursor: 'pointer', transition: 'background .15s ease',
          }}>
            <X size={20} color="#fff" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {/* Customer Section */}
          <div style={{
            background: paper, borderRadius: 12, padding: 20, marginBottom: 20,
            border: `1px solid ${hairline}`,
          }}>
            <h3 style={{
              fontSize: 14, fontWeight: 700, color: ink, textTransform: 'uppercase',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: "'DM Serif Display', serif",
            }}>
              <User size={16} color={teal[600]} />
              Customer Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div ref={customerDropdownRef} style={{ position: 'relative' }}>
                <label style={labelStyle}>Customer Name</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={showCustomerDropdown ? customerSearchTerm : formData.customerName}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      setShowCustomerDropdown(true);
                      if (!e.target.value) {
                        setFormData({ ...formData, customerName: 'Walk-in', customerId: '', customerPhone: '' });
                      }
                    }}
                    onFocus={() => {
                      setShowCustomerDropdown(true);
                      setCustomerSearchTerm(formData.customerName === 'Walk-in' ? '' : formData.customerName);
                    }}
                    placeholder="Search customer or type name..."
                    style={inputStyle}
                  />
                  <ChevronDown size={16} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: inkSoft, pointerEvents: 'none' }} />
                </div>

                {showCustomerDropdown && (
                  <div style={{
                    position: 'absolute', zIndex: 50, width: '100%', marginTop: 4,
                    background: paper, border: `1px solid ${hairline}`, borderRadius: 12,
                    boxShadow: '0 8px 24px -6px rgba(0,0,0,.15)', maxHeight: 240, overflowY: 'auto',
                  }}>
                    <div
                      onClick={() => handleCustomerSelect({ id: '', name: 'Walk-in', phone: '' })}
                      style={{
                        padding: '10px 16px', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: `1px solid ${hairline}`,
                      }}
                    >
                      <span style={{ fontWeight: 500, color: ink }}>Walk-in Customer</span>
                      {formData.customerName === 'Walk-in' && <Check size={16} color={teal[600]} />}
                    </div>
                    {filteredCustomers.map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => handleCustomerSelect(customer)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <p style={{ fontWeight: 500, color: ink }}>{customer.name}</p>
                          {customer.phone && (
                            <p style={{ fontSize: 12, color: inkSoft }}>{customer.phone}</p>
                          )}
                        </div>
                        {formData.customerId === customer.id?.toString() && <Check size={16} color={teal[600]} />}
                      </div>
                    ))}
                    {filteredCustomers.length === 0 && customerSearchTerm && (
                      <div style={{ padding: '12px 16px', textAlign: 'center', color: inkSoft, fontSize: 13 }}>
                        No customers found. Type to add new.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  style={inputStyle}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', fontFamily: "'DM Serif Display', serif" }}>Job Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as JobTicketType })}
                  style={selectStyle}
                >
                  <option value="Photocopy">Photocopy</option>
                  <option value="Printing">Printing</option>
                  <option value="Binding">Binding</option>
                  <option value="Scan">Scan</option>
                  <option value="Lamination">Lamination</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={textareaStyle}
                rows={2}
                placeholder="Job description..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', fontFamily: "'DM Serif Display', serif" }}>Specifications</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Paper Size</label>
                <select
                  value={formData.paperSize}
                  onChange={(e) => setFormData({ ...formData, paperSize: e.target.value })}
                  style={selectStyle}
                >
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="A5">A5</option>
                  <option value="Legal">Legal</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Color</label>
                <select
                  value={formData.colorMode}
                  onChange={(e) => setFormData({ ...formData, colorMode: e.target.value })}
                  style={selectStyle}
                >
                  <option value="BlackWhite">Black & White</option>
                  <option value="Color">Color</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sides</label>
                <select
                  value={formData.sides}
                  onChange={(e) => setFormData({ ...formData, sides: e.target.value })}
                  style={selectStyle}
                >
                  <option value="Single">Single Sided</option>
                  <option value="Double">Double Sided</option>
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Unit Price ({currency})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', fontFamily: "'DM Serif Display', serif" }}>Priority</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {(['Normal', 'Rush', 'Express', 'Urgent'] as JobTicketPriority[]).map((p) => {
                const pb = priorityConfig[p];
                const isActive = formData.priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setFormData({ ...formData, priority: p })}
                    style={{
                      padding: '8px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', border: '1.4px solid',
                      background: isActive ? pb.bg : paper,
                      color: isActive ? pb.text : inkSoft,
                      borderColor: isActive ? pb.border : hairline,
                      transition: 'all .15s ease',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', fontFamily: "'DM Serif Display', serif" }}>Due Date</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Time</label>
                <input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              style={textareaStyle}
              rows={2}
              placeholder="Additional notes..."
            />
          </div>

          <div style={{
            background: paper, padding: 16, borderRadius: 12,
            border: `1px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: ink }}>
              <span>Subtotal</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currency}{totalPreview.subtotal.toFixed(2)}</span>
            </div>
            {totalPreview.rushFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: amber[600] }}>
                <span>Rush Fee</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>+{currency}{totalPreview.rushFee.toFixed(2)}</span>
              </div>
            )}
            <div style={{ paddingTop: 8, borderTop: `1px solid ${hairline}` }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Override Total</label>
              <input
                type="number"
                value={formData.totalOverride || ''}
                onChange={(e) => setFormData({ ...formData, totalOverride: parseFloat(e.target.value) || 0 })}
                style={{ ...inputStyle, textAlign: 'right', fontWeight: 600 }}
                placeholder="Auto-calculated"
              />
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16,
              paddingTop: 8, borderTop: `1px solid ${hairline}`,
            }}>
              <span>Total</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: teal[700] }}>{currency}{totalPreview.total.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: `1px solid ${hairline}` }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 20px',
                background: paper, border: `1.4px solid ${hairline}`,
                color: inkSoft, borderRadius: 9, fontWeight: 600, fontSize: 13.5,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all .15s ease',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                flex: 1, padding: '10px 20px',
                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13.5,
                cursor: 'pointer', border: '1.4px solid transparent',
                fontFamily: "'Inter', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: `0 4px 12px -4px rgba(15,84,76,.4)`,
                transition: 'all .15s ease',
              }}
            >
              {ticket ? 'Update Ticket' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface JobTicketDetailProps {
  ticket: JobTicket;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (id: string, status: JobTicketStatus) => void;
  onProgressChange: (id: string, progress: number) => void;
  onClose: () => void;
  allTickets?: JobTicket[];
  onReorder?: (ticket: JobTicket) => void;
}

const JobTicketDetail: React.FC<JobTicketDetailProps> = ({ ticket, currency, onEdit, onDelete, onStatusChange, onProgressChange, onClose, allTickets = [], onReorder }) => {
  const { openFilePreview } = useDocumentStore();
  const [activeTab, setActiveTab] = useState<'details' | 'progress' | 'files' | 'notify' | 'history'>('details');
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nextStatus: Record<JobTicketStatus, JobTicketStatus | null> = {
    Received: 'Processing',
    Processing: 'Ready',
    Ready: 'Delivered',
    Delivered: null,
    Cancelled: null,
  };

  const customerHistory = useMemo(() => {
    if (!ticket.customerId && !ticket.customerName) return [];
    return allTickets
      .filter(t => t.customerId === ticket.customerId || t.customerName === ticket.customerName)
      .filter(t => t.id !== ticket.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [allTickets, ticket.customerId, ticket.customerName, ticket.id]);

  const notificationLog = useMemo(() => {
    return jobTicketService.getNotificationLog(ticket.id);
  }, [ticket.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
          alert(`Invalid file type: ${file.name}. Allowed: PDF, JPG, PNG, DOC`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          alert(`File too large: ${file.name}. Max size: 10MB`);
          continue;
        }
        await jobTicketService.uploadFile(ticket.id, file);
      }
      alert('Files uploaded successfully!');
    } catch (error) {
      logger.error('Upload failed:', error);
      alert('Failed to upload files');
    }
    setIsUploading(false);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await jobTicketService.deleteFile(ticket.id, fileId);
      alert('File deleted');
    } catch (error) {
      logger.error('Delete failed:', error);
    }
  };

  const handleSendNotification = async (method: 'sms' | 'whatsapp' | 'email') => {
    if (!ticket.customerPhone && !ticket.customerEmail) {
      alert('No customer phone or email on file');
      return;
    }
    setIsSendingNotify(true);
    try {
      await jobTicketService.sendNotification(
        ticket.id,
        ticket.status === 'Ready' ? 'ready' : 'status_changed',
        method,
        ticket.customerPhone,
        ticket.customerEmail
      );
      alert(`Notification sent via ${method}!`);
    } catch (error: any) {
      logger.error('Notification failed:', error);
      alert(error.message || 'Failed to send notification');
    }
    setIsSendingNotify(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const resolveAttachmentSource = (file: NonNullable<JobTicket['attachments']>[number]) => {
    const fileId = file.fileId || (isStoredFileIdentifier(file.url) ? file.url : undefined);
    const sourceUrl = fileId ? undefined : file.url;
    return { fileId, sourceUrl };
  };

  const handlePreviewFile = (file: NonNullable<JobTicket['attachments']>[number]) => {
    const { fileId, sourceUrl } = resolveAttachmentSource(file);
    openFilePreview({
      downloadUrl: sourceUrl,
      fileId,
      fileName: file.name,
      mimeType: file.type,
      publicUrl: sourceUrl,
      sourceUrl,
      title: file.name,
    });
  };

  const handleDownloadFile = async (file: NonNullable<JobTicket['attachments']>[number]) => {
    const { fileId, sourceUrl } = resolveAttachmentSource(file);
    let downloadUrl = sourceUrl || '';
    if (fileId) {
      const localUrl = await localFileStorage.getUrl(fileId);
      if (!localUrl) {
        alert('The file could not be found.');
        return;
      }
      downloadUrl = localUrl;
    }
    if (!downloadUrl) {
      alert('The file could not be found.');
      return;
    }
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (fileId) {
      window.setTimeout(() => {
        localFileStorage.revoke(downloadUrl);
      }, 1000);
    }
  };

  const statusBadge = statusConfig[ticket.status];
  const priorityBadge = priorityConfig[ticket.priority];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.6)', padding: '20px',
      fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink,
    }}>
      <div style={{
        width: '100%', maxWidth: 800, maxHeight: '90vh',
        background: paper, borderRadius: 14,
        boxShadow: '0 30px 70px -20px rgba(0,0,0,.55), 0 8px 24px -8px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.04)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Sticky Header */}
        <div style={{
          position: 'sticky', top: 0, background: paper,
          borderBottom: `1px solid ${hairline}`,
          padding: '16px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          zIndex: 10,
        }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: ink, lineHeight: 1.2, margin: 0, fontFamily: "'DM Serif Display', serif" }}>
              {ticket.ticketNumber}
            </h2>
            <p style={{ fontSize: 13, color: inkSoft, fontWeight: 500, marginTop: 2 }}>{ticket.customerName}</p>
          </div>
          <button onClick={onClose} style={{
            color: inkSoft, background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 4, borderRadius: 6, transition: 'all .15s ease',
          }} title="Close" aria-label="Close job ticket">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${hairline}`, overflowX: 'auto' }}>
          {(['details', 'progress', 'files', 'notify', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px', fontSize: 13, fontWeight: 600,
                textTransform: 'uppercase', whiteSpace: 'nowrap',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === tab ? `2px solid ${teal[500]}` : '2px solid transparent',
                color: activeTab === tab ? teal[600] : inkSoft,
                transition: 'all .15s ease',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {tab === 'notify' ? 'Notify' : tab}
            </button>
          ))}
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          {activeTab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  background: statusBadge.badgeBg, color: statusBadge.badgeText,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {statusBadge.icon}
                  {statusBadge.label}
                </span>
                <span style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  background: priorityBadge.bg, color: priorityBadge.text,
                  border: `1px solid ${priorityBadge.border}`,
                }}>
                  {ticket.priority}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Type</p>
                  <p style={{ fontWeight: 500 }}>{typeConfig[ticket.type].label}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Quantity</p>
                  <p style={{ fontWeight: 500 }}>{ticket.quantity}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Paper Size</p>
                  <p style={{ fontWeight: 500 }}>{ticket.paperSize}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Color Mode</p>
                  <p style={{ fontWeight: 500 }}>{ticket.colorMode === 'Color' ? 'Color' : 'Black & White'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Date Received</p>
                  <p style={{ fontWeight: 500 }}>{new Date(ticket.dateReceived).toLocaleDateString()}</p>
                </div>
                {ticket.dueDate && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Due Date</p>
                    <p style={{ fontWeight: 500 }}>
                      {new Date(ticket.dueDate).toLocaleDateString()}
                      {ticket.dueTime && ` at ${ticket.dueTime}`}
                    </p>
                  </div>
                )}
              </div>

              {ticket.description && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Description</p>
                  <p style={{ color: ink }}>{ticket.description}</p>
                </div>
              )}

              {Object.values(ticket.finishing).some(v => v) && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 8 }}>Finishing</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {ticket.finishing.staple && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Staple</span>}
                    {ticket.finishing.fold && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Fold</span>}
                    {ticket.finishing.collate && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Collate</span>}
                    {ticket.finishing.trim && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Trim</span>}
                    {ticket.finishing.punch && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Punch</span>}
                    {ticket.finishing.lamination && <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>Lamination</span>}
                    {ticket.finishing.bindingType && ticket.finishing.bindingType !== 'None' && (
                      <span style={{ padding: '4px 8px', background: paper, borderRadius: 6, fontSize: 12, border: `1px solid ${hairline}` }}>{ticket.finishing.bindingType}</span>
                    )}
                  </div>
                </div>
              )}

              <div style={{
                background: paper, padding: 20, borderRadius: 12,
                border: `1px solid ${hairline}`, display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: ink }}>
                  <span>Unit Price</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currency}{ticket.unitPrice.toFixed(2)}</span>
                </div>
                {ticket.rushFee > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: amber[600] }}>
                    <span>Rush Fee</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>+{currency}{ticket.rushFee.toFixed(2)}</span>
                  </div>
                )}
                {ticket.finishingCost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: ink }}>
                    <span>Finishing</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>+{currency}{ticket.finishingCost.toFixed(2)}</span>
                  </div>
                )}
                {ticket.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: teal[600] }}>
                    <span>Discount</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>-{currency}{ticket.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: ink }}>
                  <span>Tax</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currency}{ticket.tax.toFixed(2)}</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 18,
                  paddingTop: 12, borderTop: `1px solid ${hairline}`,
                }}>
                  <span>Total</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", color: teal[700] }}>{currency}{ticket.total.toFixed(2)}</span>
                </div>
              </div>

              {ticket.notes && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 4 }}>Notes</p>
                  <p style={{ color: ink }}>{ticket.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'progress' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Job Progress</span>
                  <span style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{ticket.progressPercent}%</span>
                </div>
                <div style={{ height: 8, background: paper, borderRadius: 999, overflow: 'hidden', border: `1px solid ${hairline}` }}>
                  <div style={{
                    height: '100%', background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                    borderRadius: 999, transition: 'all .3s ease', width: `${ticket.progressPercent}%`,
                  }} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>Update Progress</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[0, 25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => onProgressChange(ticket.id, p)}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', border: '1.4px solid',
                        background: ticket.progressPercent === p ? `linear-gradient(155deg, ${teal[500]}, ${teal[700]})` : paper,
                        color: ticket.progressPercent === p ? '#fff' : inkSoft,
                        borderColor: ticket.progressPercent === p ? 'transparent' : hairline,
                        transition: 'all .15s ease',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>Update Status</p>
                {nextStatus[ticket.status] && (
                  <button
                    onClick={() => onStatusChange(ticket.id, nextStatus[ticket.status]!)}
                    style={{
                      padding: '12px 16px',
                      background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                      color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13,
                      cursor: 'pointer', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      boxShadow: `0 4px 12px -4px rgba(15,84,76,.4)`,
                      transition: 'all .15s ease',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    <ArrowRight size={18} />
                    Mark as {statusConfig[nextStatus[ticket.status]!].label}
                  </button>
                )}
                {ticket.status !== 'Cancelled' && ticket.status !== 'Delivered' && (
                  <button
                    onClick={() => onStatusChange(ticket.id, 'Cancelled')}
                    style={{
                      padding: '12px 16px',
                      border: `1.4px solid ${danger}33`,
                      color: danger, borderRadius: 9, fontWeight: 600, fontSize: 13,
                      cursor: 'pointer', background: paper,
                      transition: 'all .15s ease',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Cancel Job
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'files' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${hairline}`, borderRadius: 12, padding: 32,
                  textAlign: 'center', cursor: 'pointer',
                  transition: 'all .15s ease',
                }}
              >
                <Upload size={40} style={{ margin: '0 auto 8px', color: inkSoft }} />
                <p style={{ fontSize: 13, fontWeight: 500, color: ink }}>Click to upload files</p>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>PDF, JPG, PNG, DOC (max 10MB)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {isUploading && (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div style={{
                    animation: 'spin 1s linear infinite',
                    width: 32, height: 32,
                    border: `4px solid ${teal[500]}`, borderTopColor: 'transparent',
                    borderRadius: '50%', margin: '0 auto',
                  }} />
                  <p style={{ fontSize: 13, color: inkSoft, marginTop: 8 }}>Uploading...</p>
                </div>
              )}

              {ticket.attachments && ticket.attachments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                    Attached Files ({ticket.attachments.length})
                  </p>
                  {ticket.attachments.map((file) => (
                    <div key={file.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, background: paper, borderRadius: 10,
                      border: `1px solid ${hairline}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileIcon size={20} style={{ color: inkSoft }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 500, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{file.name}</p>
                          <p style={{ fontSize: 12, color: inkSoft }}>{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handlePreviewFile(file)}
                          style={{ padding: 8, color: inkSoft, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6, transition: 'all .15s ease' }}
                          type="button"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownloadFile(file)}
                          style={{ padding: 8, color: teal[600], background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6, transition: 'all .15s ease' }}
                          type="button"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          style={{ padding: 8, color: danger, background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 6, transition: 'all .15s ease' }}
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ textAlign: 'center', color: inkSoft, padding: 16 }}>No files attached</p>
              )}
            </div>
          )}

          {activeTab === 'notify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{
                padding: 16, background: `${teal[50]}`, borderRadius: 10,
                border: `1px solid ${teal[100]}`,
              }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: teal[800] }}>Send Update to Customer</p>
                <p style={{ fontSize: 12, color: inkSoft, marginTop: 4 }}>Notify the customer when job status changes</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>Send via</p>

                <button
                  onClick={() => handleSendNotification('whatsapp')}
                  disabled={isSendingNotify || !ticket.customerPhone}
                  style={{
                    padding: '12px 16px',
                    background: teal[500], color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all .15s ease',
                    fontFamily: "'Inter', sans-serif",
                    opacity: isSendingNotify || !ticket.customerPhone ? 0.5 : 1,
                  }}
                >
                  <MessageSquare size={18} />
                  WhatsApp {ticket.customerPhone ? '' : '(No Phone)'}
                </button>

                <button
                  onClick={() => handleSendNotification('sms')}
                  disabled={isSendingNotify || !ticket.customerPhone}
                  style={{
                    padding: '12px 16px',
                    background: teal[500], color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all .15s ease',
                    fontFamily: "'Inter', sans-serif",
                    opacity: isSendingNotify || !ticket.customerPhone ? 0.5 : 1,
                  }}
                >
                  <Phone size={18} />
                  SMS {ticket.customerPhone ? '' : '(No Phone)'}
                </button>

                <button
                  onClick={() => handleSendNotification('email')}
                  disabled={isSendingNotify || !ticket.customerEmail}
                  style={{
                    padding: '12px 16px',
                    background: ink, color: '#fff', borderRadius: 9, fontWeight: 600, fontSize: 13,
                    cursor: 'pointer', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all .15s ease',
                    fontFamily: "'Inter', sans-serif",
                    opacity: isSendingNotify || !ticket.customerEmail ? 0.5 : 1,
                  }}
                >
                  <Mail size={18} />
                  Email {ticket.customerEmail ? '' : '(No Email)'}
                </button>
              </div>

              {isSendingNotify && (
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div style={{
                    animation: 'spin 1s linear infinite',
                    width: 32, height: 32,
                    border: `4px solid ${teal[500]}`, borderTopColor: 'transparent',
                    borderRadius: '50%', margin: '0 auto',
                  }} />
                  <p style={{ fontSize: 13, color: inkSoft, marginTop: 8 }}>Sending...</p>
                </div>
              )}

              {notificationLog.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>Notification History</p>
                  {notificationLog.slice().reverse().map((notif) => (
                    <div key={notif.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: 8, background: paper, borderRadius: 8,
                      border: `1px solid ${hairline}`, fontSize: 13,
                    }}>
                      {notif.method === 'whatsapp' ? (
                        <MessageSquare size={14} color={teal[500]} />
                      ) : notif.method === 'sms' ? (
                        <Phone size={14} color={teal[500]} />
                      ) : (
                        <Mail size={14} color={inkSoft} />
                      )}
                      <span style={{ flex: 1, color: ink }}>{notif.message}</span>
                      <span style={{ fontSize: 11, color: inkSoft }}>{new Date(notif.sentAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>This Job</p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', background: teal[500] }} />
                  <div>
                    <p style={{ fontWeight: 500 }}>Job Created</p>
                    <p style={{ fontSize: 12, color: inkSoft }}>{new Date(ticket.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                {ticket.completedAt && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', background: teal[500] }} />
                    <div>
                      <p style={{ fontWeight: 500 }}>Completed</p>
                      <p style={{ fontSize: 12, color: inkSoft }}>{new Date(ticket.completedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {ticket.deliveredAt && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', background: inkSoft }} />
                    <div>
                      <p style={{ fontWeight: 500 }}>Delivered</p>
                      <p style={{ fontSize: 12, color: inkSoft }}>{new Date(ticket.deliveredAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>

              {customerHistory.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderTop: `1px solid ${hairline}` }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: inkSoft, textTransform: 'uppercase', letterSpacing: 0.04 }}>
                    Previous Jobs from {ticket.customerName}
                  </p>
                  {customerHistory.map((job) => (
                    <div key={job.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 12, background: paper, borderRadius: 10,
                      border: `1px solid ${hairline}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}>{job.ticketNumber}</span>
                          <span style={{
                            padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            background: statusConfig[job.status].badgeBg, color: statusConfig[job.status].badgeText,
                          }}>
                            {job.status}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: inkSoft }}>{typeConfig[job.type].label} - {job.quantity} copies</p>
                        <p style={{ fontSize: 12, color: inkSoft }}>{new Date(job.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontWeight: 600, color: ink }}>{currency}{job.total.toFixed(2)}</p>
                        {onReorder && (
                          <button
                            onClick={() => onReorder(job)}
                            style={{
                              fontSize: 12, color: teal[600], background: 'transparent',
                              border: 'none', cursor: 'pointer', fontWeight: 500,
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            Reorder
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {customerHistory.length === 0 && (
                <p style={{ textAlign: 'center', color: inkSoft, padding: 16 }}>No previous jobs from this customer</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div style={{
          position: 'sticky', bottom: 0, background: paper,
          borderTop: `1px solid ${hairline}`, padding: '16px 24px',
          display: 'flex', gap: 12,
        }}>
          <button
            onClick={onEdit}
            style={{
              flex: 1, padding: '10px 16px',
              border: `1.4px solid ${hairline}`, background: paper,
              color: inkSoft, borderRadius: 9, fontWeight: 600, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .15s ease', fontFamily: "'Inter', sans-serif",
            }}
          >
            <Edit2 size={16} /> Edit
          </button>
          <button
            onClick={onDelete}
            style={{
              flex: 1, padding: '10px 16px',
              border: `1.4px solid ${danger}33`, background: paper,
              color: danger, borderRadius: 9, fontWeight: 600, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all .15s ease', fontFamily: "'Inter', sans-serif",
            }}
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12, fontWeight: 600, color: teal[800],
  marginBottom: 6, letterSpacing: 0.01,
};

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: "'Inter', sans-serif", fontSize: 13.5,
  color: ink, background: paper,
  border: `1.4px solid ${hairline}`, borderRadius: 9,
  padding: '9px 12px', outline: 'none',
  transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: 'none', minHeight: 66, lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235c6567'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 30,
  cursor: 'pointer',
};

export default JobTickets;