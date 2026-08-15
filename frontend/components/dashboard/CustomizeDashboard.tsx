import React, { useCallback } from 'react';
import { X, GripVertical, Eye, EyeOff, RotateCcw, Save } from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';

const CustomizeDashboard: React.FC = () => {
  const { widgets, customizeOpen, setCustomizeOpen, toggleWidget, reorderWidgets, resetDefaults } = useDashboardStore();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    reorderWidgets(dragIndex, index);
    setDragIndex(index);
  }, [dragIndex, reorderWidgets]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
  }, []);

  if (!customizeOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setCustomizeOpen(false)}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div><h2 className="text-lg font-bold text-slate-900">Customize Dashboard</h2><p className="text-sm text-slate-500">Show, hide, and reorder dashboard widgets</p></div>
          <button onClick={() => setCustomizeOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-2 max-h-80 overflow-y-auto">
          {widgets.sort((a, b) => a.order - b.order).map((w, i) => (
            <div key={w.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center justify-between p-3 rounded-xl border bg-white transition-all cursor-grab active:cursor-grabbing ${dragIndex === i ? 'border-indigo-400 shadow-md ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-center gap-3">
                <GripVertical size={16} className="text-slate-300 hover:text-slate-500" />
                <span className={`text-sm font-medium ${w.visible ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{w.label}</span>
              </div>
              <button onClick={() => toggleWidget(w.id)}
                className={`p-2 rounded-lg transition-all ${w.visible ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {w.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between p-5 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button onClick={resetDefaults} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-200 transition-all">
            <RotateCcw size={13} /> Reset Defaults
          </button>
          <button onClick={() => setCustomizeOpen(false)}
            className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200 flex items-center gap-2">
            <Save size={15} /> Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomizeDashboard;
