import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { StatementDoc } from './schemas.ts';
import { docStyles as s } from './styles.ts';
import { CompanyConfig } from '../../../../types.ts';
import { resolvePdfLogoSource } from '../../../../utils/companyAssetUtils.ts';
import {
  getStoredCompanyConfig,
  resolvePrimeTemplateSettings,
} from './templateSettings.ts';
import { resolvePdfQrCodeSource } from '../../../../utils/companyAssetUtils.ts';

// Format amount helper
const formatAmount = (amount: number) => {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const StatementSummaryTemplate: React.FC<{ data: StatementDoc; configOverride?: CompanyConfig | null }> = ({ data, configOverride = null }) => {
  const currency = data.currency || 'MWK';
  const config = configOverride || getStoredCompanyConfig();
  const templateSettings = resolvePrimeTemplateSettings(config);
  const pageStyle = {
    fontFamily: templateSettings.fontFamily,
    fontSize: templateSettings.bodyFontSize,
  };
  const companyName = config?.companyName || 'PRIME PRINTING INC';
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const fontScale = templateSettings.bodyFontSize / 12;

  const isCancelled =
    String(data.status || (data as any).transactionStatus || '').toLowerCase() === 'cancelled' ||
    String(data.status || (data as any).transactionStatus || '').toLowerCase() === 'canceled' ||
    (data as any).isCancelled === true ||
    (data as any).cancelled === true;

  return (
    <Document
      title={`Statement - ${data.customerName}`}
      author="Prime ERP"
      subject="Account Statement Summary"
      creator="Prime ERP System"
    >
      <Page size="A4" style={[s.page, pageStyle]}>
        {isCancelled && (
          <View style={s.watermarkContainer} fixed>
            <Text style={s.watermarkText}>CANCELLED</Text>
          </View>
        )}
        {/* Conversion History for Statement (if applicable) */}
        {'isConverted' in data && !!(data as any).isConverted && !!(data as any).conversionDetails && (
          <View style={[s.conversionBox, { position: 'absolute', top: 40, right: 40, zIndex: 10 }]}>
            <Text style={s.conversionTitle}>Conversion History</Text>
            <Text>Converted from {(data as any).conversionDetails.sourceType} {(data as any).conversionDetails.sourceNumber}</Text>
            <Text>on {(data as any).conversionDetails.date}</Text>
          </View>
        )}
        {/* Header Section */}
        <View style={s.headerContainer}>
          {/* Left: Company logo/address aligned from the left */}
          <View style={s.companySide}>
            {logo ? (
              <Image src={logo} style={{ marginBottom: 6, width: templateSettings.logoWidth }} />
            ) : (
              <Text style={{ fontSize: templateSettings.companyNameFontSize, fontWeight: 'bold', color: '#1e293b', marginBottom: 2 }}>{companyName}</Text>
            )}
            <View style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 8, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>Generated on: {new Date().toLocaleString('en-GB')}</Text>
            </View>
          </View>

          {/* Right: Statement Title and Balance Summary Table */}
          <View style={s.statementSide}>
            <Text style={[s.title, { fontSize: 24, marginBottom: 2 }]}>Account Statement</Text>
            <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>{data.startDate} — {data.endDate}</Text>

            <View style={s.summaryTable}>
              <View style={s.summaryRow}>
                <Text style={{ fontWeight: 'bold', color: '#475569' }}>Opening Balance</Text>
                <Text style={{ fontWeight: 'bold' }}>{currency} {formatAmount(data.openingBalance)}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={{ color: '#475569' }}>Invoiced Amount</Text>
                <Text>{currency} {formatAmount(data.totalInvoiced)}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={{ color: '#475569' }}>Amount Received</Text>
                <Text>{currency} {formatAmount(data.totalReceived)}</Text>
              </View>
              <View style={[s.summaryRow, { borderBottomWidth: 0, marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' }]}>
                <Text style={{ fontWeight: 'bold', color: '#1e293b' }}>Balance Due</Text>
                <Text style={{ fontWeight: 'bold', fontSize: 13, color: '#2563eb' }}>{currency} {formatAmount(data.finalBalance)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Customer "To" Section */}
        <View style={{ marginTop: 1.5, paddingLeft: 5, borderLeftWidth: 3, borderLeftColor: '#2563eb', paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Statement For</Text>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1e293b' }}>{data.customerName}</Text>
          {'address' in data && !!(data as any).address && (
            <Text style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{(data as any).address}</Text>
          )}
        </View>

        {/* Transactions Section Title */}
        <Text style={{ fontSize: 12, fontWeight: 'bold', marginTop: 15, marginBottom: 8, color: '#1e293b', textTransform: 'uppercase', letterSpacing: 1 }}>Transaction History</Text>

        {/* Transactions Table */}
        <View style={[s.tableHeader, { backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' }]}>
          <Text style={{ flex: 1.2, fontSize: 10, fontWeight: 'bold' }}>Date</Text>
          <Text style={{ flex: 1.5, fontSize: 10, fontWeight: 'bold' }}>Reference</Text>
          <Text style={{ flex: 2.5, fontSize: 10, fontWeight: 'bold' }}>Description</Text>
          <Text style={{ flex: 1, fontSize: 10, fontWeight: 'bold', textAlign: 'right' }}>Debit</Text>
          <Text style={{ flex: 1, fontSize: 10, fontWeight: 'bold', textAlign: 'right' }}>Credit</Text>
          <Text style={{ flex: 1.3, fontSize: 10, fontWeight: 'bold', textAlign: 'right' }}>Balance</Text>
        </View>

        {data.transactions.map((txn, i) => (
          <View key={i} style={[s.row, { paddingHorizontal: 8, borderBottomColor: '#f1f5f9' }]}>
            <Text style={{ flex: 1.2, fontSize: 9 }}>{txn.date}</Text>
            <Text style={{ flex: 1.5, fontSize: 9, fontWeight: 'bold' }}>{txn.reference}</Text>
            <Text style={{ flex: 2.5, fontSize: 9, color: '#475569' }}>{txn.memo || '-'}</Text>
            <Text style={{ flex: 1, fontSize: 9, textAlign: 'right', color: txn.debit > 0 ? '#e11d48' : '#64748b' }}>{txn.debit > 0 ? formatAmount(txn.debit) : '-'}</Text>
            <Text style={{ flex: 1, fontSize: 9, textAlign: 'right', color: txn.credit > 0 ? '#059669' : '#64748b' }}>{txn.credit > 0 ? formatAmount(txn.credit) : '-'}</Text>
            <Text style={{ flex: 1.3, fontSize: 9, textAlign: 'right', fontWeight: 'bold' }}>{formatAmount(txn.runningBalance)}</Text>
          </View>
        ))}

         {/* Security Footer */}
         <View style={s.securityFooter} fixed>
           <View style={s.securityFooterText}>
             <Text style={[s.securityFooterLine, { fontSize: 10 * fontScale, lineHeight: 1.4, textAlign: 'left' }]}>
               This is a computer-generated document. No signature required. For enquiries contact:
             </Text>
             <Text style={[s.securityFooterLine, { marginTop: 2, fontSize: 10 * fontScale, lineHeight: 1.4, textAlign: 'left' }]}>
               {`${companyName}${config?.addressLine1 ? `, ${config.addressLine1}` : ''}${config?.phone ? `, Phone ${config.phone}` : ''}`}
             </Text>
           </View>
           {(() => {
             const qrUrl = resolvePdfQrCodeSource(String((data as any)?.securityQrCodeDataUrl || '').trim());
             return qrUrl ? (
               <View style={[s.securityQrPanel, { width: 58, alignItems: 'center', borderWidth: 0, backgroundColor: 'transparent', paddingVertical: 0, paddingHorizontal: 0 }]}>
                 <Image src={qrUrl} style={{ width: 50, height: 50 }} />
               </View>
             ) : null;
           })()}
         </View>
      </Page>
    </Document>
  );
};
