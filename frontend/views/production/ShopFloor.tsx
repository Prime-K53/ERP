
import React, { useState } from 'react';
import {
  Play, CheckCircle, AlertTriangle, Activity, Clock,
  Package, ShieldAlert, Trash2, History, ShieldCheck,
  ChevronRight, ArrowLeft, MoreVertical, Search, Filter,
  Settings, User, Terminal, Cpu, Info
} from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { WorkOrder } from '../../types';
import { OfflineImage } from '../../components/OfflineImage';
import { format } from 'date-fns';
import { ConfirmDialog, ConfirmDialogType } from '../../components/ConfirmDialog';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const ShopFloor: React.FC = () => {
  const { workOrders, updateWorkOrderStatus, logProductionStep, completeWorkOrder, boms } = useProduction();
  const { inventory } = useInventory();
  const { user, notify } = useAuth();
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [qtyInput, setQtyInput] = useState(0);
  const [noteInput, setNoteInput] = useState('');
  const [wasteReason, setWasteReason] = useState('Material Defect');
  const [selectedWasteMaterial, setSelectedWasteMaterial] = useState('');
  const [wasteDestroyed, setWasteDestroyed] = useState(false);
  const [destructionCert, setDestructionCert] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [confirmState, setConfirmState] = useState<{ open: boolean; title: string; message: string; confirmText?: string; type?: ConfirmDialogType; onConfirm?: () => void }>({ open: false, title: '', message: '' });

  // Auto-select Paper/Toner for Examinations
  React.useEffect(() => {
    if (selectedWo?.id.startsWith('WO-EXAM-')) {
        const paper = inventory.find(i => i.name.toLowerCase().includes('paper'));
        if (paper) setSelectedWasteMaterial(paper.id);
    }
  }, [selectedWo, inventory]);

  const activeJobs = workOrders.filter(wo => wo.status === 'In Progress' && (wo.productName.toLowerCase().includes(searchQuery.toLowerCase()) || wo.id.toLowerCase().includes(searchQuery.toLowerCase())));
  const queueJobs = workOrders.filter(wo => wo.status === 'Scheduled' && (wo.productName.toLowerCase().includes(searchQuery.toLowerCase()) || wo.id.toLowerCase().includes(searchQuery.toLowerCase())));

  const handleStartJob = (wo: WorkOrder) => {
      updateWorkOrderStatus(wo.id, 'In Progress');
      logProductionStep({
          id: '', workOrderId: wo.id, operationName: 'Production', timestamp: new Date().toISOString(),
          action: 'Start', operatorId: user?.username || 'Operator'
      });
      setSelectedWo({...wo, status: 'In Progress'});
  };

  const handleFinishJob = (wo: WorkOrder) => {
    setConfirmState({
      open: true,
      title: 'Finish Job',
      message: 'Are you sure you want to finish this job? This will complete the production process.',
      type: 'warning',
      confirmText: 'Finish',
      onConfirm: () => {
        updateWorkOrderStatus(wo.id, 'Completed');
        logProductionStep({
            id: '', workOrderId: wo.id, operationName: 'Production', timestamp: new Date().toISOString(),
            action: 'Complete', operatorId: user?.username || 'Operator'
        });
        completeWorkOrder(wo.id);
        notify("Job completed successfully!", "success");
      }
    });
  };

  const handleLog = (type: 'Complete' | 'Log Waste') => {
      if (!selectedWo || qtyInput <= 0) return;
      
      if (type === 'Log Waste') {
          if (!selectedWasteMaterial) {
              notify("Please select the material wasted.", "error");
              return;
          }
          
          if (selectedWo.isConfidential && (!wasteDestroyed || !destructionCert)) {
              notify("Confidentiality Protocol: Verification of destruction and Certificate ID required.", "error");
              return;
          }

          const mat = inventory.find(i => i.id === selectedWasteMaterial);
          const notes = `${wasteReason}: ${qtyInput} ${mat?.unit || 'Units'} of ${mat?.name}. ${noteInput} ${destructionCert ? `[CERT: ${destructionCert}]` : ''}`;
          
          logProductionStep({
            id: '', workOrderId: selectedWo.id, operationName: 'Production', timestamp: new Date().toISOString(),
            action: 'Log Waste', qtyProcessed: qtyInput, notes, operatorId: user?.username || 'Operator',
            materialId: selectedWasteMaterial, wasteDestroyed: true
          });
          
          notify("Scrap Logged & Security Chain Verified.", "success");
      } else {
          logProductionStep({
            id: '', workOrderId: selectedWo.id, operationName: 'Production', timestamp: new Date().toISOString(),
            action: 'Complete', qtyProcessed: qtyInput, notes: noteInput, operatorId: user?.username || 'Operator'
          });

          if (selectedWo.quantityCompleted + qtyInput >= selectedWo.quantityPlanned) {
              setConfirmState({
                  open: true,
                  title: 'Finalize Job',
                  message: 'Order Target Reached. Finalize Job?',
                  type: 'question',
                  confirmText: 'Finalize',
                  onConfirm: () => {
                      completeWorkOrder(selectedWo.id);
                      setSelectedWo(null);
                  }
              });
          }
      }

      setQtyInput(0);
      setNoteInput('');
      setSelectedWasteMaterial('');
      setWasteDestroyed(false);
      setDestructionCert('');
  };

  const selectedProduct = selectedWo ? inventory.find(i => i.id === selectedWo.productId) : null;
  const selectedBom = selectedWo ? boms.find(b => b.id === selectedWo.bomId) : null;

  return (
    <div style={{ background: '#FEFDFB', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'Inter,"DM Sans",sans-serif' }}>
      {/* Top Header */}
      <div style={{ height: '56px', borderStyle: 'solid', borderColor: '#e4ddd1', paddingLeft: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: '#FEFDFB', paddingRight: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedWo && (
            <button 
              onClick={() => setSelectedWo(null)}
              style={{ padding: '6px', borderRadius: '8px', color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Terminal size={16} style={{ color: '#1f8577' }} />
            <h2 style={{ fontWeight: 700, color: '#23282A', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {selectedWo ? `Job / ${selectedWo.id}` : 'Production Hub'}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5c6567' }} />
            <input 
              type="text" 
              placeholder="Search by ID or product..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '36px', paddingRight: '16px', paddingTop: '6px', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '8px', width: '256px', outline: 'none', transition: 'all .15s ease', paddingBottom: '6px' }}
            />
          </div>
          <div style={{ height: '16px', width: '1px', background: '#eef7f6' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 700, color: '#23282A', lineHeight: 1 }}>{user?.username || 'Operator'}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', justifyContent: 'flex-end' }}>
                <div style={{ width: '6px', height: '6px', background: '#eef7f6', borderRadius: '9999px', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                <p style={{ fontWeight: 500, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '-.025em' }}>Terminal Active</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!selectedWo ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '24px', marginTop: '24px', overflowY: 'auto' }}>
            {/* Simple Stats Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
              {[
                { label: 'Active', value: activeJobs.length, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Queue', value: queueJobs.length, color: 'text-slate-600', bg: 'bg-slate-50' },
                { label: 'Confidential', value: workOrders.filter(w => w.isConfidential).length, color: 'text-rose-600', bg: 'bg-rose-50' },
                { label: 'OEE', value: '94.2%', color: 'text-emerald-600', bg: 'bg-emerald-50' }
              ].map((stat, i) => (
                <div key={i} className={`${stat.bg} p-4 rounded-lg border border-slate-100`}>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '4px' }}>{stat.label}</p>
                  <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '24px', flex: 1, minHeight: 0 }}>
              {/* Active Jobs List */}
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Activity size={14} style={{ color: '#1f8577' }} />
                  <h3 style={{ fontWeight: 700, color: '#23282A', textTransform: 'uppercase', letterSpacing: '.1em' }}>Active Production</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', marginTop: '8px', paddingRight: '8px' }}>
                   {activeJobs.map(wo => (
                     <button 
                       key={wo.id}
                       onClick={() => setSelectedWo(wo)}
                       style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '16px', background: '#FEFDFB', padding: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '10px', transition: 'all .15s ease', textAlign: 'left' }}
                     >
                       <div style={{ width: '48px', height: '48px', background: '#eef7f6', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <Package size={20} style={{ color: '#1f8577' }}/>
                       </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#1f8577', textTransform: 'uppercase', letterSpacing: '-.025em' }}>#{wo.id}</span>
                          {wo.isConfidential && <ShieldAlert size={12} style={{ color: '#b5493f' }} />}
                        </div>
                        <h4 style={{ fontWeight: 700, color: '#23282A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.productName}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                          <div style={{ flex: 1, height: '4px', background: '#eef7f6', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: '#eef7f6', width: `${Math.min(100, (wo.quantityCompleted/wo.quantityPlanned)*100)}%` }} />
                          </div>
                          <span style={{ fontWeight: 700, color: '#5c6567' }}>{wo.quantityCompleted}/{wo.quantityPlanned}</span>
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: '#5c6567', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }} />
                    </button>
                  ))}
                  {activeJobs.length === 0 && (
                    <div style={{ paddingTop: '48px', border: '1.4px solid #e4ddd1', borderStyle: 'dashed', borderColor: '#e4ddd1', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5c6567', paddingBottom: '48px' }}>
                      <Cpu size={24} style={{ opacity: 0.2, marginBottom: '8px' }} />
                      <p style={{ fontStyle: 'italic' }}>No active jobs</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Queue List */}
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <History size={14} style={{ color: '#5c6567' }} />
                  <h3 style={{ fontWeight: 700, color: '#23282A', textTransform: 'uppercase', letterSpacing: '.1em' }}>Manufacturing Queue</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', marginTop: '8px', paddingRight: '8px' }}>
                   {queueJobs.map(wo => (
                     <div key={wo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FEFDFB', padding: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '10px', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                         <div style={{ width: '40px', height: '40px', background: '#eef7f6', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#a6d9d3', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <Package size={16} style={{ color: '#1f8577' }}/>
                         </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: 700, color: '#23282A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.productName}</p>
                          <p style={{ fontWeight: 500, color: '#5c6567', textTransform: 'uppercase' }}>Qty: {wo.quantityPlanned} • {wo.id}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleStartJob(wo)}
                        style={{ paddingLeft: '12px', paddingTop: '6px', background: '#1f8577', color: '#fff', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', transition: 'all .15s ease', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 2px rgba(0,0,0,.05)', paddingRight: '12px', paddingBottom: '6px' }}
                      >
                        <Play size={10} fill="currentColor" /> Start
                      </button>
                    </div>
                  ))}
                  {queueJobs.length === 0 && (
                    <div style={{ paddingTop: '48px', border: '1.4px solid #e4ddd1', borderStyle: 'dashed', borderColor: '#e4ddd1', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#5c6567', paddingBottom: '48px' }}>
                      <Clock size={24} style={{ opacity: 0.2, marginBottom: '8px' }} />
                      <p style={{ fontStyle: 'italic' }}>Queue is clear</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SELECTED JOB VIEW - Minimalist Focus */
          <div style={{ height: '100%', display: 'flex', overflow: 'hidden', transitionDuration: '300ms' }}>
            {/* Left Info Panel */}
            <div style={{ width: '320px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6', padding: '24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ width: '96px', height: '96px', background: '#FEFDFB', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)', overflow: 'hidden', marginBottom: '16px' }}>
                  <OfflineImage src={selectedProduct?.image} alt={selectedWo.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <span style={{ paddingLeft: '8px', paddingTop: '2px', background: '#eef7f6', color: '#1f8577', fontWeight: 700, borderRadius: '6px', textTransform: 'uppercase', marginBottom: '8px', border: '1.4px solid #e4ddd1', borderColor: '#d3ece9', paddingRight: '8px', paddingBottom: '2px' }}>
                  {selectedWo.id}
                </span>
                <h2 style={{ fontWeight: 700, color: '#23282A', lineHeight: 1.25, marginBottom: '8px' }}>{selectedWo.productName}</h2>
                {selectedWo.isConfidential && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#b5493f', background: '#fef2f2', paddingLeft: '8px', paddingTop: '4px', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#b5493f', paddingRight: '8px', paddingBottom: '4px' }}>
                    <ShieldAlert size={14} />
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-.025em' }}>Confidential</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '12px', marginBottom: '32px' }}>
                <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', textAlign: 'center' }}>
                  <p style={{ fontWeight: 700, color: '#5c6567', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px' }}>Planned</p>
                  <p style={{ fontSize: '16px', fontWeight: 900, color: '#23282A' }}>{selectedWo.quantityPlanned}</p>
                </div>
                <div style={{ background: '#FEFDFB', padding: '12px', borderRadius: '10px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', textAlign: 'center' }}>
                  <p style={{ fontWeight: 700, color: '#3fa294', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: '2px' }}>Done</p>
                  <p style={{ fontSize: '16px', fontWeight: 900, color: '#1f8577' }}>{selectedWo.quantityCompleted}</p>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#5c6567', borderStyle: 'solid', borderColor: '#e4ddd1', paddingBottom: '8px' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '-.025em' }}>Machine Status</span>
                  <span style={{ color: '#1f8577' }}>OPTIMAL</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#5c6567', borderStyle: 'solid', borderColor: '#e4ddd1', paddingBottom: '8px' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '-.025em' }}>Workstation Temp</span>
                  <span style={{ color: '#23282A' }}>42°C</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#5c6567', borderStyle: 'solid', borderColor: '#e4ddd1', paddingBottom: '8px' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '-.025em' }}>OEE Efficiency</span>
                  <span style={{ color: '#23282A' }}>94.2%</span>
                </div>
              </div>
            </div>

            {/* Main Action Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#FEFDFB' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                <div style={{ maxWidth: '896px', marginLeft: 'auto', marginTop: '32px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '32px' }}>
                    {/* Good Units Panel */}
                    <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                      <h3 style={{ fontWeight: 700, color: '#1f8577', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        <CheckCircle size={16}/> Log Good Output
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                        <button onClick={() => setQtyInput(Math.max(0, qtyInput-1))} style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#eef7f6', transition: 'color .15s ease,background .15s ease,border-color .15s ease', color: '#5c6567', fontWeight: 700 }}>-</button>
                        <input 
                          type="number" 
                          style={{ flex: 1, textAlign: 'center', background: 'transparent', fontWeight: 900, borderStyle: 'solid', borderColor: '#e4ddd1', outline: 'none', paddingTop: '8px', color: '#23282A', paddingBottom: '8px' }} 
                          value={qtyInput} 
                          onChange={e => setQtyInput(parseInt(e.target.value) || 0)} 
                        />
                        <button onClick={() => setQtyInput(qtyInput+1)} style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#eef7f6', transition: 'color .15s ease,background .15s ease,border-color .15s ease', color: '#5c6567', fontWeight: 700 }}>+</button>
                      </div>
                      <button 
                        onClick={() => handleLog('Complete')} 
                        style={{ width: '100%', paddingTop: '14px', background: '#1f8577', color: '#fff', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', transition: 'all .15s ease', boxShadow: '0 4px 14px 0 rgba(31,133,119,.05)', paddingBottom: '14px' }}
                      >
                        Log Batch
                      </button>
                    </div>

                    {/* Waste Panel */}
                    <div style={{ background: '#FEFDFB', padding: '24px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                      <h3 style={{ fontWeight: 700, color: '#b5493f', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        <AlertTriangle size={16}/> Log Quality Loss
                      </h3>
                      <div style={{ marginTop: '16px', marginBottom: '24px' }}>
                        <select 
                          style={{ width: '100%', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '6px', padding: '10px', fontWeight: 700, color: '#23282A', outline: 'none' }} 
                          value={selectedWasteMaterial} 
                          onChange={e => setSelectedWasteMaterial(e.target.value)}
                        >
                          <option value="">Select Material</option>
                          {selectedWo.id.startsWith('WO-EXAM-') ? (
                            inventory.filter(i => i.name.toLowerCase().includes('paper') || i.name.toLowerCase().includes('toner')).map(i => (
                              <option key={i.id} value={i.id}>{i.name}</option>
                            ))
                          ) : (
                            selectedBom?.components.map(c => {
                              const mat = inventory.find(i => i.id === c.materialId);
                              return <option key={c.materialId} value={c.materialId}>{mat?.name}</option>
                            })
                          )}
                        </select>

                        {selectedWo.isConfidential ? (
                          <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', borderRadius: '6px', border: '1.4px solid #e4ddd1', borderColor: '#b5493f' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input type="checkbox" style={{ width: '14px', height: '14px', color: '#b5493f', borderRadius: '6px' }} checked={wasteDestroyed} onChange={e => setWasteDestroyed(e.target.checked)}/>
                              <span style={{ fontWeight: 700, color: '#b5493f', textTransform: 'uppercase' }}>Confirmed Destruction</span>
                            </label>
                            <input 
                              type="text" 
                              placeholder="Cert ID" 
                              style={{ width: '100%', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#b5493f', borderRadius: '6px', paddingLeft: '8px', paddingTop: '6px', fontWeight: 700, paddingRight: '8px', paddingBottom: '6px' }}
                              value={destructionCert}
                              onChange={e => setDestructionCert(e.target.value)}
                            />
                          </div>
                        ) : (
                          <input 
                            type="text" 
                            style={{ width: '100%', background: '#eef7f6', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '6px', padding: '10px', fontWeight: 700, outline: 'none' }} 
                            placeholder="Reason..." 
                            value={noteInput} 
                            onChange={e => setNoteInput(e.target.value)} 
                          />
                        )}
                      </div>
                      <button 
                        onClick={() => handleLog('Log Waste')} 
                        style={{ width: '100%', paddingTop: '14px', background: '#b5493f', color: '#fff', borderRadius: '6px', fontWeight: 700, textTransform: 'uppercase', transition: 'all .15s ease', boxShadow: '0 4px 14px 0 rgba(181,73,63,.05)', paddingBottom: '14px' }}
                      >
                        Log Loss
                      </button>
                    </div>
                  </div>

                  {/* Activity Log */}
                  <div style={{ background: '#FEFDFB', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', overflow: 'hidden' }}>
                    <div style={{ paddingLeft: '20px', paddingTop: '12px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '20px', paddingBottom: '12px' }}>
                      <h3 style={{ fontWeight: 700, color: '#23282A', textTransform: 'uppercase', letterSpacing: '.1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <History size={14} style={{ color: '#5c6567' }} /> Session Activity
                      </h3>
                    </div>
                    <div style={{ overflowY: 'auto', padding: '8px', marginTop: '4px' }}>
                      {selectedWo.logs.slice().reverse().map((log, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '6px', transition: 'color .15s ease,background .15s ease,border-color .15s ease' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              log.action === 'Complete' ? 'bg-emerald-500' : 
                              log.action === 'Start' ? 'bg-blue-500' : 'bg-rose-500'
                            }`} />
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 700, color: '#23282A', textTransform: 'uppercase' }}>{log.action}</span>
                                {log.qtyProcessed && (
                                  <span style={{ fontWeight: 700, color: '#5c6567' }}>
                                    {log.qtyProcessed} units
                                  </span>
                                )}
                              </div>
                              {log.notes && <p style={{ color: '#5c6567', marginTop: '2px' }}>{log.notes}</p>}
                            </div>
                          </div>
                          <span style={{ fontWeight: 500, color: '#5c6567' }}>{format(new Date(log.timestamp), 'HH:mm')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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

export default ShopFloor;
