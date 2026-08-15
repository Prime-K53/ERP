
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, Play, Pause, CheckCircle, AlertTriangle, 
  Clock, Package, User, ChevronLeft, Maximize2, 
  Terminal, ShieldAlert, Timer, Settings, Activity,
  List, Hash, Filter, ArrowRight
} from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useAuth } from '../../context/AuthContext';
import { WorkOrder } from '../../types';
import { format } from 'date-fns';

const ShopFloorKiosk: React.FC = () => {
    const { workOrders = [] } = useProduction();
    const { user, notify, companyConfig } = useAuth();
    const { updateWorkOrderStatus, logProductionStep, completeWorkOrder } = useProduction();
    
    const [manualInput, setManualInput] = useState('');
    const [activeWo, setActiveWo] = useState<WorkOrder | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [showLogOutput, setShowLogOutput] = useState(false);
    const [outputQty, setOutputQty] = useState(1);
    const timerRef = useRef<any>(null);

    const trackDowntime = companyConfig?.productionSettings?.trackMachineDownTime ?? true;
    const allowOverproduction = companyConfig?.productionSettings?.allowOverproduction ?? true;
    const showSummary = companyConfig?.productionSettings?.showKioskSummary ?? true;

    const terminalId = `NODE-${(user?.role || 'OP').toUpperCase()}-${new Date().getHours()}`;

    // Filter for Scheduled or In Progress jobs
    const jobQueue = useMemo(() => 
        workOrders.filter(wo => ['Scheduled', 'In Progress'].includes(wo.status)),
    [workOrders]);

    // Filter based on manual search input
    const filteredQueue = useMemo(() => {
        if (!manualInput) return jobQueue;
        const lower = manualInput.toLowerCase();
        return jobQueue.filter(wo => 
            wo.id.toLowerCase().includes(lower) || 
            wo.productName.toLowerCase().includes(lower) ||
            wo.customerName?.toLowerCase().includes(lower)
        );
    }, [jobQueue, manualInput]);

    const handleSelectJob = (wo: WorkOrder) => {
        setActiveWo(wo);
        if (wo.status === 'Scheduled') {
            updateWorkOrderStatus(wo.id, 'In Progress');
            logProductionStep({
                id: '', workOrderId: wo.id, operationName: 'Job Start', timestamp: new Date().toISOString(),
                action: 'Start', operatorId: user?.username || 'System'
            });
        }
        setManualInput('');
    };

    const handleManualSubmit = () => {
        const found = jobQueue.find(wo => wo.id === manualInput.toUpperCase());
        if (found) {
            handleSelectJob(found);
        } else {
            notify("Job ID not found in active production queue.", "error");
        }
    };

    useEffect(() => {
        if (activeWo && activeWo.status === 'In Progress' && !isPaused) {
            timerRef.current = setInterval(() => {
                setElapsed(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [activeWo, isPaused]);

    const formatTime = (sec: number) => {
        const hrs = Math.floor(sec / 3600);
        const mins = Math.floor((sec % 3600) / 60);
        const secs = sec % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const handleComplete = () => {
        if (!activeWo) return;
        
        // Final check for uncompleted quantities if configured
        if (!allowOverproduction && activeWo.quantityCompleted < activeWo.quantityPlanned) {
             if(!confirm(`Warning: Planned quantity (${activeWo.quantityPlanned}) not yet reached. Currently at ${activeWo.quantityCompleted}. Complete anyway?`)) return;
        }

        if (confirm("FINAL VERIFICATION: Has the output quantity been checked for QC compliance?")) {
            completeWorkOrder(activeWo.id);
            setActiveWo(null);
            setElapsed(0);
        }
    };

    const handleLogOutput = async () => {
        if (!activeWo || outputQty <= 0) return;
        
        await logProductionStep({
            id: '',
            workOrderId: activeWo.id,
            operationName: 'Output Log',
            timestamp: new Date().toISOString(),
            action: 'Complete',
            qtyProcessed: outputQty,
            operatorId: user?.username || 'System'
        });
        
        setShowLogOutput(false);
        setOutputQty(1);
        notify(`Logged ${outputQty} units produced`, "success");
    };

    const handleLogFailure = () => {
        if (!activeWo) return;
        notify("Machine failure logged. Maintenance team notified.", "warning");
        logProductionStep({
            id: '',
            workOrderId: activeWo.id,
            operationName: 'Machine Failure',
            timestamp: new Date().toISOString(),
            action: 'Stop',
            operatorId: user?.username || 'System',
            notes: 'Emergency machine failure reported from Terminal.'
        });
        setIsPaused(true);
    };

    return (
        <div className="h-screen bg-black text-white flex flex-col font-sans select-none overflow-hidden">
            <header className="h-20 bg-slate-900 border-b border-slate-800 px-8 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
                        <Activity size={24}/>
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-widest uppercase italic text-blue-400">Station <span className="text-white">Terminal</span></h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Instance: {terminalId}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-500 uppercase">Authenticated Session</p>
                        <p className="font-bold text-slate-200">{user?.name || 'Administrator'}</p>
                    </div>
                    <div className="h-10 w-px bg-slate-800"></div>
                    <div className="text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase">Synchronized Time</p>
                        <p className="font-mono text-lg font-bold text-blue-400">{format(new Date(), 'HH:mm:ss')}</p>
                    </div>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {showLogOutput && (
                    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
                        <div className="bg-slate-900 border-2 border-blue-500 rounded-[3rem] p-12 w-full max-w-2xl text-center shadow-[0_0_50px_rgba(59,130,246,0.3)]">
                            <h2 className="text-4xl font-black tracking-tighter mb-4">Log Finished Output</h2>
                            <p className="text-slate-400 font-bold uppercase tracking-widest mb-12">Enter verified quantity from station</p>
                            
                            <div className="flex items-center justify-center gap-8 mb-12">
                                <button onClick={() => setOutputQty(Math.max(1, outputQty - 1))} className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center text-3xl font-black hover:bg-slate-700 transition-all">-</button>
                                <input 
                                    type="number" 
                                    className="bg-black border-b-4 border-blue-600 w-48 text-7xl font-black text-center outline-none text-white pb-2"
                                    value={outputQty}
                                    onChange={e => setOutputQty(parseFloat(e.target.value) || 0)}
                                />
                                <button onClick={() => setOutputQty(outputQty + 1)} className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-3xl font-black hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/40">+</button>
                            </div>

                            <div className="flex gap-6">
                                <button onClick={() => setShowLogOutput(false)} className="flex-1 py-6 bg-slate-800 rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-slate-700 transition-all">Cancel</button>
                                <button onClick={handleLogOutput} className="flex-1 py-6 bg-blue-600 rounded-[2rem] font-black uppercase tracking-widest text-sm hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20">Confirm & Record</button>
                            </div>
                        </div>
                    </div>
                )}
                {!activeWo ? (
                    <div className="w-full flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 overflow-hidden">
                        <div className="w-full max-w-4xl bg-slate-900 rounded-[3rem] p-10 border border-slate-800 shadow-2xl flex flex-col h-full max-h-[800px]">
                            <div className="flex items-center justify-between mb-8 shrink-0">
                                <div>
                                    <h2 className="text-3xl font-black tracking-tighter">Production Entry</h2>
                                    <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mt-1">Manual Job Selection Console</p>
                                </div>
                                <div className="w-16 h-16 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center border border-blue-500/20">
                                    <Hash size={32}/>
                                </div>
                            </div>

                            <div className="relative mb-8 shrink-0">
                                <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600" size={24}/>
                                <input 
                                    autoFocus
                                    className="w-full bg-black border-2 border-slate-800 rounded-[2rem] p-6 pl-16 text-2xl font-mono text-blue-400 focus:border-blue-600 outline-none transition-all placeholder-slate-800"
                                    placeholder="ENTER JOB ID OR SEARCH QUEUE..."
                                    value={manualInput}
                                    onChange={e => setManualInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                />
                                <button 
                                    onClick={handleManualSubmit}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all active:scale-95 shadow-lg"
                                >
                                    <ArrowRight size={24}/>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                                <div className="flex items-center gap-3 px-4 mb-2">
                                    <Filter size={14} className="text-slate-500"/>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Manufacturing Queue ({filteredQueue.length})</span>
                                </div>
                                
                                {filteredQueue.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center py-20 text-slate-700">
                                        <Package size={64} className="mb-4 opacity-20"/>
                                        <p className="text-lg font-bold uppercase tracking-widest opacity-50">No matching orders</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {filteredQueue.map(wo => (
                                            <button 
                                                key={wo.id}
                                                onClick={() => handleSelectJob(wo)}
                                                className="p-6 bg-slate-800 border border-slate-700 rounded-3xl hover:bg-blue-900/30 hover:border-blue-600 transition-all text-left group flex items-center justify-between"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-1 group-hover:text-blue-400">{wo.id}</p>
                                                    <h4 className="font-bold text-lg text-white truncate leading-tight">{wo.productName}</h4>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-1">{wo.customerName || 'Stock Build'}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                                                    <div className="text-right">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase block leading-none mb-1">Target</span>
                                                        <span className="text-sm font-black text-white">{wo.quantityPlanned}</span>
                                                    </div>
                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${wo.status === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/50' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                                                        {wo.status}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col h-full animate-in slide-in-from-right-8 duration-500">
                        <div className="flex-1 p-10 grid grid-cols-12 gap-10 overflow-hidden">
                            <div className="col-span-8 flex flex-col gap-10 h-full">
                                <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 flex-1 flex flex-col justify-center items-center relative overflow-hidden shadow-2xl">
                                    <div className="absolute top-0 right-0 p-10 opacity-5 rotate-12"><Terminal size={300}/></div>
                                    
                                    <div className="text-center z-10 w-full">
                                        <span className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase mb-6 inline-block">Session Status: Active</span>
                                        <h2 className="text-6xl font-black tracking-tighter mb-4">{activeWo.productName}</h2>
                                        <p className="text-2xl text-slate-400 font-bold font-mono">Order Tracking ID: {activeWo.id}</p>
                                    </div>

                                    <div className="mt-16 flex flex-col items-center z-10">
                                        <div className="text-[120px] font-black font-mono leading-none tracking-tighter text-white mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                            {formatTime(elapsed)}
                                        </div>
                                        <p className="text-sm font-black text-slate-500 uppercase tracking-[0.5em] mb-12">Active Production Delta</p>

                                        <div className="flex gap-6">
                                            <button 
                                                onClick={() => setShowLogOutput(true)}
                                                className="px-12 py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-emerald-900/20"
                                            >
                                                <Package size={20}/> Log Output
                                            </button>
                                            
                                            {trackDowntime && (
                                                <button 
                                                    onClick={handleLogFailure}
                                                    className="px-12 py-5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-rose-900/20"
                                                >
                                                    <AlertTriangle size={20}/> Log Failure
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-10 shrink-0">
                                    <button 
                                        onClick={() => setIsPaused(!isPaused)}
                                        className={`py-8 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xl flex items-center justify-center gap-4 transition-all shadow-xl active:scale-95
                                            ${isPaused ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-amber-600 hover:bg-amber-500'}`}
                                    >
                                        {isPaused ? <Play size={32} fill="currentColor"/> : <Pause size={32} fill="currentColor"/>}
                                        {isPaused ? 'Resume Session' : 'Pause Activity'}
                                    </button>
                                    <button 
                                        onClick={handleComplete}
                                        className="py-8 bg-blue-600 hover:bg-blue-500 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-xl flex items-center justify-center gap-4 transition-all shadow-xl shadow-blue-900/20 active:scale-95"
                                    >
                                        <CheckCircle size={32}/> Complete Operation
                                    </button>
                                </div>
                            </div>

                            {showSummary && (
                                <div className="col-span-4 space-y-10 h-full overflow-y-auto no-scrollbar">
                                    <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8">
                                        <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-6">Specification Sheet</h3>
                                        <div className="space-y-6">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Customer / Reference</p>
                                                <p className="text-lg font-bold text-white truncate">{activeWo.customerName || 'Direct Stock Production'}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-black rounded-2xl border border-slate-800">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase">Target Qty</p>
                                                    <p className="text-xl font-black text-white">{activeWo.quantityPlanned}</p>
                                                </div>
                                                <div className="p-4 bg-black rounded-2xl border border-slate-800">
                                                    <p className="text-[9px] font-black text-slate-500 uppercase">Logged Qty</p>
                                                    <p className="text-xl font-black text-emerald-400">{activeWo.quantityCompleted}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Consumption Matrix</h3>
                                        <div className="space-y-4">
                                            <div className="p-4 bg-black/40 border border-slate-800 rounded-2xl flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400"><Package size={20}/></div>
                                                <div>
                                                    <p className="font-bold text-sm">Primary Stock</p>
                                                    <p className="text-[10px] text-slate-500">Inventory ID: {activeWo.productId}</p>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-black/40 border border-slate-800 rounded-2xl flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400"><Settings size={20}/></div>
                                                <div>
                                                    <p className="font-bold text-sm">Finishing Config</p>
                                                    <p className="text-[10px] text-slate-500">Recipe ID: {activeWo.bomId}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <button 
                                        onClick={() => setActiveWo(null)}
                                        className="w-full flex items-center justify-center gap-3 text-slate-500 hover:text-white transition-colors py-4 font-black uppercase text-[10px] tracking-widest"
                                    >
                                        <ChevronLeft size={16}/> Terminate Session
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <footer className="h-10 bg-blue-600 flex items-center px-8 justify-between shrink-0 shadow-2xl z-50">
                <div className="flex gap-8 text-[9px] font-black text-white uppercase tracking-widest">
                    <span className="flex items-center gap-2"><Maximize2 size={12}/> Industrial Node Console v6.5</span>
                    <span className="flex items-center gap-2"><Timer size={12}/> Millisecond Sync Pulse: OK</span>
                </div>
                <div className="flex gap-6 text-[9px] font-black text-white uppercase tracking-widest opacity-80">
                    <span className="flex items-center gap-2"><ShieldAlert size={12}/> Logical Integrity: VERIFIED</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded font-mono uppercase">Node Locked</span>
                </div>
            </footer>
        </div>
    );
};

export default ShopFloorKiosk;
