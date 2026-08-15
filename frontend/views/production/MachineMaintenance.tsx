
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, Thermometer, Zap, Wrench, AlertTriangle, CheckCircle, 
  Clock, BarChart3, RotateCcw, Settings, PlayCircle, StopCircle, UserPlus, ClipboardList, Trash2,
  Sparkles, Loader2, X, MessageSquare
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar 
} from 'recharts';
import { useProduction } from '../../context/ProductionContext';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { ProductionResource, MaintenanceLog } from '../../types';
import { generateAIResponse } from '../../services/geminiService';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

interface MachineTelemetry {
  resourceId: string;
  status: 'Running' | 'Idle' | 'Down' | 'Maintenance';
  temperature: number;
  vibration: number;
  powerUsage: number;
  uptime: number;
  efficiency: number;
  lastMaintenance: string;
  nextMaintenance: string;
}

const MachineMaintenance: React.FC = () => {
  const { 
    resources, maintenanceLogs, addMaintenanceLog, 
    deleteMaintenanceLog, workOrders 
  } = useProduction();
  const { addTask } = useData();
  const { user, notify, companyConfig } = useAuth();
  const [selectedMachineId, setSelectedMachineId] = useState<string>(resources[0]?.id || '');
  const [telemetry, setTelemetry] = useState<Record<string, MachineTelemetry>>({});
  const [aiPrediction, setAiPrediction] = useState<{ risk: 'Low' | 'Medium' | 'High', advice: string, loading: boolean }>({ risk: 'Low', advice: '', loading: false });

  const trackDowntime = companyConfig?.productionSettings?.trackMachineDownTime ?? true;

  // Report Issue Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportNotes, setReportNotes] = useState('');
  const [reportWoId, setReportWoId] = useState('');
  const [reportDowntime, setReportDowntime] = useState('');
  const prevMachineIdRef = useRef(selectedMachineId);

  const analyzeMachineAI = async () => {
    if (!selectedMachine || !currentData) return;
    setAiPrediction(prev => ({ ...prev, loading: true }));
    try {
      const prompt = `
        Analyze this machine's IoT telemetry and predict maintenance needs.
        Machine: ${selectedMachine.name}
        Temperature: ${currentData.temperature}°C (Normal: 40-55)
        Vibration: ${currentData.vibration}mm/s (Normal: < 2.5)
        Efficiency: ${currentData.efficiency}%
        Uptime: ${currentData.uptime} hours
        
        Provide a risk level (Low, Medium, High) and a one-sentence technical advice.
        Return in JSON format: { "risk": "string", "advice": "string" }
      `;
      const response = await generateAIResponse(prompt, "You are a Predictive Maintenance AI. Respond in JSON.");
      const result = JSON.parse(response);
      setAiPrediction({ risk: result.risk, advice: result.advice, loading: false });
    } catch (error) {
      setAiPrediction({ risk: 'Low', advice: 'Telemetry within normal operating parameters.', loading: false });
    }
  };

  useEffect(() => {
    const initData: Record<string, MachineTelemetry> = {};
    resources.forEach(r => {
      initData[r.id] = {
        resourceId: r.id,
        status: 'Running',
        temperature: 45 + Math.random() * 10,
        vibration: 2 + Math.random(),
        powerUsage: 12 + Math.random() * 5,
        uptime: 240 + Math.floor(Math.random() * 100),
        efficiency: 85 + Math.floor(Math.random() * 10),
        lastMaintenance: new Date(Date.now() - 86400000 * 30).toISOString(),
        nextMaintenance: new Date(Date.now() + 86400000 * 5).toISOString(),
      };
    });
    setTelemetry(initData);

    const interval = setInterval(() => {
      setTelemetry(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          const m = next[key];
          next[key] = {
            ...m,
            temperature: parseFloat((m.temperature + (Math.random() - 0.5) * 2).toFixed(1)),
            vibration: parseFloat((m.vibration + (Math.random() - 0.5) * 0.2).toFixed(2)),
          };
        });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [resources]);

  const selectedMachine = resources.find(r => r.id === selectedMachineId);
  const currentData = telemetry[selectedMachineId];
  const activeWOs = (workOrders || []).filter(wo => wo.status === 'In Progress');

  // Reset chart data when machine changes
  useEffect(() => {
      prevMachineIdRef.current = selectedMachineId;
  }, [selectedMachineId]);

  const handleReportIssue = () => {
      if (!selectedMachine) return;
      setReportNotes('');
      setReportWoId('');
      setReportDowntime('');
      setShowReportModal(true);
  };

  const submitReport = () => {
      if (!selectedMachine || !reportNotes.trim()) return;
      const mLog: MaintenanceLog = {
          id: `MAINT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
          resourceId: selectedMachine.id,
          machineName: selectedMachine.name,
          type: 'Breakdown',
          date: new Date().toISOString(),
          status: 'Pending',
          notes: reportNotes,
          workOrderId: reportWoId || undefined,
          downtimeMinutes: reportDowntime ? parseInt(reportDowntime) : undefined
      };
      addMaintenanceLog(mLog);
      
      addTask({
          id: `TASK-MAINT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
          title: `REPAIR: ${selectedMachine.name}`,
          status: 'Pending',
          priority: 'High',
          dueDate: new Date().toISOString().split('T')[0],
          assignedTo: user?.id || '',
          relatedTo: reportWoId ? { id: reportWoId, name: `WO: ${reportWoId}`, type: 'WorkOrder' } : { id: selectedMachine.id, name: selectedMachine.name, type: 'WorkOrder' },
          notes: `MAINTENANCE REPORT: ${reportNotes}${reportWoId ? `\nRelated to Work Order: ${reportWoId}` : ''}`,
          hasAlarm: true
      });
      notify("Maintenance ticket logged and registered.", "success");
      setShowReportModal(false);
  };

  const handleServiceSchedule = () => {
      if (!selectedMachine) return;
      const mLog: MaintenanceLog = {
          id: '',
          resourceId: selectedMachine.id,
          machineName: selectedMachine.name,
          type: 'Preventive',
          date: currentData.nextMaintenance,
          status: 'Pending',
          notes: 'Routine service based on IoT wear indicators.'
      };
      addMaintenanceLog(mLog);

      addTask({
          id: '',
          title: `PREVENTIVE: ${selectedMachine.name}`,
          status: 'Pending',
          priority: 'Medium',
          dueDate: currentData.nextMaintenance.split('T')[0],
          assignedTo: user?.id || '',
          relatedTo: { id: selectedMachine.id, name: selectedMachine.name, type: 'WorkOrder' },
          notes: `Routine service scheduled based on IoT indicators.`,
          hasAlarm: true
      });
      notify("Preventive service task scheduled.", "success");
  };

  const [chartData, setChartData] = useState<{time: string, temp: number}[]>([]);
  useEffect(() => {
    if (!currentData) return;
    setChartData(prev => {
      const newData = [...prev, { time: new Date().toLocaleTimeString([], {second:'2-digit'}), temp: currentData.temperature }];
      if (newData.length > 20) newData.shift();
      return newData;
    });
  }, [currentData]);

  if (!selectedMachine || !currentData) return <div style={{ padding: '32px', color: '#fff', background: '#0b3e39' }}>Connecting to IoT Gateway...</div>;

  return (
    <>
    {/* Report Issue Modal */}
    {showReportModal && selectedMachine && (
        <div style={{ position: 'fixed', top: 0, zIndex: 50, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', right: 0, bottom: 0, left: 0 }} onClick={() => setShowReportModal(false)}>
            <div style={{ background: '#0b3e39', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)', width: '100%', maxWidth: '448px', overflow: 'hidden', border: '1.4px solid #e4ddd1', borderColor: '#146b60' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '16px', borderStyle: 'solid', borderColor: '#0f544c', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}><Wrench size={16}/> Report Issue</h2>
                    <button onClick={() => setShowReportModal(false)}><X size={18} style={{ color: '#5c6567' }}/></button>
                </div>
                <div style={{ padding: '16px', marginTop: '16px' }}>
                    <div>
                        <p style={{ fontSize: '13px', color: '#5c6567', marginBottom: '4px' }}>Machine</p>
                        <p style={{ fontWeight: 700 }}>{selectedMachine.name}</p>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#5c6567', textTransform: 'uppercase', marginBottom: '4px' }}>Describe the issue</label>
                        <textarea style={{ width: '100%', padding: '8px', background: '#0f544c', border: '1.4px solid #e4ddd1', borderColor: '#146b60', borderRadius: '10px', fontSize: '13px', color: '#fff', height: '96px' }} value={reportNotes} onChange={e => setReportNotes(e.target.value)} placeholder="What happened?" autoFocus/>
                    </div>
                    {activeWOs.length > 0 && (
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#5c6567', textTransform: 'uppercase', marginBottom: '4px' }}>Related Work Order (optional)</label>
                            <select style={{ width: '100%', padding: '8px', background: '#0f544c', border: '1.4px solid #e4ddd1', borderColor: '#146b60', borderRadius: '10px', fontSize: '13px' }} value={reportWoId} onChange={e => setReportWoId(e.target.value)}>
                                <option value="">-- None --</option>
                                {activeWOs.map(wo => (
                                    <option key={wo.id} value={wo.id}>{wo.id} - {wo.productName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {trackDowntime && (
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', color: '#5c6567', textTransform: 'uppercase', marginBottom: '4px' }}>Est. Downtime (minutes, optional)</label>
                            <input type="number" style={{ width: '100%', padding: '8px', background: '#0f544c', border: '1.4px solid #e4ddd1', borderColor: '#146b60', borderRadius: '10px', fontSize: '13px' }} value={reportDowntime} onChange={e => setReportDowntime(e.target.value)} min="1"/>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', paddingTop: '8px' }}>
                        <button onClick={() => setShowReportModal(false)} style={{ flex: 1, paddingTop: '8px', background: '#0f544c', color: '#5c6567', borderRadius: '10px', fontWeight: 700, fontSize: '13px', paddingBottom: '8px' }}>Cancel</button>
                        <button onClick={submitReport} disabled={!reportNotes.trim()} style={{ flex: 1, paddingTop: '8px', background: '#d99a3f', color: '#fff', borderRadius: '10px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', paddingBottom: '8px' }}>
                            <MessageSquare size={14}/> Submit Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )}
    <div style={{ background: '#0b3e39', color: '#fff', display: 'flex', overflow: 'hidden', fontWeight: 400 }}>
        <div style={{ width: '288px', borderStyle: 'solid', borderColor: '#0f544c', display: 'flex', flexDirection: 'column', background: '#0b3e39', flexShrink: 0 }}>
            <div style={{ padding: '24px', borderStyle: 'solid', borderColor: '#0f544c' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#3fa294' }}><Activity size={20}/> Machine Health</h2>
                <p style={{ fontSize: '11px', color: '#5c6567', marginTop: '4px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.1em' }}>IoT Telemetry Feed</p>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px', marginTop: '8px' }}>
                {resources.map(res => (
                    <button 
                        key={res.id}
                        onClick={() => setSelectedMachineId(res.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedMachineId === res.id ? 'bg-blue-900/40 border-blue-500 shadow-lg' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5c6567', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '.1em' }}>
                            <span className={telemetry[res.id]?.status === 'Down' ? 'text-rose-500' : 'text-emerald-500'}>{telemetry[res.id]?.status}</span>
                            <span className={telemetry[res.id]?.temperature > 50 ? 'text-amber-400' : 'text-emerald-400'}>{telemetry[res.id]?.temperature}°C</span>
                        </div>
                    </button>
                ))}
            </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h1 style={{ fontSize: '30px', fontWeight: 900, letterSpacing: '-.05em', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {selectedMachine.name}
                        <span style={{ paddingLeft: '16px', paddingTop: '4px', borderRadius: '9999px', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', border: '1.4px solid #e4ddd1', background: '#eef7f6', color: '#3fa294', display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', paddingBottom: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#eef7f6', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}></div>
                            {currentData.status}
                        </span>
                    </h1>
                    <p style={{ color: '#5c6567', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginTop: '8px' }}>Resource Node ID: {selectedMachine.id}</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    {trackDowntime && (
                        <button onClick={handleReportIssue} style={{ background: '#b5493f', color: '#fff', paddingLeft: '24px', paddingTop: '12px', borderRadius: '16px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px 0 rgba(181,73,63,.2)', transition: 'all .15s ease', paddingRight: '24px', paddingBottom: '12px' }}>
                            <AlertTriangle size={16}/> Log Failure
                        </button>
                    )}
                    <button onClick={handleServiceSchedule} style={{ background: '#1f8577', color: '#fff', paddingLeft: '24px', paddingTop: '12px', borderRadius: '16px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px 0 rgba(8,46,42,.2)', transition: 'all .15s ease', paddingRight: '24px', paddingBottom: '12px' }}>
                        <Wrench size={16}/> Schedule Service
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '24px', marginBottom: '40px' }}>
                <div style={{ background: '#0b3e39', padding: '24px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                        <div style={{ padding: '12px', background: '#eef7f6', borderRadius: '16px', color: '#3fa294' }}><Thermometer size={20}/></div>
                        <span style={{ fontWeight: 900, color: '#5c6567' }}>REAL-TIME</span>
                    </div>
                    <p style={{ color: '#5c6567', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Temperature</p>
                    <h3 style={{ fontSize: '24px', fontWeight: 900 }}>{currentData.temperature}°C</h3>
                </div>
                <div style={{ background: '#0b3e39', padding: '24px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                        <div style={{ padding: '12px', background: '#eef7f6', borderRadius: '16px', color: '#3fa294' }}><Zap size={20}/></div>
                        <span style={{ fontWeight: 900, color: '#5c6567' }}>SENSORS</span>
                    </div>
                    <p style={{ color: '#5c6567', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Vibration</p>
                    <h3 style={{ fontSize: '24px', fontWeight: 900 }}>{currentData.vibration} <span style={{ fontSize: '11px', color: '#5c6567' }}>mm/s</span></h3>
                </div>
                <div style={{ background: '#0b3e39', padding: '24px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                        <div style={{ padding: '12px', background: '#eef7f6', borderRadius: '16px', color: '#3fa294' }}><Activity size={20}/></div>
                        <span style={{ fontWeight: 900, color: '#1f8577' }}>OPTIMAL</span>
                    </div>
                    <p style={{ color: '#5c6567', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>Efficiency</p>
                    <h3 style={{ fontSize: '24px', fontWeight: 900 }}>{currentData.efficiency}%</h3>
                </div>
                
                {/* AI Prediction Card */}
                <div style={{ padding: '24px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, padding: '16px', opacity: 0.2 }}>
                        <Sparkles size={40} style={{ color: '#3fa294' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                        <div style={{ padding: '12px', background: '#eef7f6', borderRadius: '16px' }}><RotateCcw size={20}/></div>
                        <button 
                            onClick={analyzeMachineAI}
                            disabled={aiPrediction.loading}
                            style={{ fontWeight: 900, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            {aiPrediction.loading ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={10} />}
                            Analyze
                        </button>
                    </div>
                    <p style={{ fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>AI Risk Prediction</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <h3 className={`text-2xl font-black ${aiPrediction.risk === 'High' ? 'text-rose-400' : aiPrediction.risk === 'Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {aiPrediction.risk}
                        </h3>
                        <span style={{ fontWeight: 700 }}>LEVEL</span>
                    </div>
                    <p style={{ marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{aiPrediction.advice || 'Run AI analysis for insights.'}</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '32px' }}>
                <div style={{ background: '#0b3e39', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={18} style={{ color: '#1f8577' }}/> Thermal Stability Pulse
                    </h3>
                    <div style={{ width: '100%', height: 320, minHeight: 150 }}>
                        <ResponsiveContainer width="100%" height="100%" minHeight={150} minWidth={0}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b"/>
                                <XAxis dataKey="time" tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} axisLine={false} dy={10} />
                                <YAxis domain={[0, 100]} tick={{fill: '#475569', fontSize: 10, fontWeight: 700}} axisLine={false} />
                                <Tooltip contentStyle={{backgroundColor:'#020617', borderColor:'#1e293b', borderRadius: '16px'}}/>
                                <Area type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorTemp)" isAnimationActive={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div style={{ background: '#0b3e39', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39', padding: '40px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,.25)' }}>
                    <h3 style={{ fontSize: '11px', fontWeight: 900, color: '#5c6567', textTransform: 'uppercase', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ClipboardList size={18} style={{ color: '#1f8577' }}/> Maintenance Ledger
                    </h3>
                    <div style={{ flex: 1, overflowY: 'auto', marginTop: '16px', scrollbarWidth: 'none' }}>
                        {(maintenanceLogs || []).filter(l => l.resourceId === selectedMachineId).map(log => (
                            <div key={log.id} style={{ padding: '20px', borderRadius: '24px', background: 'rgba(0,0,0,.4)', border: '1.4px solid #e4ddd1', borderColor: '#0b3e39', fontSize: '11px', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 900, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '.1em' }}>{log.type}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: '#5c6567', fontFamily: '"JetBrains Mono",monospace' }}>{new Date(log.date).toLocaleDateString()}</span>
                                        <button onClick={() => deleteMaintenanceLog(log.id)} style={{ color: '#23282A', opacity: 0.0, transition: 'opacity .15s ease' }}><Trash2 size={12}/></button>
                                    </div>
                                </div>
                                <p style={{ color: '#5c6567', fontWeight: 500, lineHeight: 1.625 }}>{log.notes}</p>
                                {log.workOrderId && (
                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#1f8577', textTransform: 'uppercase', letterSpacing: '-.05em' }}>
                                        <ClipboardList size={10}/> WO: {log.workOrderId}
                                    </div>
                                )}
                                {log.downtimeMinutes !== undefined && (
                                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#b5493f', textTransform: 'uppercase', letterSpacing: '-.05em' }}>
                                        <Clock size={10}/> Downtime: {log.downtimeMinutes}m
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!maintenanceLogs || maintenanceLogs.length === 0) && <p style={{ textAlign: 'center', color: '#5c6567', fontStyle: 'italic', paddingTop: '80px', paddingBottom: '80px' }}>No maintenance history recorded.</p>}
                    </div>
                </div>
            </div>
        </div>
    </div>
    </>
  );
};

export default MachineMaintenance;
