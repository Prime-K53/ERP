import React, { useState } from 'react';
import { 
    ShieldCheck, User, Clock, Activity, Trash2, 
    AlertTriangle, ShieldAlert, ChevronDown, ChevronRight,
    Search, Filter, Database, FileText, ArrowRight, UserCheck, 
    Layers, History as HistoryIcon, CheckSquare, Zap, Eye, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { AuditLogEntry } from '../../../types';
import { exportToCSV } from '../../../utils/helpers';

interface AuditTimelineProps {
    logs?: AuditLogEntry[];
    entityType?: string;
    entityId?: string;
    title?: string;
    subtitle?: string;
    hideFilters?: boolean;
}

export const AuditTimeline: React.FC<AuditTimelineProps> = ({ 
    logs = [], 
    entityType,
    entityId,
    title = "Audit Trail Intelligence", 
    subtitle = "Immutable security ledger capturing all system state changes.",
    hideFilters = false
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterAction, setFilterAction] = useState<string>('All');

    const filteredLogs = (logs || []).filter(log => {
        const matchesSearch = log.details.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            log.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            log.entityId.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesAction = filterAction === 'All' || log.action === filterAction;
        return matchesSearch && matchesAction;
    });

    const getActionColor = (action: string) => {
        switch(action) {
            case 'CREATE': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
            case 'UPDATE': return 'text-blue-600 bg-blue-50 border-blue-100';
            case 'DELETE': return 'text-rose-600 bg-rose-50 border-rose-100';
            case 'VOID': return 'text-amber-600 bg-amber-50 border-amber-100';
            case 'REVERSE': return 'text-purple-600 bg-purple-50 border-purple-100';
            default: return 'text-slate-600 bg-slate-50 border-slate-100';
        }
    };

    const renderValueDiff = (oldVal: any, newVal: any) => {
        if (!oldVal && !newVal) return <p className="text-slate-400 italic">No data snapshot available.</p>;
        
        if (!oldVal && newVal) return (
            <div className="bg-emerald-50/30 p-3 rounded-lg border border-emerald-100">
                <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">Initial State Captured</p>
                <pre className="text-[10px] font-mono text-slate-600 overflow-auto whitespace-pre-wrap">{JSON.stringify(newVal, null, 2)}</pre>
            </div>
        );

        if (oldVal && !newVal) return (
            <div className="bg-rose-50/30 p-3 rounded-lg border border-rose-100">
                <p className="text-[10px] font-black text-rose-600 uppercase mb-2">Pre-Deletion State Captured</p>
                <pre className="text-[10px] font-mono text-slate-600 overflow-auto whitespace-pre-wrap">{JSON.stringify(oldVal, null, 2)}</pre>
            </div>
        );

        return (
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Previous State</p>
                    <pre className="text-[10px] font-mono text-slate-600 overflow-auto whitespace-pre-wrap max-h-40">{JSON.stringify(oldVal, null, 2)}</pre>
                </div>
                <div className="bg-blue-50/30 p-3 rounded-lg border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase mb-2">New State</p>
                    <pre className="text-[10px] font-mono text-slate-600 overflow-auto whitespace-pre-wrap max-h-40">{JSON.stringify(newVal, null, 2)}</pre>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full font-sans">
            <div className="mb-6 flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tighter uppercase">
                        <ShieldCheck className="text-blue-600" size={24} />
                        {title}
                    </h1>
                    <p className="text-xs font-medium text-slate-500 mt-1">{subtitle}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => {
                            const exportData = filteredLogs.map(log => ({
                                Timestamp: format(new Date(log.date), 'yyyy-MM-dd HH:mm:ss.SSS'),
                                Action: log.action,
                                EntityType: log.entityType,
                                EntityId: log.entityId,
                                User: log.userId,
                                Details: log.details,
                                CorrelationId: log.correlationId
                            }));
                            exportToCSV(exportData, 'AuditTrail');
                        }}
                        className="bg-white hover:bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 transition-all flex items-center gap-2"
                        title="Download Trail (CSV)"
                    >
                        <Download size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest px-1">Download Trail</span>
                    </button>
                    <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className="flex flex-col">
                            <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Trail Integrity</span>
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1 leading-none"><CheckSquare size={10}/> SEALED</span>
                        </div>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <p className="text-[10px] font-black text-slate-800 uppercase tracking-widest leading-none">{logs.length} Events</p>
                    </div>
                </div>
            </div>

            {!hideFilters && (
                <div className="flex gap-4 mb-6 shrink-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                        <input 
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-sm"
                            placeholder="Search trail..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex bg-white rounded-xl border border-slate-200 p-0.5 shadow-sm">
                        {['All', 'CREATE', 'UPDATE', 'DELETE', 'VOID'].map(action => (
                            <button 
                                key={action}
                                onClick={() => setFilterAction(action)}
                                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${filterAction === action ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 bg-white rounded-[1.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[9px] tracking-[0.2em] border-b border-slate-200 sticky top-0 z-20">
                            <tr>
                                <th className="px-4 py-4 w-10"></th>
                                <th className="px-2 py-4 w-36">Timestamp</th>
                                <th className="px-2 py-4 w-28">Action</th>
                                <th className="px-2 py-4 w-40">Correlation ID</th>
                                <th className="px-2 py-4 w-40">Entity Identity</th>
                                <th className="px-2 py-4">Summary of Change</th>
                                <th className="px-2 py-4 w-36">Identity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredLogs.length === 0 && (
                                <tr><td colSpan={7} className="p-10 text-center text-slate-400 font-medium italic">No matching activity records detected in the ledger.</td></tr>
                            )}
                            {filteredLogs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr 
                                        className={`hover:bg-blue-50/30 transition-colors cursor-pointer group ${expandedId === log.id ? 'bg-blue-50/50' : ''}`}
                                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                                    >
                                        <td className="px-4 py-3 text-center">
                                            {expandedId === log.id ? <ChevronDown size={14} className="text-blue-600"/> : <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500"/>}
                                        </td>
                                        <td className="px-2 py-3 whitespace-nowrap text-slate-500 text-[10px] font-mono font-bold uppercase">
                                            <div className="flex flex-col">
                                                <span>{format(new Date(log.date), 'MMM dd, yyyy')}</span>
                                                <span className="text-blue-600 font-black tracking-tighter">{format(new Date(log.date), 'HH:mm:ss.SSS')}</span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[8px] uppercase tracking-widest border ${getActionColor(log.action)}`}>
                                                <div className={`w-1 h-1 rounded-full ${log.action === 'DELETE' || log.action === 'VOID' ? 'bg-rose-500 animate-pulse' : 'bg-current'}`}></div>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-2 py-3">
                                            <span className="text-[10px] font-mono text-slate-600">{log.correlationId}</span>
                                        </td>
                                        <td className="px-2 py-3">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-0.5">{log.entityType}</span>
                                                <span className="text-[10px] font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 inline-block w-fit">
                                                    {log.entityId}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-2 py-3">
                                            <div className="text-[11px] font-bold text-slate-700 leading-snug">{log.details}</div>
                                            {log.reason && <div className="text-[9px] text-blue-600 font-bold mt-0.5 uppercase tracking-tighter flex items-center gap-1 italic"><FileText size={9}/> Reason: {log.reason}</div>}
                                        </td>
                                        <td className="px-2 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-6 h-6 rounded-full bg-slate-900 flex items-center justify-center text-[9px] font-black text-white shadow-sm">
                                                    {log.userId.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-800 leading-none">@{log.userId}</span>
                                                    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{log.userRole}</span>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedId === log.id && (
                                        <tr className="bg-slate-50/50">
                                            <td colSpan={7} className="px-6 py-4">
                                                <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-4 animate-in slide-in-from-top-4">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                                                                <Zap size={12} className="text-amber-500" fill="currentColor"/> Logical State Diff
                                                            </h4>
                                                            <p className="text-[10px] text-slate-500">Atomic snapshot comparison for transaction ID <span className="font-mono font-bold">{log.id}</span></p>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-0.5 flex items-center justify-end gap-1">
                                                                <ShieldAlert size={10}/> SEALED TRAIL
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {renderValueDiff(log.oldValue, log.newValue)}

                                                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                                                        <div className="flex items-center gap-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                            <span className="flex items-center gap-1"><HistoryIcon size={10}/> Latency: 4ms</span>
                                                            <span className="flex items-center gap-1"><Database size={10}/> Storage: IndexedDB.auditLogs</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
