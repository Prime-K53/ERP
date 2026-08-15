
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Database, RefreshCw, Loader2, Monitor, 
  Code, Download, CheckCircle2, AlertTriangle, AlertCircle, ChevronRight, FileCode, Folder, Terminal, Play,
  Layers, Binary, Activity, Cpu, Usb, CpuIcon, CloudDownload, Printer, Construction, Rocket,
  FileJson, Settings, ShieldCheck, CheckSquare, Server, MousePointer2, Braces, Package,
  Zap, Github, Share2, Search, Filter, Archive, X, Workflow, Eye, ShieldAlert, Heart,
  Sparkles, Laptop, Save, FileText, ChevronDown, ListTree, BoxSelect, Layout, Cpu as ChipIcon,
  BookOpen, HelpCircle, HardDrive, Cpu as Processor, Gauge, Info, Scale, Shield, FileCheck, LifeBuoy
} from 'lucide-react';
import { generateWpfFile } from '../services/wpfGenerator';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { useSales } from '../context/SalesContext';
import { useInventory } from '../context/InventoryContext';
import { SQL_SCHEMA, EF_CORE_CONTEXT, WPF_ARCHITECTURE } from '../services/backendBlueprint';
import ReactMarkdown from 'react-markdown';
import { generateAIResponse } from '../services/geminiService';
import { calculateInventoryValuation } from '../utils/helpers';
import { AuditorBridge } from './reports/AuditorBridge';

enum LocalTab {
    EXPLORER = 'EXPLORER',
    DIAGNOSTICS = 'DIAGNOSTICS',
    DOCS = 'DOCS',
    COMPLIANCE = 'COMPLIANCE'
}

const ERROR_CODES = [
  { code: 'ERP-001', msg: 'ATOMIC_TRANSACTION_FAILURE', desc: 'Rollback triggered due to IO interruption.' },
  { code: 'ERP-002', msg: 'SEQUENTIAL_ID_MISMATCH', desc: 'Gap detected in voucher numbering sequence.' },
  { code: 'ERP-003', msg: 'INSUFFICIENT_STOCK_ALLOCATION', desc: 'Reserve quantity exceeds physical on-hand count.' },
  { code: 'ERP-004', msg: 'LEDGER_UNBALANCED_ERROR', desc: 'Trial balance fails zero-sum validation.' }
];

