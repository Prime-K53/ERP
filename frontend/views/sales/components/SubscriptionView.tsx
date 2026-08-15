import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    Calendar as CalendarIcon, List, DollarSign,
    Play, Pause, Edit2, Trash2, Mail, MoreVertical, Eye,
    ChevronLeft, ChevronRight, AlertCircle, ShoppingBag, Clock, Copy, Activity, Zap,
    ArrowUpRight, ShieldCheck, User, ArrowRight, Wallet, Layout, Box, History as HistoryIcon, PlayCircle,
    Download, RefreshCw
} from 'lucide-react';
import { RecurringInvoice } from '../../../types';
import { useDocumentPreview } from '../../../hooks/useDocumentPreview';
import { useAuth } from '../../../context/AuthContext';
import { useFinance } from '../../../context/FinanceContext';
import { useSales } from '../../../context/SalesContext';
import { usePagination } from '../../../hooks/usePagination';
import Pagination from '../../../components/Pagination';
import { HoverActionMenu, useHoverTimer, RecurringList } from './SalesLists';

interface SubscriptionViewProps {
    data: RecurringInvoice[];
    onEdit: (item: RecurringInvoice) => void;
    onView: (item: RecurringInvoice) => void;
    onDelete: (id: string) => void;
    onAction: (item: RecurringInvoice, action: string) => void;
    onSort?: (field: any) => void;
    sortConfig?: { field: any; direction: 'asc' | 'desc' };
}

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
const danger = '#b5493f';

const getSubscriptionToggleAction = (status?: string) => {
    switch (status) {
        case 'Active':
            return { label: 'Pause Subscription', icon: 'pause' as const };
        case 'Draft':
            return { label: 'Activate Subscription', icon: 'play' as const };
        case 'Paused':
            return { label: 'Resume Subscription', icon: 'play' as const };
        default:
            return null;
    }
};

// Local Hook for Context Menu
const useContextMenu = () => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ x: number, y: number } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(id);

        const menuWidth = 224;
        const menuHeight = 280;

        const spaceBelow = window.innerHeight - e.clientY;
        const spaceAbove = e.clientY;

        let y = e.clientY;
        if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
            y = e.clientY - menuHeight;
        } else if (spaceBelow < menuHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        const x = Math.max(0, Math.min(e.clientX, window.innerWidth - menuWidth));

        setMenuPos({ x, y });
    };

    return { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId };
};

