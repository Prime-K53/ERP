import React from 'react';
import { ItemizedTable, SummaryBlock } from './ItemizedTables';
import { ExamInvoiceClassSummary } from '../types';
import { Users, BookOpen, GraduationCap, Calendar } from 'lucide-react';

/**
 * Legacy Examination Item (for backward compatibility)
 */
interface ExaminationItem {
  description: string;
  units: string | number;
  rate: number;
  surcharge?: number;
  total: number;
}

/**
 * New Class-Grouped Invoice Props
 */
interface ExaminationInvoiceProps {
  // Legacy props (backward compatible)
  items?: ExaminationItem[];
  subtotal?: number;
  surcharges?: number;
  total?: number;
  tax?: number;
  taxRate?: number;
  currencySymbol?: string;
  examinationTerms?: string;
  candidateInstructions?: string;

  // New class-grouped props
  classBreakdown?: ExamInvoiceClassSummary[];
  academicYear?: string;
  term?: string;
  examType?: string;
  schoolName?: string;
}

/**
 * ExaminationInvoice Component
 * 
 * Specialized for examination billing with two modes:
 * 1. Class-grouped mode (new): Multiple classes per school on one invoice
 * 2. Legacy mode: Simple itemized list
 * 
 * Features:
 * - Per-learner pricing display
 * - Subject breakdown per class
 * - Academic year/term/exam type display
 */
