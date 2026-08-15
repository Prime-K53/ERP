
import React from 'react';
import { ArrowRight, Calculator, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';

export const AuditorBridge: React.FC<{ drift: number, physical: number, ledger: number }> = ({ drift, physical, ledger }) => {
    const { companyConfig, notify } = useAuth();
    const { postJournalEntry } = useFinance();
    const currency = companyConfig.currencySymbol;

    const handleFixDrift = async () => {
        const safeDrift = drift || 0;
        if (Math.abs(safeDrift) < 0.01) return;

        const isLedgerHigh = safeDrift > 0;
        const amount = Math.abs(safeDrift);

        // Use system mapping for Inventory Asset and Other Income/Loss
        const gl = companyConfig?.glMapping || {};
        const invAssetAcc = gl.defaultInventoryAccount || '1200';
        const correctionAcc = isLedgerHigh
            ? '6100' // Generic Maintenance/Expense if ledger too high
            : gl.otherIncomeAccount || '4900'; // Other Income if ledger too low (found stock)

        const entries = [{
            description: `Logical drift correction: Inventory vs Ledger audit`,
            debitAccountId: isLedgerHigh ? correctionAcc : invAssetAcc,
            creditAccountId: isLedgerHigh ? invAssetAcc : correctionAcc,
            amount: amount,
            referenceId: `AUDIT-SYNC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            reconciled: true
        }];

        await postJournalEntry(entries);
        notify("Accounting ledger reconciled with physical master list.", "success");
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 rounded-xl">
                        <Calculator size={24} className="text-blue-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm">Logical Reconciliation</h3>
                        <p className="text-xs text-slate-500">
                            Detected variance: <span className="font-bold text-slate-700">{currency}{(drift || 0).toLocaleString()}</span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {Math.abs(drift || 0) > 500 && (
                        <div className="flex items-center gap-1 text-rose-500 text-xs font-semibold">
                            <AlertTriangle size={14} /> High variance
                        </div>
                    )}
                    <button
                        onClick={handleFixDrift}
                        disabled={Math.abs(drift || 0) < 0.01}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg font-semibold text-sm transition-all flex items-center gap-2"
                    >
                        <ArrowRight size={14} />
                        Sync Ledger
                    </button>
                </div>
            </div>
        </div>
    );
};
