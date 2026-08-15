import React, { useState, useMemo, useEffect } from 'react';
import { CalendarClock, AlertCircle, ChevronLeft, ChevronRight, Clock, GripVertical, Trash2, Lock, Zap } from 'lucide-react';
import { useProduction } from '../../context/ProductionContext';
import { WorkOrder, ResourceAllocation } from '../../types';

const teal={50:'#eef7f6',100:'#d3ece9',200:'#a6d9d3',300:'#72c0b7',400:'#3fa294',500:'#1f8577',600:'#146b60',700:'#0f544c',800:'#0b3e39',900:'#082e2a'};
const amber={100:'#fbead0',300:'#eec27a',500:'#d99a3f',600:'#b97e2b'};
const paper='#FEFDFB',ink='#23282A',inkSoft='#5c6567',hairline='#e4ddd1',danger='#b5493f';

const Scheduler: React.FC = () => {
  const { 
    workOrders = [], 
    workCenters = [], 
    resources = [], 
    allocations = [], 
    allocateResource, 
    moveAllocation, 
    removeAllocation, 
    updateWorkOrderStatus 
  } = useProduction();
  
  // Date Control
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const handleDateChange = (days: number) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + days);
      setCurrentDate(newDate);
  };

  // Timeline Settings
  const startHour = 8; // 8 AM
  const endHour = 18; // 6 PM
  const totalHours = endHour - startHour;
  const pixelsPerHour = 100; // Width of one hour block

  // Drag State
  const [draggedItem, setDraggedItem] = useState<{ type: 'new' | 'existing', id: string, duration?: number } | null>(null);

  // Filter Work Orders
  const activeOrders = useMemo(() => {
      return workOrders.filter(wo => wo.status !== 'Completed' && wo.status !== 'Cancelled');
  }, [workOrders]);

  const unallocatedOrders = useMemo(() => {
      return activeOrders.filter(wo => !allocations.some(a => a.workOrderId === wo.id));
  }, [activeOrders, allocations]);

  // Helpers
  const getPositionFromTime = (timeString: string) => {
      const date = new Date(timeString);
      const hours = date.getHours() + (date.getMinutes() / 60);
      return (hours - startHour) * pixelsPerHour;
  };

  const getTimeFromPosition = (pixels: number) => {
      const hours = (pixels / pixelsPerHour) + startHour;
      const date = new Date(currentDate);
      date.setHours(Math.floor(hours), (hours % 1) * 60, 0, 0);
      return date;
  };

  // Handlers
  const handleDragStart = (e: React.DragEvent, type: 'new' | 'existing', id: string, duration: number = 1) => {
      setDraggedItem({ type, id, duration });
      e.dataTransfer.effectAllowed = 'move';
      // Set ghost image if needed
  };

  const handleDrop = (e: React.DragEvent, resourceId: string) => {
      e.preventDefault();
      if (!draggedItem) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      // Snap to 15 min grid (25px)
      const snappedX = Math.round(x / 25) * 25;
      
      const newStartTime = getTimeFromPosition(snappedX);
      const durationHours = Math.max(1, Math.round((draggedItem.quantityPlanned || 50) / 50));
      const newEndTime = new Date(newStartTime.getTime() + durationHours * 60 * 60 * 1000);

      // Get current WO status — only schedule if currently Draft or In Progress
      const currentWo = workOrders.find(wo => wo.id === draggedItem.id);
      if (!currentWo) return;

      if (draggedItem.type === 'new') {
          // Only update status if transitioning forward
          if (currentWo.status === 'Draft') {
              updateWorkOrderStatus(draggedItem.id, 'Scheduled');
          }
          allocateResource({
              id: `ALLOC-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
              resourceId,
              workOrderId: draggedItem.id,
              startTime: newStartTime.toISOString(),
              endTime: newEndTime.toISOString(),
              status: 'Scheduled'
          } as ResourceAllocation);
      } else {
          moveAllocation(draggedItem.id, newStartTime.toISOString(), newEndTime.toISOString(), resourceId);
      }
      setDraggedItem(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
  };

  return (
    <div style={{ padding: '24px', marginLeft: 'auto', marginTop: '24px', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, marginBottom: '16px' }}>
            <div>
               <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarClock size={18} style={{ color: '#1f8577' }}/> Production Schedule</h1>
               <p style={{ fontSize: '11px', color: '#5c6567', marginTop: '2px' }}>Drag work orders to assign resources</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEFDFB', padding: '4px', borderRadius: '12px', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', boxShadow: '0 1px 2px rgba(0,0,0,.05)' }}>
                <button onClick={() => handleDateChange(-1)} style={{ padding: '6px', borderRadius: '10px', color: '#5c6567' }}><ChevronLeft size={16}/></button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: '#23282A', fontSize: '13px' }}>{currentDate.toLocaleDateString(undefined, { weekday: 'long' })}</div>
                    <div style={{ color: '#5c6567' }}>{currentDate.toLocaleDateString()}</div>
                </div>
                <button onClick={() => handleDateChange(1)} style={{ padding: '6px', borderRadius: '10px', color: '#5c6567' }}><ChevronRight size={16}/></button>
            </div>
        </div>

        <div style={{ flex: 1, display: 'flex', gap: '24px', overflow: 'hidden' }}>
            {/* Unscheduled Queue */}
            <div style={{ width: '256px', background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <div style={{ padding: '12px', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6', borderRadius: '6px' }}>
                    <h3 style={{ fontWeight: 700, color: '#23282A', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em' }}><AlertCircle size={14}/> Queue ({unallocatedOrders.length})</h3>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', marginTop: '12px' }}>
                    {unallocatedOrders.map(wo => (
                        <div 
                            key={wo.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, 'new', wo.id, Math.max(1, wo.quantityPlanned / 50))} // Est duration
                            className={`bg-white border p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-all group
                                ${wo.isConfidential ? 'border-red-200 bg-red-50/50' : 'border-slate-200'}
                            `}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontFamily: '"JetBrains Mono",monospace', color: '#5c6567' }}>{wo.id}</span>
                                    {wo.isConfidential && <Lock size={10} style={{ color: '#b5493f' }}/>}
                                </div>
                                <GripVertical size={12} style={{ color: '#5c6567' }}/>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '11px', color: '#23282A', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {wo.productName}
                            </div>
                            <div style={{ color: '#5c6567', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{wo.quantityPlanned} units</span>
                                <span>Due: {new Date(wo.dueDate).toLocaleDateString(undefined, {month:'short', day:'numeric'})}</span>
                            </div>
                        </div>
                    ))}
                    {unallocatedOrders.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#5c6567', fontSize: '11px', paddingTop: '40px', paddingBottom: '40px' }}>All orders assigned.</div>
                    )}
                </div>
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, background: '#FEFDFB', border: '1.4px solid #e4ddd1', borderColor: '#e4ddd1', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Time Header */}
                <div style={{ display: 'flex', borderStyle: 'solid', borderColor: '#e4ddd1', background: '#eef7f6', height: '40px', flexShrink: 0 }}>
                    <div style={{ width: '192px', borderStyle: 'solid', borderColor: '#e4ddd1', padding: '8px', fontWeight: 700, color: '#23282A', fontSize: '11px', display: 'flex', alignItems: 'center', paddingLeft: '16px' }}>Resource</div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        {Array.from({ length: totalHours }).map((_, i) => (
                            <div 
                                key={i} 
                                style={{ position: 'absolute', borderStyle: 'solid', borderColor: '#e4ddd1', height: '100%', display: 'flex', alignItems: 'center', paddingLeft: '4px', fontWeight: 500, color: '#5c6567', left: i * pixelsPerHour, width: pixelsPerHour }}
                            >
                                {startHour + i}:00
                            </div>
                        ))}
                    </div>
                </div>

                {/* Resource Rows */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {resources.map(res => {
                        // Get allocations for this resource on current date
                        const resAllocations = allocations.filter(a => 
                            a.resourceId === res.id && 
                            new Date(a.startTime).toDateString() === currentDate.toDateString()
                        );

                        return (
                            <div key={res.id} style={{ display: 'flex', borderStyle: 'solid', borderColor: '#e4ddd1', height: '80px' }}>
                                {/* Resource Label */}
                                <div style={{ width: '192px', borderStyle: 'solid', borderColor: '#e4ddd1', padding: '12px', background: '#eef7f6', display: 'flex', flexDirection: 'column', justifyContent: 'center', flexShrink: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '11px', color: '#23282A' }}>{res.name}</div>
                                    <div style={{ color: '#5c6567' }}>{workCenters.find(wc => wc.id === res.workCenterId)?.name}</div>
                                </div>

                                {/* Timeline Track */}
                                <div 
                                    style={{ flex: 1, position: 'relative', background: '#eef7f6' }}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, res.id)}
                                >
                                    {/* Hour Grid Lines */}
                                    {Array.from({ length: totalHours }).map((_, i) => (
                                        <div 
                                            key={i} 
                                            style={{ position: 'absolute', borderStyle: 'solid', borderColor: '#e4ddd1', height: '100%', pointerEvents: 'none', left: i * pixelsPerHour }}
                                        ></div>
                                    ))}

                                    {/* Allocated Blocks */}
                                    {resAllocations.map(alloc => {
                                        const wo = workOrders.find(w => w.id === alloc.workOrderId);
                                        if (!wo) return null;
                                        
                                        const left = getPositionFromTime(alloc.startTime);
                                        const width = (new Date(alloc.endTime).getTime() - new Date(alloc.startTime).getTime()) / (1000 * 60 * 60) * pixelsPerHour;

                                        // Priority Styling
                                        const isUrgent = wo.customerName?.toLowerCase().includes('urgent') || wo.isConfidential; // Mock logic if priority not available on WO directly in this context
                                        
                                        return (
                                            <div
                                                key={alloc.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, 'existing', alloc.id, width/pixelsPerHour)}
                                                className={`absolute top-2 bottom-2 rounded-lg shadow-sm cursor-grab active:cursor-grabbing flex flex-col justify-center px-2 overflow-hidden hover:z-10 group
                                                    ${wo.isConfidential ? 'border-2 border-red-400' : 'border border-white/20'}
                                                `}
                                                style={{ 
                                                    left: Math.max(0, left), 
                                                    width,
                                                    backgroundColor: wo.status === 'In Progress' ? '#3b82f6' : '#8b5cf6',
                                                    color: 'white'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {wo.isConfidential && <Lock size={10} style={{ flexShrink: 0 }}/>}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wo.productName}</span>
                                                </div>
                                                <div style={{ opacity: 0.9, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={8}/> {new Date(alloc.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </div>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); removeAllocation(alloc.id); }}
                                                    style={{ position: 'absolute', top: '4px', right: '4px', opacity: 0.0, padding: '2px', borderRadius: '6px' }}
                                                >
                                                    <Trash2 size={10} color="white"/>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Scheduler;