const SubscriptionView: React.FC<SubscriptionViewProps> = ({ data, onEdit, onView, onDelete, onAction, onSort, sortConfig }) => {
    const { companyConfig } = useAuth(); const { invoices } = useFinance(); const { runRecurringBilling } = useSales();
    const { handlePreview } = useDocumentPreview();
    const [viewMode, setViewMode] = useState<'List' | 'Grid' | 'Calendar'>('List');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isRunningBilling, setIsRunningBilling] = useState(false);
    const { openMenuId, menuPos, menuRef, handleContextMenu, setOpenMenuId } = useContextMenu();
    const { hoveredId, hoverPos, onMouseEnter, onMouseMove, onMouseLeave } = useHoverTimer(2000);

    const handleRunBilling = async () => {
        setIsRunningBilling(true);
        await runRecurringBilling();
        setIsRunningBilling(false);
    };

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = new Date(year, month, i).toISOString().split('T')[0];
            const triggers = (data || []).filter(sub => sub.status === 'Active' && (sub.nextRunDate === dateStr || (sub.scheduledDates && sub.scheduledDates.includes(dateStr))));
            days.push({ day: i, date: dateStr, triggers });
        }
        return days;
    }, [currentMonth, data]);

    const changeMonth = (delta: number) => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() + delta);
        setCurrentMonth(newDate);
    };

    const { currentItems, currentPage, maxPage, totalItems, next, prev, first, last, setItemsPerPage, itemsPerPage } = usePagination(data || [], 12);
    const currentSub = (data || []).find(s => s.id === openMenuId);
    const hoveredSub = (data || []).find(s => s.id === hoveredId);

    const renderMenu = (sub: RecurringInvoice) => {
        const toggleAction = getSubscriptionToggleAction(sub.status);

        const menuWidth = 224;
        const menuHeight = 400;

        let x = menuPos!.x;
        let y = menuPos!.y;

        if (x + menuWidth > window.innerWidth) {
            x = Math.max(0, window.innerWidth - menuWidth);
        }

        if (y + menuHeight > window.innerHeight) {
            y = Math.max(0, window.innerHeight - menuHeight);
        }

        return (
        <div ref={menuRef} className="fixed w-56 rounded-xl shadow-2xl border z-[70] animate-in fade-in zoom-in-95 duration-100 flex flex-col py-1 text-left overflow-y-auto custom-scrollbar" style={{ top: y, left: x, maxHeight: '90vh', background: paper, borderColor: hairline }} onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-2 border-b text-[10px] font-bold uppercase tracking-wider rounded-t-xl" style={{ borderColor: hairline, color: inkSoft, background: teal[50] }}>Subscription Actions</div>
            <button onClick={() => { setOpenMenuId(null); onView(sub); }} className="w-full text-left px-4 py-2 text-xs font-bold flex items-center gap-3 transition-colors" style={{ color: teal[700] }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Eye size={14} /> Preview Details</button>
            <button onClick={() => { setOpenMenuId(null); handlePreview('SUBSCRIPTION', sub); }} className="w-full text-left px-4 py-2 text-xs font-bold flex items-center gap-3 transition-colors" style={{ color: teal[700] }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Eye size={14} /> Preview Recurring Invoice</button>
            <button onClick={() => { setOpenMenuId(null); onAction(sub, 'download_pdf'); }} className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-3 transition-colors" style={{ color: ink }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Download size={14} /> Download Recurring Invoice</button>
            <div className="my-1 border-t" style={{ borderColor: hairline }}></div>
            <button onClick={() => { setOpenMenuId(null); onEdit(sub); }} className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-3 transition-colors" style={{ color: ink }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Edit2 size={14} /> Edit Subscription</button>
            {toggleAction && (
                <button onClick={() => { setOpenMenuId(null); onAction(sub, 'toggle_status'); }} className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-3 transition-colors" style={{ color: ink }} onMouseEnter={e => e.currentTarget.style.background = amber[100]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {toggleAction.icon === 'pause' ? <><Pause size={14} /> {toggleAction.label}</> : <><Play size={14} /> {toggleAction.label}</>}
                </button>
            )}
            <button onClick={() => { setOpenMenuId(null); onAction(sub, 'duplicate_exact'); }} className="w-full text-left px-4 py-2 text-xs font-medium flex items-center gap-3 transition-colors" style={{ color: ink }} onMouseEnter={e => e.currentTarget.style.background = teal[50]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Copy size={14} /> Duplicate</button>
            <div className="my-1 border-t" style={{ borderColor: hairline }}></div>
            <button onClick={() => { setOpenMenuId(null); onDelete(sub.id); }} className="w-full text-left px-4 py-2 text-xs flex items-center gap-3 transition-colors" style={{ color: danger }} onMouseEnter={e => e.currentTarget.style.background = `${danger}15`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><Trash2 size={14} /> Delete</button>
        </div>
    );
};

    const getFrequencyBadge = (freq: string) => {
        switch (freq) {
            case 'Weekly': return { bg: teal[50], text: teal[700], border: teal[100] };
            case 'Monthly': return { bg: teal[50], text: teal[700], border: teal[100] };
            case 'Quarterly': return { bg: amber[100], text: amber[600], border: '#f5d9a8' };
            case 'Annually': return { bg: teal[50], text: teal[700], border: teal[100] };
            default: return { bg: paper, text: inkSoft, border: hairline };
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Active': return { bg: teal[50], text: teal[700], dot: teal[500] };
            case 'Paused': return { bg: amber[100], text: amber[600], dot: amber[500] };
            case 'Draft': return { bg: paper, text: inkSoft, dot: '#c4bbb0' };
            default: return { bg: paper, text: inkSoft, dot: '#c4bbb0' };
        }
    };

    const currency = companyConfig?.currencySymbol || '$';

    return (
        <>
            {openMenuId && menuPos && currentSub && renderMenu(currentSub)}
            {hoveredId && hoverPos && hoveredSub && <HoverActionMenu id={hoveredId} type="Subscription" pos={hoverPos} data={hoveredSub} />}
            <div className="flex flex-col h-full space-y-6 print-force-white relative" style={{ background: paper, fontFamily: "'Inter', sans-serif", fontSize: 13.5, color: ink }}>

            {/* Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 print:bg-white print:border-none print:shadow-none" style={{ background: paper, borderRadius: 14, border: `1px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                <div className="p-4 flex justify-between items-center print:hidden" style={{ borderBottom: `1px solid ${hairline}`, background: paper }}>
                    <div className="flex p-1 rounded-xl" style={{ background: teal[50], border: `1px solid ${teal[100]}`, boxShadow: 'inset 0 1px 2px rgba(0,0,0,.03)' }}>
                        <button onClick={() => setViewMode('List')} className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all" style={{ background: viewMode === 'List' ? paper : 'transparent', color: viewMode === 'List' ? teal[800] : inkSoft, boxShadow: viewMode === 'List' ? '0 1px 3px rgba(0,0,0,.06)' : 'none', border: viewMode === 'List' ? `1px solid ${hairline}` : '1px solid transparent' }}>
                            <List size={14} /> List View
                        </button>
                        <button onClick={() => setViewMode('Grid')} className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all" style={{ background: viewMode === 'Grid' ? paper : 'transparent', color: viewMode === 'Grid' ? teal[800] : inkSoft, boxShadow: viewMode === 'Grid' ? '0 1px 3px rgba(0,0,0,.06)' : 'none', border: viewMode === 'Grid' ? `1px solid ${hairline}` : '1px solid transparent' }}>
                            <Layout size={14} /> Grid View
                        </button>
                        <button onClick={() => setViewMode('Calendar')} className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider flex items-center gap-2 transition-all" style={{ background: viewMode === 'Calendar' ? paper : 'transparent', color: viewMode === 'Calendar' ? teal[800] : inkSoft, boxShadow: viewMode === 'Calendar' ? '0 1px 3px rgba(0,0,0,.06)' : 'none', border: viewMode === 'Calendar' ? `1px solid ${hairline}` : '1px solid transparent' }}>
                            <CalendarIcon size={14} /> Run Calendar
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRunBilling}
                            disabled={isRunningBilling}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs uppercase tracking-wider transition-all"
                            style={{
                                background: `linear-gradient(155deg, ${teal[500]}, ${teal[700]})`,
                                color: '#fff',
                                borderRadius: 9,
                                boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)',
                                opacity: isRunningBilling ? 0.7 : 1
                            }}
                            onMouseEnter={e => { if (!isRunningBilling) e.currentTarget.style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                        >
                            {isRunningBilling ? <RefreshCw size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                            Process Due Cycles
                        </button>
                        {viewMode === 'Calendar' && (
                            <div className="flex items-center gap-4 px-3 py-1.5 rounded-2xl ml-4" style={{ background: teal[50], border: `1px solid ${teal[100]}` }}>
                                <button onClick={() => changeMonth(-1)} className="p-1 rounded-lg transition-colors" style={{ color: teal[700] }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><ChevronLeft size={18} /></button>
                                <span className="font-semibold w-40 text-center text-xs uppercase tracking-widest" style={{ color: teal[800] }}>{currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
                                <button onClick={() => changeMonth(1)} className="p-1 rounded-lg transition-colors" style={{ color: teal[700] }} onMouseEnter={e => e.currentTarget.style.background = teal[100]} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><ChevronRight size={18} /></button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar print:overflow-visible">
                    {viewMode === 'List' ? (
                        <RecurringList
                            data={data}
                            onEdit={onEdit}
                            onView={onView}
                            onDelete={onDelete}
                            onAction={onAction}
                            viewMode="List"
                            onSort={onSort}
                            sortConfig={sortConfig}
                        />
                    ) : viewMode === 'Grid' ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {(currentItems || []).map(sub => {
                                    const lastGeneratedInvoice = (invoices || [])
                                        .filter(inv => inv.customerName === sub.customerName && inv.id.includes('REC'))
                                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

                                    return (
                                        <div
                                            key={sub.id}
                                            onClick={() => onEdit(sub)}
                                            onContextMenu={(e) => handleContextMenu(e, sub.id)}
                                            onMouseMove={onMouseMove}
                                            className="cursor-pointer group flex flex-col relative overflow-hidden transition-all"
                                            style={{ background: paper, borderRadius: 14, border: `1px solid ${hairline}`, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
                                            onMouseEnter={e => { onMouseEnter(sub.id, e); e.currentTarget.style.borderColor = teal[200]; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,84,76,.08)'; }}
                                            onMouseLeave={e => { onMouseLeave(e); e.currentTarget.style.borderColor = hairline; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'; }}
                                        >
                                            <div className="absolute top-0 left-0 w-full h-1" style={{ background: sub.status === 'Active' ? `linear-gradient(90deg, ${teal[500]}, ${teal[400]})` : hairline }}></div>

                                            <div className="p-6 flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors" style={{ background: teal[50], color: teal[600], borderColor: teal[100] }}>
                                                        <User size={20} />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-sm leading-tight" style={{ color: ink }}>{sub.customerName}</h4>
                                                        <p className="text-[10px] font-mono mt-0.5 font-normal" style={{ color: inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>{sub.id}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 items-center">
                                                    {(() => {
                                                        const badge = getFrequencyBadge(sub.frequency);
                                                        return (
                                                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase border" style={{ background: badge.bg, color: badge.text, borderColor: badge.border }}>
                                                                {sub.frequency}
                                                            </span>
                                                        );
                                                    })()}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handlePreview('SUBSCRIPTION', sub); }}
                                                        className="p-1 rounded-lg transition-colors"
                                                        style={{ color: inkSoft }}
                                                        onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.background = teal[50]; }}
                                                        onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.background = 'transparent'; }}
                                                        title="Preview PDF"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, sub.id); }} className="p-1 transition-colors" style={{ color: inkSoft }} onMouseEnter={e => e.currentTarget.style.color = teal[800]} onMouseLeave={e => e.currentTarget.style.color = inkSoft}>
                                                        <MoreVertical size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Description: Item List */}
                                            <div className="mb-4 rounded-xl p-3 flex-1" style={{ background: teal[50], border: `1px solid ${teal[100]}` }}>
                                                <p className="text-[9px] font-black uppercase tracking-widest mb-2 flex items-center gap-1" style={{ color: teal[600] }}>
                                                    <Box size={10} /> Order Description
                                                </p>
                                                <div className="space-y-1.5">
                                                    {(sub.items || []).slice(0, 2).map((item, idx) => (
                                                        <div key={idx} className="flex justify-between items-center text-[11px]">
                                                            <span className="font-medium truncate pr-4" style={{ color: ink }}>{item.name}</span>
                                                            <span className="font-bold shrink-0" style={{ color: teal[700], fontFamily: "'JetBrains Mono', monospace" }}>x{item.quantity}</span>
                                                        </div>
                                                    ))}
                                                    {(sub.items || []).length > 2 && (
                                                        <p className="text-[9px] italic" style={{ color: inkSoft }}>+{(sub.items || []).length - 2} more items...</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="p-3 rounded-xl" style={{ background: paper, border: `1px solid ${hairline}` }}>
                                                    <div className="text-[9px] font-normal uppercase tracking-widest mb-1" style={{ color: inkSoft }}>Cycle Total</div>
                                                    <div className="text-sm font-semibold" style={{ color: ink, fontFamily: "'JetBrains Mono', monospace" }}>{currency}{sub.total.toLocaleString()}</div>
                                                </div>
                                                <div className="p-3 rounded-xl" style={{ background: paper, border: `1px solid ${hairline}` }}>
                                                    <div className="text-[9px] font-normal uppercase tracking-widest mb-1" style={{ color: inkSoft }}>Next Trigger</div>
                                                    <div className="text-xs font-semibold" style={{ color: teal[700] }}>{new Date(sub.nextRunDate).toLocaleDateString()}</div>
                                                </div>
                                            </div>

                                            <div className="mt-auto space-y-3 pt-4" style={{ borderTop: `1px solid ${hairline}` }}>
                                                {/* Activity Snippet */}
                                                <div className="flex items-center gap-2 text-[10px]" style={{ color: inkSoft }}>
                                                    <HistoryIcon size={12} style={{ color: inkSoft }} />
                                                    <span>{lastGeneratedInvoice ? `Last Run: ${new Date(lastGeneratedInvoice.date).toLocaleDateString()}` : 'No history yet'}</span>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex gap-2">
                                                        <div className="p-1.5 rounded-lg border transition-colors" style={{ background: sub.autoDeductWallet ? amber[100] : paper, color: sub.autoDeductWallet ? amber[600] : inkSoft, borderColor: sub.autoDeductWallet ? '#f5d9a8' : hairline }} title="Auto-Pay via Wallet">
                                                            <Wallet size={14} />
                                                        </div>
                                                        <div className="p-1.5 rounded-lg border transition-colors" style={{ background: sub.autoEmail ? teal[50] : paper, color: sub.autoEmail ? teal[600] : inkSoft, borderColor: sub.autoEmail ? teal[100] : hairline }} title="Auto-Email Invoices">
                                                            <Mail size={14} />
                                                        </div>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAction(sub, 'preview_pdf'); }}
                                                            className="p-1.5 rounded-lg border transition-all"
                                                            style={{ color: inkSoft, background: paper, borderColor: hairline }}
                                                            onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.borderColor = teal[200]; e.currentTarget.style.background = teal[50]; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                                                            title="Preview Recurring Invoice"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onAction(sub, 'download_pdf'); }}
                                                            className="p-1.5 rounded-lg border transition-all"
                                                            style={{ color: inkSoft, background: paper, borderColor: hairline }}
                                                            onMouseEnter={e => { e.currentTarget.style.color = teal[600]; e.currentTarget.style.borderColor = teal[200]; e.currentTarget.style.background = teal[50]; }}
                                                            onMouseLeave={e => { e.currentTarget.style.color = inkSoft; e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                                                            title="Download Recurring Invoice"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    </div>
                                                    {(() => {
                                                        const statusStyle = getStatusStyle(sub.status);
                                                        return (
                                                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase" style={{ color: statusStyle.text }}>
                                                                <div className="w-2 h-2 rounded-full" style={{ background: statusStyle.dot, boxShadow: sub.status === 'Active' ? `0 0 6px ${teal[400]}` : 'none' }}></div>
                                                                {sub.status}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <Pagination currentPage={currentPage} maxPage={maxPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onNext={next} onPrev={prev} onFirst={first} onLast={last} onItemsPerPageChange={setItemsPerPage} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 gap-px rounded-3xl overflow-hidden shadow-sm h-full print:border-slate-300" style={{ border: `1px solid ${hairline}`, background: hairline }}>
                            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
                                <div key={day} className="p-3 text-center text-[10px] font-normal uppercase tracking-widest print:bg-white" style={{ background: teal[50], color: teal[700], borderBottom: `1px solid ${hairline}` }}>
                                    {day}
                                </div>
                            ))}
                            {(calendarDays || []).map((cell, idx) => (
                                <div key={idx} className="p-3 min-h-[120px] flex flex-col" style={{ background: !cell ? teal[50] : paper }}>
                                    {cell && (
                                        <>
                                            <span className="text-xs font-semibold mb-3" style={{ color: cell.triggers.length > 0 ? teal[700] : inkSoft }}>{cell.day}</span>
                                            <div className="space-y-1.5 flex-1 overflow-y-auto custom-scrollbar">
                                                {(cell.triggers || []).map(sub => (
                                                    <div
                                                        key={sub.id}
                                                        onClick={(e) => { e.stopPropagation(); onEdit(sub); }}
                                                        onContextMenu={(e) => handleContextMenu(e, sub.id)}
                                                        onMouseMove={onMouseMove}
                                                        className="text-[9px] p-2 rounded-xl font-semibold truncate cursor-pointer transition-colors flex flex-col gap-1"
                                                        style={{ background: teal[50], border: `1px solid ${teal[100]}`, color: teal[800] }}
                                                        onMouseEnter={e => { onMouseEnter(sub.id, e); e.currentTarget.style.background = teal[100]; }}
                                                        onMouseLeave={e => { onMouseLeave(e); e.currentTarget.style.background = teal[50]; }}
                                                    >
                                                        <div className="flex justify-between">
                                                            <span className="truncate">{sub.customerName}</span>
                                                            <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{currency}{sub.total.toFixed(0)}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default SubscriptionView;