const ExaminationInvoice: React.FC<ExaminationInvoiceProps> = ({
  // Legacy props
  items,
  subtotal,
  surcharges,
  total,
  tax,
  taxRate,
  currencySymbol = '$',
  examinationTerms,
  candidateInstructions,

  // New class-grouped props
  classBreakdown,
  academicYear,
  term,
  examType,
  schoolName
}) => {
  // Determine if using new class-grouped mode
  const useClassGroupedMode = classBreakdown && classBreakdown.length > 0;

  if (useClassGroupedMode) {
    // New Class-Grouped Mode
    return (
      <div className="examination-invoice space-y-8">
        {/* School Name Header */}
        {schoolName && (
          <div className="text-center pb-2 border-b border-slate-100">
            <h2 className="text-[16px] font-black text-slate-800 tracking-tight">{schoolName}</h2>
          </div>
        )}

        {/* Academic Details Header */}
        {(academicYear || term || examType) && (
          <div className="flex flex-wrap items-center gap-4 p-5 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm">
            {academicYear && (
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-indigo-500" />
                <div>
                  <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Academic Year</p>
                  <p className="text-sm font-bold text-indigo-900">{academicYear}</p>
                </div>
              </div>
            )}
            {term && (
              <div className="flex items-center gap-2">
                <GraduationCap size={14} className="text-purple-500" />
                <div>
                  <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Term</p>
                  <p className="text-sm font-bold text-purple-900">{term}</p>
                </div>
              </div>
            )}
            {examType && (
              <div className="ml-auto px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight">{examType}</p>
              </div>
            )}
          </div>
        )}

        {/* Class Breakdown */}
        <div className="space-y-6">
          {classBreakdown.map((cls, index) => (
            <ClassInvoiceCard
              key={index}
              classData={cls}
              currencySymbol={currencySymbol}
              isLast={index === classBreakdown.length - 1}
            />
          ))}
        </div>

        {/* Summary Section */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <div className="space-y-3">
            {/* Total Candidates */}
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-slate-500 font-medium flex items-center gap-2">
                <Users size={14} className="text-slate-400" />
                Total Candidates
              </span>
              <span className="font-bold text-slate-800">
                {classBreakdown.reduce((sum, cls) => sum + cls.totalCandidates, 0).toLocaleString()}
              </span>
            </div>

            {/* Total Classes */}
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-slate-500 font-medium flex items-center gap-2">
                <GraduationCap size={14} className="text-slate-400" />
                Total Classes
              </span>
              <span className="font-bold text-slate-800">{classBreakdown.length}</span>
            </div>

            {/* Total Subjects */}
            <div className="flex justify-between items-center text-[12px]">
              <span className="text-slate-500 font-medium flex items-center gap-2">
                <BookOpen size={14} className="text-slate-400" />
                Total Subjects
              </span>
              <span className="font-bold text-slate-800">
                {classBreakdown.reduce((sum, cls) => sum + cls.subjects.length, 0)}
              </span>
            </div>

            {/* Subtotal - New addition for class grouped mode */}
            <div className="flex justify-between items-center text-[12px] pt-2 border-t border-slate-200 mt-2">
              <span className="text-slate-500 font-medium">Subtotal</span>
              <span className="font-bold text-slate-800">
                {currencySymbol}
                {classBreakdown.reduce((sum, cls) => sum + cls.classTotal, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Tax / VAT */}
            {tax && tax > 0 && (
              <div className="flex justify-between items-center text-[12px]">
                <span className="text-slate-500 font-medium">VAT {taxRate ? `(${taxRate}%)` : ''}</span>
                <span className="font-bold text-slate-800">
                  {currencySymbol}{tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Grand Total */}
            <div className="pt-4 mt-4 border-t-2 border-slate-300 flex justify-between items-center">
              <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">Grand Total</span>
              <span className="text-2xl font-black text-blue-600 tracking-tight">
                {currencySymbol}
                {(classBreakdown.reduce((sum, cls) => sum + cls.classTotal, 0) + (tax || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {examinationTerms && (
            <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50 break-inside-avoid shadow-sm">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                Examination Terms
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
                {examinationTerms}
              </p>
            </div>
          )}

          {candidateInstructions && (
            <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100/50 break-inside-avoid shadow-sm">
              <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                Instructions for Candidates
              </h3>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
                {candidateInstructions}
              </p>
            </div>
          )}

          {/* Default note if no terms/instructions */}
          {!examinationTerms && !candidateInstructions && (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 break-inside-avoid shadow-sm md:col-span-2">
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3">Pricing Note</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                Charges are calculated per learner and include all subjects listed. Extra copies are provided at no additional charge to the customer.
              </p>
            </div>
          )}
        </div>

        <style>{`
          .examination-invoice .itemized-table-container th {
            background-color: #f8fafc;
          }
        `}</style>
      </div>
    );
  }

  // Legacy Mode (backward compatible)
  const columns = [
    {
      header: 'Description',
      accessor: 'description',
      width: '40%',
      wrapSafe: true,
      render: (value, item) => value ?? item?.name ?? item?.itemName ?? 'Item'
    },
    {
      header: 'Units/Quantity',
      accessor: 'units',
      align: 'center' as const,
      width: '15%',
      render: (value, item) => value ?? item?.quantity ?? item?.qty ?? 0
    },
    {
      header: 'Rate',
      accessor: 'rate',
      isCurrency: true,
      align: 'right' as const,
      width: '15%',
      render: (value, item) => value ?? item?.unitPrice ?? item?.price ?? item?.cost ?? 0
    },
    {
      header: 'Surcharge',
      accessor: 'surcharge',
      isCurrency: true,
      align: 'right' as const,
      width: '15%'
    },
    {
      header: 'Total',
      accessor: 'total',
      isCurrency: true,
      align: 'right' as const,
      width: '15%'
    }
  ];

  return (
    <div className="examination-invoice space-y-8">
      {/* Items Table */}
      <ItemizedTable
        columns={columns}
        data={items}
        currencySymbol={currencySymbol}
      />

      {/* Summary Section */}
      <SummaryBlock
        items={[
          { label: 'Subtotal', value: subtotal },
          { label: 'Total Surcharges', value: surcharges },
          ...(tax && tax > 0 ? [{ label: `VAT ${taxRate ? `(${taxRate}%)` : ''}`, value: tax }] : []),
          { label: 'Grand Total', value: total, isGrandTotal: true }
        ]}
        currencySymbol={currencySymbol}
      />

      {/* Special Notes Section */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
        {examinationTerms && (
          <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50 break-inside-avoid shadow-sm">
            <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
              Examination Terms
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
              {examinationTerms}
            </p>
          </div>
        )}

        {candidateInstructions && (
          <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100/50 break-inside-avoid shadow-sm">
            <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              Instructions for Candidate
            </h3>
            <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap font-medium">
              {candidateInstructions}
            </p>
          </div>
        )}
      </div>

      <style>{`
        .examination-invoice .itemized-table-container th {
          background-color: #f1f5f9;
        }
        
        .examination-invoice .summary-block {
          margin-top: 2rem;
        }
      `}</style>
    </div>
  );
};

/**
 * Class Invoice Card Component
 * Displays a single class with its subjects and pricing
 */
interface ClassInvoiceCardProps {
  classData: ExamInvoiceClassSummary;
  currencySymbol: string;
  isLast: boolean;
}

const ClassInvoiceCard: React.FC<ClassInvoiceCardProps> = ({
  classData,
  currencySymbol,
  isLast
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm ${!isLast ? 'mb-4' : ''}`}>
      {/* Class Header */}
      <div className="p-5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <GraduationCap size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-[14px] font-black text-slate-900">{classData.className}</h3>
              <p className="text-[10px] text-slate-500 font-medium">
                {classData.subjects.length} subject{classData.subjects.length !== 1 ? 's' : ''} included
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Class Total</p>
            <p className="text-lg font-black text-blue-600">
              {currencySymbol}{classData.classTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {/* Class Details */}
      <div className="p-5">
        {/* Subjects List */}
        <div className="mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Subjects</p>
          <div className="flex flex-wrap gap-2">
            {classData.subjects.map((subject, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-bold border border-slate-200"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>

        {/* Pricing Breakdown */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Candidates</p>
            <p className="text-sm font-bold text-slate-800">{classData.totalCandidates.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Charge per Learner</p>
            <p className="text-sm font-bold text-slate-800">
              {currencySymbol}{classData.chargePerLearner.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Calculation Note */}
        <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
          <p className="text-[10px] text-blue-700 font-medium">
            <span className="font-bold">Calculation:</span> {classData.totalCandidates} learners × {currencySymbol}{classData.chargePerLearner.toLocaleString()} = {currencySymbol}{classData.classTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExaminationInvoice;
