import React from 'react';
import { Wallet, Info } from 'lucide-react';

interface ReceiptNarrativeProps {
  customerName: string;
  amount: number;
  invoiceNumbers: string[];
  remainingBalance: number;
  overpaymentAmount?: number;
  currencySymbol?: string;
  paymentMethod?: string;
}

/**
 * ReceiptNarrative Component
 * Replaces the standard item table with a professional narrative paragraph.
 * Handles overpayment logic by displaying a wallet credit alert.
 */
const ReceiptNarrative: React.FC<ReceiptNarrativeProps> = ({
  customerName,
  amount,
  invoiceNumbers,
  remainingBalance,
  overpaymentAmount = 0,
  currencySymbol = '$',
  paymentMethod = 'Auto'
}) => {
  const formattedAmount = `${currencySymbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const formattedBalance = `${currencySymbol}${remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const formattedOverpayment = `${currencySymbol}${overpaymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  
  const invoiceList = invoiceNumbers.length > 0 
    ? invoiceNumbers.join(', ') 
    : 'unallocated invoices';

  return (
    <div className="receipt-narrative space-y-8 py-4 flex flex-col flex-1">
      {/* Narrative Paragraph */}
      <div className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/20"></div>
        <p className="text-slate-700 font-medium" style={{ fontSize: '11pt', lineHeight: '1.8' }}>
          Received with thanks from <span className="text-slate-900 font-bold underline decoration-blue-500/30 decoration-2 underline-offset-4">{customerName}</span> the sum of <span className="text-blue-600 font-black">{formattedAmount}</span> for payment of <span className="text-slate-900 font-bold italic">{invoiceList}</span>. 
          Payment method: <span className="text-slate-900 font-bold">{paymentMethod}</span>. 
          Remaining due balance is <span className="text-slate-900 font-bold">{formattedBalance}</span>.
        </p>
      </div>

      {/* Overpayment / Wallet Alert */}
      {overpaymentAmount > 0 && (
        <div className="wallet-credit-alert animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-4 p-5 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">Overpayment Detected</p>
              <p className="text-sm text-emerald-700 leading-snug">
                <span className="font-bold">{formattedOverpayment}</span> has been credited to the customer wallet for future use.
              </p>
            </div>
            <div className="ml-auto text-emerald-300">
              <Info size={16} />
            </div>
          </div>
        </div>
      )}

      {/* Signature Section for Receipts - Pushed to bottom */}
      <div className="signature-line mt-auto pt-16 flex justify-end" style={{ breakInside: 'avoid' }}>
        <div className="text-center" style={{ width: '40mm' }}>
          <div className="h-[1px] bg-slate-400 w-full mb-2"></div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
};

export default ReceiptNarrative;
