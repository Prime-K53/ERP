import React, { useState } from 'react';
import { Briefcase, DollarSign, Clock, UserPlus, Trash2, Edit2, FileText, Save, X, Eye, Calculator, AlertTriangle } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { Employee, PayrollRun, Payslip } from '../../types';

const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const teal = { 50: '#eef7f6', 100: '#d4ebe3', 200: '#a6d9d3', 400: '#3fa294', 500: '#2d9a8a', 600: '#1f8577', 700: '#166b5e', 800: '#0f544c', 900: '#0a3d34' };
const amber = { 50: '#fef9e7', 100: '#fef3c7', 200: '#fde68a', 400: '#d99a3f', 500: '#d99a3f', 600: '#b45309', 700: '#92400e', 800: '#78350f', 900: '#451a03' };
const danger = { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 400: '#dc2626', 500: '#b5493f', 600: '#991b1b', 700: '#7f1d1d', 800: '#450a0a', 900: '#1a0505' };
const emerald = { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 400: '#16a34a', 500: '#16a34a', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b' };

interface DeductionBreakdown {
  tax: number;
  socialSecurity: number;
  pension: number;
  healthInsurance: number;
  loanRepayment: number;
  other: number;
}

const Payroll: React.FC = () => {
  const { employees, payrollRuns, payslips, addEmployee, updateEmployee, deleteEmployee, runPayroll } = useFinance();
  const { companyConfig, notify } = useAuth();
  const currency = companyConfig?.currencySymbol || '$';

  const [activeTab, setActiveTab] = useState<'Run' | 'Employees' | 'History'>('Run');

  // Employee Modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Partial<Employee>>({ basicSalary: 0, status: 'Active' });

  // Payslip List Modal
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const runPayslips = selectedRun ? payslips.filter(p => p.payrollRunId === selectedRun.id) : [];

  // Payslip Detail Modal
  const [showPayslipDetail, setShowPayslipDetail] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  // Run Payroll State
  const [runMonth, setRunMonth] = useState(new Date().toISOString().slice(0, 7));
  const [runDate, setRunDate] = useState(new Date().toISOString().split('T')[0]);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Per-employee deduction overrides
  const [deductionOverrides, setDeductionOverrides] = useState<Record<string, Partial<DeductionBreakdown>>>({});

  const activeEmployees = employees.filter(e => e.status === 'Active');

  const defaultDeductionRate = (rate: number) => rate;

  const calculateEmployeeDeductions = (emp: Employee, overrides?: Partial<DeductionBreakdown>): DeductionBreakdown => {
    const salary = emp.basicSalary || 0;
    const over = overrides || {};
    return {
      tax: over.tax ?? Math.round(salary * 0.1),
      socialSecurity: over.socialSecurity ?? Math.round(salary * 0.05),
      pension: over.pension ?? Math.round(salary * 0.05),
      healthInsurance: over.healthInsurance ?? Math.round(salary * 0.03),
      loanRepayment: over.loanRepayment ?? 0,
      other: over.other ?? 0,
    };
  };

  const totalDeductions = (d: DeductionBreakdown) => d.tax + d.socialSecurity + d.pension + d.healthInsurance + d.loanRepayment + d.other;

  const calculateNetPay = (emp: Employee, overrides?: Partial<DeductionBreakdown>) => {
    const salary = emp.basicSalary || 0;
    const deductions = calculateEmployeeDeductions(emp, overrides);
    return Math.max(0, salary - totalDeductions(deductions));
  };

  const estTotalPayroll = activeEmployees.reduce((sum, e) => sum + e.basicSalary, 0);
  const estTotalDeductions = activeEmployees.reduce((sum, e) => sum + totalDeductions(calculateEmployeeDeductions(e, deductionOverrides[e.id])), 0);
  const estNetPay = estTotalPayroll - estTotalDeductions;

  const handleSaveEmployee = (e: React.FormEvent) => {
      e.preventDefault();
      if (!editEmp.name) return;

      const empData = {
          ...editEmp,
          id: editEmp.id || '',
          joinDate: editEmp.joinDate || new Date().toISOString().split('T')[0],
          basicSalary: Number(editEmp.basicSalary) || 0
      } as Employee;

      if (empData.basicSalary <= 0) {
          notify?.('Salary must be greater than zero.', 'error');
          return;
      }

      if (empData.id) updateEmployee(empData);
      else addEmployee(empData);

      setShowEmpModal(false);
  };

  const handleRunPayroll = () => {
      if (activeEmployees.length === 0) {
          notify?.("No active employees to pay.", 'error');
          return;
      }
      const normalizedMonth = runMonth.replace(/^(\d{4})-0?(\d{1,2})$/, '$1-$2');
      if (payrollRuns.some(r => r.month.replace(/^(\d{4})-0?(\d{1,2})$/, '$1-$2') === normalizedMonth)) {
          notify?.("Payroll already run for this month.", 'error');
          return;
      }

      setConfirmDialog({
          message: `Confirm Payroll Run for ${runMonth}?\nTotal Basic: ${currency}${estTotalPayroll.toLocaleString()}\nTotal Deductions: ${currency}${estTotalDeductions.toLocaleString()}\nNet Pay: ${currency}${estNetPay.toLocaleString()}`,
          onConfirm: () => {
              runPayroll(runMonth, runDate, activeEmployees);
              setActiveTab('History');
              setConfirmDialog(null);
          }
      });
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col" style={{ background: paper }}>

        {/* Employee Modal */}
        {showEmpModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn flex">
                    <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
                    <div className="flex-1">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                                    <UserPlus size={18} color="#fff" />
                                </div>
                                <div>
                                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                                        {editEmp.id ? 'Edit Employee' : 'New Employee'}
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Payroll Engine</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEmpModal(false)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveEmployee} className="p-6 space-y-4">
                        <div>
                            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Full Name</label>
                            <input className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                value={editEmp.name || ''} onChange={e => setEditEmp({...editEmp, name: e.target.value})} required
                                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Role / Title</label>
                                <input className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                    value={editEmp.role || ''} onChange={e => setEditEmp({...editEmp, role: e.target.value})} required
                                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Join Date</label>
                                <input type="date" className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                    value={editEmp.joinDate || ''} onChange={e => setEditEmp({...editEmp, joinDate: e.target.value})}
                                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Basic Salary ({currency})</label>
                                <input type="number" min="1" className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit', fontWeight: 700 }}
                                    value={editEmp.basicSalary} onChange={e => setEditEmp({...editEmp, basicSalary: parseFloat(e.target.value)})}
                                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Status</label>
                                <select className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                    value={editEmp.status} onChange={e => setEditEmp({...editEmp, status: e.target.value})}
                                    onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                    onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                                >
                                    <option>Active</option>
                                    <option>Leave</option>
                                    <option>Terminated</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.06, textTransform: 'uppercase', color: '#5c6567', marginBottom: 5, display: 'block' }}>Bank Details (Optional)</label>
                            <input className="w-full mb-2" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                placeholder="Bank Name" value={editEmp.bankDetails?.bankName || ''} onChange={e => setEditEmp({...editEmp, bankDetails: { ...editEmp.bankDetails!, bankName: e.target.value }})}
                                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                            />
                            <input className="w-full" style={{ padding: '8px 10px', border: '1.4px solid #e4ddd1', borderRadius: 7, fontSize: 13, color: '#23282A', background: '#FEFDFB', outline: 'none', fontFamily: 'inherit' }}
                                placeholder="Account Number" value={editEmp.bankDetails?.accountNumber || ''} onChange={e => setEditEmp({...editEmp, bankDetails: { ...editEmp.bankDetails!, accountNumber: e.target.value }})}
                                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = '#eef7f6'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e4ddd1'; e.currentTarget.style.background = '#FEFDFB'; }}
                            />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: 'linear-gradient(155deg, #1f8577, #0f544c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                        >
                            <Save size={18}/> Save Record
                        </button>
                    </form>
                </div>
            </div>
            </div>
        )}

        {/* Payslip List Modal */}
        {showPayslipModal && selectedRun && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fadeIn flex">
                    <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
                    <div className="flex-1">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                                    <FileText size={18} color="#fff" />
                                </div>
                                <div>
                                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                                        Payslips for {selectedRun.month}
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Run ID: {selectedRun.id} | Net: {currency}{selectedRun.totalNetPay?.toLocaleString()}</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPayslipModal(false)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white text-slate-500 border-b border-slate-100 sticky top-0 text-xs font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="p-4">Employee</th>
                                    <th className="p-4 text-right">Basic</th>
                                    <th className="p-4 text-right">Deductions</th>
                                    <th className="p-4 text-right">Net Pay</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {runPayslips.map(ps => (
                                    <tr key={ps.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-medium text-slate-900">{ps.employeeName}</td>
                                        <td className="p-4 text-right text-slate-600">{currency}{ps.basicSalary?.toLocaleString()}</td>
                                        <td className="p-4 text-right text-red-600">-{currency}{(ps.deductions || 0).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold text-emerald-600">{currency}{ps.netPay?.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => { setSelectedPayslip(ps); setShowPayslipDetail(true); }}
                                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
                                                title="View Payslip Details"
                                            >
                                                <Eye size={14}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                        <button onClick={() => setShowPayslipModal(false)} style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: '#FEFDFB', border: '1.4px solid #e4ddd1', color: '#5c6567', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
            </div>
        )}

        {/* Payslip Detail Modal */}
        {showPayslipDetail && selectedPayslip && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn flex">
                    <div style={{ width: 4, background: 'linear-gradient(180deg, #1f8577, #0f544c)', flexShrink: 0 }} />
                    <div className="flex-1">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(155deg, #1f8577, #0f544c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px -3px rgba(15,84,76,.4)' }}>
                                    <FileText size={18} color="#fff" />
                                </div>
                                <div>
                                    <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: '#0b3e39', letterSpacing: 0.2 }}>
                                        Payslip Details
                                    </h2>
                                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#5c6567', letterSpacing: 0.02 }}>Payroll Engine</p>
                                </div>
                            </div>
                            <button onClick={() => setShowPayslipDetail(false)} style={{ padding: '6px', borderRadius: 8, border: '1.4px solid #e4ddd1', background: '#FEFDFB', color: '#5c6567', cursor: 'pointer', transition: 'all .15s ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#eef7f6'; e.currentTarget.style.color = '#0f544c'; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = '#FEFDFB'; e.currentTarget.style.color = '#5c6567'; e.currentTarget.style.borderColor = '#e4ddd1'; }}
                            >
                                <X size={15} />
                            </button>
                        </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <p className="text-sm text-slate-500">Employee</p>
                            <p className="font-bold text-slate-900">{selectedPayslip.employeeName}</p>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Period</p>
                            <p className="font-medium">{selectedPayslip.date}</p>
                        </div>
                        <div className="border-t border-slate-200 pt-4 space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Basic Salary</span>
                                <span className="font-medium">{currency}{selectedPayslip.basicSalary?.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Allowances</span>
                                <span className="font-medium text-emerald-600">+{currency}{(selectedPayslip.allowances || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Deductions</span>
                                <span className="font-medium text-red-600">-{currency}{(selectedPayslip.deductions || 0).toLocaleString()}</span>
                            </div>
                            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-base">
                                <span>Net Pay</span>
                                <span className="text-emerald-600">{currency}{selectedPayslip.netPay?.toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-400">
                            Status: <span className="font-medium text-emerald-600">{selectedPayslip.status}</span>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        )}

<div className="flex justify-between items-center mb-6 shrink-0" style={{ borderBottom: `1.4px solid ${hairline}`, paddingBottom: 16 }}>
            <div>
              <h1 className="flex items-center gap-2" style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 28, color: ink, letterSpacing: 0.2 }}>
                <Briefcase style={{ color: teal[600] }} size={28} /> Payroll Management
              </h1>
              <p className="text-sm mt-0.5" style={{ color: inkSoft }}>Employee salaries, deductions, and payslips.</p>
            </div>
            <div className="flex p-1 rounded-lg" style={{ background: '#f1f5f9', border: `1.4px solid ${hairline}` }}>
              {['Run', 'Employees', 'History'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent',
                    background: activeTab === tab ? paper : 'transparent', color: activeTab === tab ? teal[700] : inkSoft,
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all .15s ease',
                    boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                  }}
                  onMouseEnter={e => { if (activeTab !== tab) { e.currentTarget.style.background = '#fafbfb'; } }}
                  onMouseLeave={e => { if (activeTab !== tab) { e.currentTarget.style.background = 'transparent'; } }}
                >
                  {tab === 'Run' ? 'Process Payroll' : tab}
                </button>
              ))}
            </div>
          </div>

        {activeTab === 'Run' && (
            <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden">
                <div className="md:w-1/3 rounded-[14px] border p-6 h-fit" style={{ background: paper, borderColor: hairline, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-sm" style={{ color: ink }}><Clock size={16}/> Run Configuration</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1" style={{ color: inkSoft, fontSize: 9, letterSpacing: '0.06em' }}>Select Month</label>
                            <input type="month" className="w-full p-2 border rounded-lg text-sm" style={{ borderColor: hairline, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                                value={runMonth} onChange={e => setRunMonth(e.target.value)}
                                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase mb-1" style={{ color: inkSoft, fontSize: 9, letterSpacing: '0.06em' }}>Payment Date</label>
                            <input type="date" className="w-full p-2 border rounded-lg text-sm" style={{ borderColor: hairline, borderRadius: 9, background: paper, color: ink, outline: 'none', fontFamily: 'inherit', fontSize: 13 }}
                                value={runDate} onChange={e => setRunDate(e.target.value)}
                                onFocus={e => { e.currentTarget.style.borderColor = '#3fa294'; e.currentTarget.style.background = teal[50]; }}
                                onBlur={e => { e.currentTarget.style.borderColor = hairline; e.currentTarget.style.background = paper; }}
                            />
                        </div>
                        <div className="p-4 rounded-lg border space-y-2" style={{ backgroundColor: teal[50], borderColor: teal[100] }}>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: inkSoft }}>Active Employees</span>
                                <span className="font-bold" style={{ color: ink }}>{activeEmployees.length}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: inkSoft }}>Basic Total</span>
                                <span className="font-bold" style={{ color: ink }}>{currency}{estTotalPayroll.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span style={{ color: inkSoft }}>Est. Deductions</span>
                                <span className="font-bold" style={{ color: danger[500] }}>-{currency}{estTotalDeductions.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm border-t pt-2" style={{ borderColor: teal[100] }}>
                                <span className="font-bold" style={{ color: ink }}>Est. Net Pay</span>
                                <span className="font-bold" style={{ color: emerald[500] }}>{currency}{estNetPay.toLocaleString()}</span>
                            </div>
                        </div>
                        <button onClick={handleRunPayroll} style={{ width: '100%', padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                        >
                            <DollarSign size={16}/> Process Payroll
                        </button>
                    </div>
                </div>

                <div className="flex-1 rounded-[14px] border overflow-hidden flex flex-col" style={{ background: paper, borderColor: hairline, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="p-4 border-b bg-teal-50" style={{ borderColor: hairline }}>
                        <h3 className="font-bold text-sm" style={{ color: ink }}><Calculator size={14} className="inline mr-1"/> Eligible Employees</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: paper, color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                                <tr>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4 text-right">Basic</th>
                                    <th className="p-4 text-right">Deductions</th>
                                    <th className="p-4 text-right">Net</th>
                                    <th className="p-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: hairline }}>
                                {activeEmployees.map(emp => {
                                    const ded = calculateEmployeeDeductions(emp, deductionOverrides[emp.id]);
                                    const net = calculateNetPay(emp, deductionOverrides[emp.id]);
                                    return (
                                        <tr key={emp.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
<td className="p-4 font-medium" style={{ color: ink }}>{emp.name}</td>
                                        <td className="p-4" style={{ color: inkSoft }}>{emp.role}</td>
                                        <td className="p-4 text-right font-mono" style={{ color: ink }}>{currency}{emp.basicSalary?.toLocaleString()}</td>
                                        <td className="p-4 text-right text-red-600 font-mono">-{currency}{totalDeductions(ded).toLocaleString()}</td>
                                        <td className="p-4 text-right font-bold font-mono" style={{ color: emerald[500] }}>{currency}{net.toLocaleString()}</td>
                                        <td className="p-4 text-center"><span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: emerald[50], color: emerald[600] }}>Ready</span></td>
                                    </tr>
                                )})}
                                {activeEmployees.length === 0 && <tr><td colSpan={6} className="p-8 text-center" style={{ color: inkSoft }}>No active employees found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'Employees' && (
<div className="flex-1 rounded-[14px] border overflow-hidden flex flex-col" style={{ background: paper, borderColor: hairline, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: hairline, background: teal[50] }}>
                        <h3 className="font-bold text-sm" style={{ color: ink }}>Staff Directory</h3>
                        <button onClick={() => { setEditEmp({basicSalary: 0, status: 'Active'}); setShowEmpModal(true); }} style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                        >
                            <UserPlus size={14}/> Add Employee
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: paper, color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                                <tr>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4">Join Date</th>
                                    <th className="p-4 text-right">Salary</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: hairline }}>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
<td className="p-4 font-medium" style={{ color: ink }}>{emp.name}</td>
                                        <td className="p-4" style={{ color: inkSoft }}>{emp.role}</td>
                                        <td className="p-4" style={{ color: inkSoft }}>{new Date(emp.joinDate).toLocaleDateString()}</td>
                                        <td className="p-4 text-right font-mono" style={{ color: ink }}>{currency}{emp.basicSalary?.toLocaleString()}</td>
                                        <td className="p-4 text-center">
                                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: emp.status === 'Active' ? emerald[50] : '#f1f5f9', color: emp.status === 'Active' ? emerald[600] : inkSoft }}>{emp.status}</span>
                                        </td>
                                        <td className="p-4 text-right flex justify-end gap-2">
                                            <button onClick={() => { setEditEmp(emp); setShowEmpModal(true); }} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"><Edit2 size={16}/></button>
                                            <button onClick={() => deleteEmployee(emp.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
        )}

        {activeTab === 'History' && (
<div className="flex-1 rounded-[14px] border overflow-hidden flex flex-col" style={{ background: paper, borderColor: hairline, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="p-4 border-b" style={{ borderColor: hairline, background: teal[50] }}>
                        <h3 className="font-bold text-sm" style={{ color: ink }}>Payroll Runs</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: paper, color: inkSoft, borderBottom: `1.4px solid ${hairline}` }}>
                                <tr>
                                    <th className="p-4">Month</th>
                                    <th className="p-4">Date</th>
                                    <th className="p-4 text-center">Employees</th>
                                    <th className="p-4 text-right">Basic</th>
                                    <th className="p-4 text-right">Deductions</th>
                                    <th className="p-4 text-right">Net Pay</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y" style={{ borderColor: hairline }}>
                                {payrollRuns.slice().reverse().map(run => (
                                    <tr key={run.id} className="hover:bg-teal-50 transition-colors" style={{ borderColor: hairline }}>
<td className="p-4 font-bold" style={{ color: ink }}>{run.month}</td>
                                    <td className="p-4" style={{ color: inkSoft }}>{new Date(run.date).toLocaleDateString()}</td>
                                    <td className="p-4 text-center" style={{ color: ink }}>{run.employeeCount}</td>
                                    <td className="p-4 text-right font-mono" style={{ color: inkSoft }}>{currency}{run.totalBasic?.toLocaleString()}</td>
                                    <td className="p-4 text-right font-mono text-red-600">-{currency}{(run.totalDeductions || 0).toLocaleString()}</td>
                                    <td className="p-4 text-right font-bold" style={{ color: emerald[500] }}>{currency}{run.totalNetPay?.toLocaleString()}</td>
                                    <td className="p-4 text-center"><span className="px-2 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: emerald[50], color: emerald[600] }}>Paid</span></td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => { setSelectedRun(run); setShowPayslipModal(true); }}
                                            className="text-teal-600 hover:underline flex items-center gap-1 justify-end text-xs font-bold"
                                        >
                                            <FileText size={14}/> Payslips
                                        </button>
                                    </td>
                                    </tr>
                                ))}
                            {payrollRuns.length === 0 && <tr><td colSpan={8} className="p-8 text-center" style={{ color: inkSoft }}>No payroll history available.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
        )}

        {/* Confirm Dialog */}
        {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-[14px] shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn flex" style={{ border: `1.4px solid ${hairline}` }}>
                    <div style={{ width: 4, background: `linear-gradient(180deg, ${teal[600]}, ${teal[800]})`, flexShrink: 0 }} />
                    <div className="flex-1">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: amber[50], border: `1.4px solid ${amber[100]}` }}>
                                <AlertTriangle size={32} style={{ color: amber[500] }} />
                            </div>
                            <h3 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontWeight: 400, fontSize: 20, margin: 0, color: ink, letterSpacing: 0.2 }}>Confirm Payroll Run</h3>
                            <p className="text-sm whitespace-pre-line" style={{ color: inkSoft }}>{confirmDialog.message}</p>
                        </div>
                        <div className="p-4 border-t flex justify-end gap-3" style={{ borderColor: hairline, backgroundColor: '#fafbfb' }}>
                            <button
                                onClick={() => setConfirmDialog(null)}
                                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', background: paper, border: `1.4px solid ${hairline}`, color: inkSoft, display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                                onMouseEnter={e => { e.currentTarget.style.background = teal[50]; e.currentTarget.style.borderColor = '#a6d9d3'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = paper; e.currentTarget.style.borderColor = hairline; }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDialog.onConfirm}
                                style={{ padding: '9px 18px', borderRadius: 9, cursor: 'pointer', border: '1.4px solid transparent', background: `linear-gradient(155deg, ${teal[600]}, ${teal[800]})`, color: '#fff', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 6px 16px -6px rgba(15,84,76,.55)', transition: 'all .15s ease', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px -6px rgba(15,84,76,.65)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 16px -6px rgba(15,84,76,.55)'; }}
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default Payroll;