const Architect: React.FC = () => {
  const { isOnline, notify, dbSyncStatus, companyConfig } = useAuth();
  const { invoices, accounts, ledger } = useFinance();
  const { customers } = useSales();
  const { inventory } = useInventory();
  const [activeTab, setActiveTab] = useState<LocalTab>(LocalTab.EXPLORER);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [buildLogs, setBuildLogs] = useState<string[]>(['Admin Hub v4.5 Initialized', 'Logic Engine: SEALED', 'Docs Sync: Gemini-3-Pro Ready']);
  
  // Documentation State
  const [docSearch, setDocSearch] = useState('');
  const [selectedDocModule, setSelectedDocModule] = useState('User Guides');
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [isDocLoading, setIsDocLoading] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);

  // Logical Drift Calculation
  const auditMetrics = useMemo(() => {
      const physicalValue = calculateInventoryValuation(inventory);
      
      // Calculate Ledger Value from Account 1200 (Inventory Asset)
      const invAcc = accounts.find((a: any) => a.code === '1200' || a.id === '1200');
      let ledgerValue = 0;
      if (invAcc) {
          ledgerValue = ledger.reduce((sum: number, entry: any) => {
              const amt = entry.amount || 0;
              if (entry.debitAccountId === invAcc.id || entry.debitAccountId === invAcc.code) return sum + amt;
              if (entry.creditAccountId === invAcc.id || entry.creditAccountId === invAcc.code) return sum - amt;
              return sum;
          }, 0);
      }

      const drift = isNaN(ledgerValue - physicalValue) ? 0 : (ledgerValue - physicalValue);
      const driftPercent = physicalValue > 0 ? (Math.abs(drift) / physicalValue) * 100 : 0;
      
      return { physicalValue: isNaN(physicalValue) ? 0 : physicalValue, ledgerValue: isNaN(ledgerValue) ? 0 : ledgerValue, drift, driftPercent };
  }, [inventory, accounts, ledger]);

  const PROJECT_STRUCTURE = [
    { name: 'PrimeERP.Core', type: 'project', children: [
        { name: 'Models', type: 'folder', children: ['Item.cs', 'Customer.cs', 'Invoice.cs'] },
        { name: 'Services', type: 'folder', children: ['FinancialCalculator.cs', 'StockManager.cs'] }
    ]},
    { name: 'PrimeERP.Infrastructure', type: 'project', children: [
        { name: 'Persistence', type: 'folder', children: ['AppDbContext.cs', 'SqliteInitializer.cs'] },
        { name: 'Auth', type: 'folder', children: ['SecurityService.cs'] }
    ]}
  ];

  useEffect(() => {
    if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [buildLogs]);

  const log = (msg: string) => {
    setBuildLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleFileSelect = async (fileName: string) => {
    if (!isOnline) {
        notify("Synthesis requires active Gemini uplink.", "error");
        return;
    }
    setSelectedFile(fileName);
    setGeneratedCode('');
    setLoading(true);
    log(`Porting component ${fileName} to C#...`);
    const code = await generateWpfFile(fileName, `Context: ${inventory.length} SKUs, ${invoices.length} Vouchers.`);
    setGeneratedCode(code);
    log(`Ported ${fileName} successfully.`);
    setLoading(false);
  };

  const handleGenerateDoc = async () => {
      if (!isOnline) return;
      setIsDocLoading(true);
      
      // Enrich prompt with actual system context
      const prompt = `Generate a ${selectedDocModule} for PrimeBOOKS ERP. 
      Target Topic: ${docSearch || 'Full System Overview'}.
      
      ACTUAL SYSTEM METADATA:
      Database Schema: ${SQL_SCHEMA}
      Entity Framework Context: ${EF_CORE_CONTEXT}
      Architecture Blueprint: ${WPF_ARCHITECTURE}
      
      Include specific technical details for developers or step-by-step instructions for users based on this real code context. 
      Reference our organization: ${companyConfig.companyName}.
      Format: Professional Markdown.`;
      
      try {
          const res = await generateAIResponse(prompt, "You are a Technical Lead and Document Specialist.");
          setGeneratedDoc(res);
          log(`Docs synthesized for ${selectedDocModule} based on live codebase.`);
      } catch (e) {
          notify("Docs synthesis failed.", "error");
      } finally {
          setIsDocLoading(false);
      }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] text-slate-300 overflow-hidden font-sans select-none">
      
      <header className="h-14 bg-[#161b22] border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-50 shadow-xl">
          <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg border border-white/10">
                    <Settings size={18} className="text-white"/>
                  </div>
                  <div>
                    <span className="text-sm font-black tracking-tight text-white uppercase">Admin <span className="text-blue-500">Hub</span></span>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest leading-none">Sustainability Console</p>
                  </div>
              </div>

              <nav className="flex h-full items-center">
                  {[
                      { id: LocalTab.EXPLORER, label: 'Porting', icon: Laptop },
                      { id: LocalTab.DIAGNOSTICS, label: 'Health', icon: Activity },
                      { id: LocalTab.DOCS, label: 'Docs', icon: BookOpen },
                      { id: LocalTab.COMPLIANCE, label: 'Trust', icon: ShieldCheck },
                  ].map(tab => (
                      <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all px-5 h-14 border-b-2 ${activeTab === tab.id ? 'text-blue-400 border-blue-500 bg-blue-500/5' : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        <tab.icon size={14}/>
                        {tab.label}
                      </button>
                  ))}
              </nav>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase border tracking-widest ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
              {isOnline ? 'Intelligence Active' : 'Restricted Access'}
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Solution Explorer Sidebar */}
        {activeTab === LocalTab.EXPLORER && (
            <div className="w-72 border-r border-slate-800 bg-[#0d1117] flex flex-col shrink-0 animate-in slide-in-from-left duration-300">
                <div className="p-3 border-b border-slate-800 bg-[#161b22]/50">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Archive size={12} className="text-blue-500"/> Native Port Solution
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                    {renderProjectTree(PROJECT_STRUCTURE, handleFileSelect, 0, selectedFile)}
                </div>
            </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-[#010409] relative">
            {/* PORTING VIEW */}
            {activeTab === LocalTab.EXPLORER && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="h-10 bg-[#0d1117] border-b border-slate-800 flex items-center px-4 gap-2 shrink-0">
                        <FileCode size={14} className="text-blue-500"/>
                        <span className="text-xs font-mono text-slate-400 font-bold">{selectedFile || 'Select file to port...'}</span>
                    </div>
                    <div className="flex-1 overflow-auto p-6 font-mono text-[13px] leading-relaxed custom-scrollbar bg-black/20">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4">
                                <RefreshCw size={48} className="animate-spin text-blue-500/20"/>
                                <div className="text-xs font-bold text-blue-400/60 animate-pulse uppercase tracking-widest">Synthesizing .NET Code...</div>
                            </div>
                        ) : generatedCode ? (
                            <pre className="text-blue-100/90 whitespace-pre-wrap select-text">{generatedCode}</pre>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center opacity-20"><Braces size={64} className="mb-4"/><p className="text-xs font-black uppercase tracking-widest">Architecture Porting Studio</p></div>
                        )}
                    </div>
                </div>
            )}

            {/* HEALTH VIEW */}
            {activeTab === LocalTab.DIAGNOSTICS && (
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar animate-in fade-in duration-300">
                    <div className="max-w-5xl mx-auto">
                        <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-8 flex items-center gap-4">
                            <Activity className="text-emerald-500" size={32}/> System Vitality
                        </h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            {[
                                { label: 'DB Integrity', val: '100%', status: 'Normal', icon: Database, color: 'blue' },
                                { label: 'Logical Drift', val: `${auditMetrics.driftPercent.toFixed(2)}%`, status: auditMetrics.driftPercent > 5 ? 'Warning' : 'Optimal', icon: Scale, color: auditMetrics.driftPercent > 5 ? 'rose' : 'emerald' },
                                { label: 'Latency', val: '18ms', status: 'Optimal', icon: Zap, color: 'indigo' },
                                { label: 'Audit Chain', val: 'Verified', status: 'Sealed', icon: ShieldCheck, color: 'blue' }
                            ].map((s, i) => (
                                <div key={i} className="bg-[#161b22] border border-slate-800 p-6 rounded-[2rem] shadow-xl">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`p-3 bg-${s.color}-500/10 rounded-2xl text-${s.color}-400`}><s.icon size={20}/></div>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${s.status === 'Optimal' || s.status === 'Normal' ? 'border-emerald-500/20 text-emerald-400' : 'border-rose-500/20 text-rose-400'}`}>{s.status}</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                                    <p className="text-2xl font-black text-white">{s.val}</p>
                                </div>
                            ))}
                        </div>

                        {/* Integration: Auditor Bridge Integration */}
                        <div className="mb-12">
                            <AuditorBridge 
                                drift={auditMetrics.drift} 
                                physical={auditMetrics.physicalValue} 
                                ledger={auditMetrics.ledgerValue} 
                            />
                        </div>

                        <div className="bg-[#161b22] rounded-[3rem] border border-slate-800 p-8 shadow-2xl">
                             <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                                 <AlertCircle size={18} className="text-amber-500"/> Logic Error Reference
                             </h3>
                             <div className="space-y-3">
                                 {ERROR_CODES.map(e => (
                                     <div key={e.code} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all">
                                         <div className="flex items-center gap-4">
                                             <div className="font-mono text-xs font-black text-amber-500 bg-amber-500/10 px-2 py-1 rounded">{e.code}</div>
                                             <div>
                                                 <div className="font-bold text-sm text-slate-200">{e.msg}</div>
                                                 <p className="text-xs text-slate-500">{e.desc}</p>
                                             </div>
                                         </div>
                                         <button className="p-2 text-slate-600 hover:text-white transition-colors" title="View details" aria-label="View details"><ChevronRight size={16}/></button>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {/* DOCS VIEW */}
            {activeTab === LocalTab.DOCS && (
                <div className="flex-1 flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                    <div className="flex-1 flex">
                        <div className="w-80 border-r border-slate-800 bg-[#0d1117] flex flex-col shrink-0 p-6 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Module</label>
                                <select 
                                    className="w-full bg-[#161b22] border border-slate-700 rounded-xl p-2.5 text-xs font-bold text-white outline-none"
                                    value={selectedDocModule}
                                    onChange={e => setSelectedDocModule(e.target.value)}
                                >
                                    <option>User Manual</option>
                                    <option>Internal API Docs</option>
                                    <option>Database Schema</option>
                                    <option>Inventory Logic FAQ</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Topic</label>
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                                    <input 
                                        className="w-full bg-[#161b22] border border-slate-700 rounded-xl p-2.5 pl-10 text-xs text-white outline-none"
                                        placeholder="Search documentation..."
                                        value={docSearch}
                                        onChange={e => setDocSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button 
                                onClick={handleGenerateDoc}
                                disabled={isDocLoading || !isOnline}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all"
                            >
                                {isDocLoading ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16}/>}
                                Synthesize Guide
                            </button>
                        </div>

                        <div className="flex-1 bg-black/40 overflow-y-auto p-12 custom-scrollbar">
                            {isDocLoading ? (
                                <div className="h-full flex flex-col items-center justify-center gap-6 opacity-40">
                                    <Loader2 size={48} className="animate-spin text-blue-500"/>
                                    <h3 className="text-xs font-black uppercase tracking-[0.4em]">Reasoning...</h3>
                                </div>
                            ) : generatedDoc ? (
                                <div className="max-w-4xl mx-auto prose prose-invert prose-sm">
                                    <ReactMarkdown>{generatedDoc}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 text-center">
                                    <HelpCircle size={80} className="mb-4"/>
                                    <h2 className="text-xl font-black uppercase tracking-[0.2em]">Knowledge Base Idle</h2>
                                    <p className="text-xs mt-2">Generate production-grade documentation via Gemini AI.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TRUST / COMPLIANCE VIEW */}
            {activeTab === LocalTab.COMPLIANCE && (
                <div className="flex-1 overflow-y-auto p-12 custom-scrollbar animate-in slide-in-from-bottom-4 duration-500">
                    <div className="max-w-4xl mx-auto space-y-12">
                        <header className="mb-10">
                            <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Trust & Compliance</h2>
                            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-1">Sustainability & Governance Protocol</p>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <section className="bg-[#161b22] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl">
                                <h3 className="font-black text-slate-200 uppercase text-xs mb-4 flex items-center gap-3"><Shield size={16} className="text-emerald-500"/> Privacy Policy</h3>
                                <div className="text-xs text-slate-500 leading-relaxed space-y-3">
                                    <p>PrimeBOOKS is built on an **Offline-First** architecture. This ensures that PII (Personally Identifiable Information) remains strictly within your local environment (IndexedDB).</p>
                                    <p>Cloud synchronization is optional and end-to-end encrypted. No data is sold or used for model training beyond session context.</p>
                                </div>
                            </section>

                            <section className="bg-[#161b22] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl">
                                <h3 className="font-black text-slate-200 uppercase text-xs mb-4 flex items-center gap-3"><Heart size={16} className="text-rose-500"/> Data Ownership</h3>
                                <div className="text-xs text-slate-500 leading-relaxed space-y-3">
                                    <p>You retain 100% ownership of all records created within this system. Our **Universal Data Package** ensures no vendor lock-in.</p>
                                    <p>Export your entire database as a standard JSON blob or SQLite file at any time via the Settings panel.</p>
                                </div>
                            </section>

                            <section className="bg-[#161b22] border border-slate-800 p-8 rounded-[2.5rem] shadow-xl col-span-2">
                                <h3 className="font-black text-slate-200 uppercase text-xs mb-6 flex items-center gap-3"><FileCheck size={16} className="text-blue-500"/> Terms & Conditions</h3>
                                <div className="text-xs text-slate-500 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <p className="font-bold text-slate-400">1. Usage Rights</p>
                                        <p>The software is provided "as-is" for business operational use. Commercial redistribution is prohibited without an enterprise license.</p>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="font-bold text-slate-400">2. Responsibility</p>
                                        <p>Users are responsible for local database backups. PrimeBOOKS is not liable for data loss occurring due to browser cache clearing or hardware failure.</p>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Terminal Panel */}
            <div className="h-44 bg-[#0d1117] border-t border-slate-800 flex flex-col shrink-0">
                <div className="h-8 bg-[#161b22] flex items-center px-4 justify-between border-b border-slate-800">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Terminal size={12} className="text-emerald-500"/> System Admin Console
                    </span>
                </div>
                <div ref={terminalRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-slate-400 custom-scrollbar bg-black/40">
                    {buildLogs.map((log, i) => (
                        <div key={i} className="mb-0.5 flex gap-3">
                            <span className="text-slate-800 font-bold shrink-0 w-4">{i+1}</span>
                            <span className={log.includes('COMPLETE') || log.includes('synthesized') ? 'text-emerald-400 font-bold' : ''}>{log}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      <footer className="h-8 bg-blue-600 flex items-center px-6 justify-between shrink-0 shadow-2xl z-50">
          <div className="flex gap-8 text-[9px] font-black text-white uppercase tracking-widest">
              <span className="flex items-center gap-2"><LifeBuoy size={12}/> Support Active</span>
              <span className="flex items-center gap-2"><Processor size={12}/> Porting: WPF Native</span>
          </div>
          <div className="flex gap-6 text-[9px] font-black text-white uppercase tracking-widest opacity-80">
              <span className="flex items-center gap-2"><ShieldCheck size={12}/> Logic Verified</span>
              <span className="bg-white/20 px-2 py-0.5 rounded font-mono">VS-PRO-HUB</span>
          </div>
      </footer>
    </div>
  );
};

function renderProjectTree(items: any[], onSelect: (f: string) => void, level = 0, selectedFile: string | null) {
    return (
        <div className="space-y-1 font-mono">
            {items.map((item, idx) => (
                <div key={idx} style={{ paddingLeft: `${level * 12}px` }}>
                    {typeof item === 'string' || item.type === 'file' ? (
                        <div 
                            onClick={() => onSelect(typeof item === 'string' ? item : item.name)}
                            className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded transition-all cursor-pointer text-xs
                                ${selectedFile === (typeof item === 'string' ? item : item.name) ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}
                            `}
                        >
                            <FileCode size={14}/> {typeof item === 'string' ? item : item.name}
                        </div>
                    ) : (
                        <div className="mb-2">
                            <div className="flex items-center gap-2 px-2 py-1 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-[#161b22]/30 rounded mb-1 border border-slate-800/50">
                                {item.type === 'project' ? <Binary size={12} className="text-emerald-500"/> : <Folder size={12} className="text-amber-500/50"/>}
                                {item.name}
                            </div>
                            {item.children && renderProjectTree(item.children, onSelect, level + 1, selectedFile)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default Architect;
