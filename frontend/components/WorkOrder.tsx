import React from 'react';
import { ItemizedTable } from './ItemizedTables';
import { ClipboardList, UserCheck, HardHat } from 'lucide-react';

interface ResourceItem {
  description: string;
  quantity: string | number;
  unit: string;
}

interface WorkOrderProps {
  resources: ResourceItem[];
  workDescription: string;
  assignedTechnician: string;
  location: string;
  scheduledDate: string;
}

/**
 * WorkOrder Component
 * Focused on field operations and resource tracking.
 * Removes financial columns and adds dedicated signature areas and manual entry space.
 */
const WorkOrder: React.FC<WorkOrderProps> = ({
  resources,
  workDescription,
  assignedTechnician,
  location,
  scheduledDate
}) => {
  const columns = [
    { header: 'Resource / Part Description', accessor: 'description', width: '70%', wrapSafe: true },
    { header: 'Qty', accessor: 'quantity', align: 'center' as const, width: '15%' },
    { header: 'Unit', accessor: 'unit', align: 'center' as const, width: '15%' }
  ];

  return (
    <div className="work-order space-y-8">
      {/* Job Details Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Technician</p>
          <div className="flex items-center gap-2 text-slate-700">
            <HardHat size={14} className="text-orange-500" />
            <span className="text-sm font-bold">{assignedTechnician}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</p>
          <div className="text-sm font-bold text-slate-800">{location}</div>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scheduled Date</p>
          <div className="text-sm font-bold text-slate-800">{scheduledDate}</div>
        </div>
      </div>

      {/* Large Work Description Box */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <ClipboardList size={14} className="text-blue-500" />
          Work Description & Scope
        </h3>
        <div className="w-full min-h-[150px] p-6 bg-white border-2 border-slate-100 rounded-2xl text-xs text-slate-600 leading-relaxed shadow-inner whitespace-pre-wrap font-medium">
          {workDescription || "No specific instructions provided. Please document field notes here."}
        </div>
      </div>

      {/* Resources / Parts Table */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Resources & Materials Used</h3>
        <ItemizedTable 
          columns={columns} 
          data={resources} 
        />
      </div>

      {/* Manual Notes Area (White Space for Staff) */}
      <div className="space-y-3 pt-4">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Field Completion Notes</h3>
        <div className="w-full h-32 border border-dashed border-slate-300 rounded-xl bg-slate-50/30"></div>
      </div>

      {/* Signature Section */}
      <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-slate-100">
        {/* Customer Acceptance */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <UserCheck size={16} className="text-emerald-500" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Customer Acceptance</span>
          </div>
          <div className="space-y-4">
            <div className="w-full border-b border-dashed border-slate-400 h-12"></div>
            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
              <span>Print Name</span>
              <span>Date</span>
            </div>
          </div>
        </div>

        {/* Technician Signature */}
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <HardHat size={16} className="text-blue-500" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Technician Signature</span>
          </div>
          <div className="space-y-4">
            <div className="w-full border-b border-dashed border-slate-400 h-12"></div>
            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
              <span>Employee ID</span>
              <span>Completion Time</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .work-order .itemized-table-container th {
          background-color: #f8fafc;
        }
        @media print {
          .work-order {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default WorkOrder;
