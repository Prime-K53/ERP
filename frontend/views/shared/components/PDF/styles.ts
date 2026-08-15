import { StyleSheet } from '@react-pdf/renderer';

export const docStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 12, // 16px body
    color: '#000',
    position: 'relative', // Allows absolute positioning for legal footer
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  headerLeft: {
    flexDirection: 'column',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    flex: 1,
  },
  logo: {
    width: 140,
    height: 'auto',
    marginBottom: 10,
  },
  logoRight: {
    width: 140,
    height: 'auto',
    marginBottom: 0,
  },
  title: {
    fontSize: 27.75, // Further reduced by 2px from 29.75
    fontWeight: 'bold',
    textTransform: 'none',
    height: 42,
    marginBottom: 1.125, // 1.5px spacing
  },
  infoText: {
    marginTop: 2.25, // 3px gap below Title
    flexDirection: 'column',
    lineHeight: 1.125, // 1.5px spacing between lines
  },
  recipientInfoText: {
    flexDirection: 'column',
    lineHeight: 1.2, // Standardizing line height
  },
  recipientName: {
    fontWeight: 'bold',
  },
  recipientDetail: {
    color: '#333333',
  },
  recipientPhone: {
    color: '#333333',
    marginTop: 2, // Explicit gap visually matching metadata
  },
  narrativeContainer: {
    marginTop: 30, // Space after header
    lineHeight: 1.125, // 1.5px spacing for the professional description
  },

  // 2. Billing Section
  billingSection: {
    marginBottom: 18,
    flexDirection: 'row',
    lineHeight: 1.125,
  },
  recipientSectionTight: {
    marginBottom: 14,
  },

  // 3. Table Rows
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderColor: '#000',
    paddingVertical: 6, // Matched with row padding
    fontWeight: 'bold'
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    paddingVertical: 6,
    alignItems: 'center'
  },

  // 4. Totals Section
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 10,
    marginBottom: 15,
  },
  summaryLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    flex: 1,
  },
  summaryRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    width: 180,
  },
  summaryBox: { width: 180 },
  statusBox: {
    padding: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    borderLeftWidth: 3,
    marginTop: 0,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1.5,
    borderColor: '#000',
    marginTop: 4,
    fontWeight: 'bold',
    gap: 8,
  },

  // 5. Movable Company Section (Moves with items)
  footerContainer: {
    marginTop: 10,
    textAlign: 'center',
    alignItems: 'center',
    paddingBottom: 35,
  },
  thankYouText: {
    fontSize: 12,
    marginBottom: 20,
  },
  footerLine: {
    borderTopWidth: 0.5,
    borderColor: '#ccc',
    width: '100%',
    marginBottom: 15,
  },
  companyName: {
    fontSize: 13, // Reduced as requested to match footer statement
    fontWeight: 'bold',
    marginBottom: 1.125,
  },
  footerDetail: {
    fontSize: 12,
    lineHeight: 1.5, // 1.5px line spacing
    marginBottom: 1.125, // 1.5px gap
  },
  quotationFooterDetail: {
    fontSize: 12,
    lineHeight: 1.4,
    marginBottom: 2,
  },

  // 6. Static Legal Footer (Fixed at the very bottom)
  legalBottom: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'left',
    fontSize: 8,
    color: '#666',
    borderTopWidth: 0.5,
    borderColor: '#eee',
    paddingTop: 10,
    lineHeight: 1.2,
  },
  securityFooter: {
    position: 'absolute',
    bottom: 26,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderColor: '#e2e8f0',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  securityFooterText: {
    flex: 1,
    paddingRight: 0,
    alignItems: 'flex-start',
  },
  securityFooterLine: {
    fontSize: 8,
    color: '#666',
    lineHeight: 1.2,
    textAlign: 'left',
  },
  securityQrPanel: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityQrImage: {
    width: 50,
    height: 50,
  },
  tableSectionTight: {
    marginTop: 6,
  },
  securityQrLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    color: '#0f172a',
    marginBottom: 1,
  },
  securityQrMeta: {
    fontSize: 5.8,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 1.15,
  },

  // --- Receipt Specific Layout ---
  watermarkContainer: {
    position: 'absolute',
    top: '38%',
    left: '10%',
    width: '80%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: 'rotate(-30deg)',
    opacity: 0.15,
    zIndex: -1,
  },
  watermarkText: {
    fontSize: 70,
    fontWeight: 'bold',
    color: '#dc2626',
    borderWidth: 6,
    borderColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    textTransform: 'uppercase',
    letterSpacing: 4,
    textAlign: 'center',
  },
  convertedWatermarkContainer: {
    position: 'absolute',
    top: '35%',
    left: '10%',
    transform: 'rotate(-25deg)',
    opacity: 0.08,
    zIndex: -1,
    width: '100%',
    textAlign: 'center',
  },
  convertedWatermarkText: {
    fontSize: 80,
    fontWeight: 'bold',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  conversionBox: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 8,
    width: 200,
    fontSize: 9,
    lineHeight: 1.4,
  },
  conversionTitle: {
    fontWeight: 'bold',
    marginBottom: 2,
    fontSize: 10,
  },
  remarksBox: {
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#000',
    padding: 8,
    minHeight: 60,
  },
  remarksTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  receiptTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textDecoration: 'underline',
  },
  receiptMeta: {
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 5,
    fontSize: 12,
  },
  metaLabel: {
    width: 100,
    color: '#666',
  },
  metaValue: {
    width: 120,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  issuerSection: {
    marginBottom: 40,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    paddingVertical: 10,
    lineHeight: 1.4,
  },
  issuerRow: {
    flexDirection: 'row',
    marginBottom: 4,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  issuerLabel: {
    width: 100,
    fontWeight: 'bold',
    color: '#666',
  },
  issuerValue: {
    flex: 1,
    fontWeight: 'bold',
  },
  settlementHeader: {
    textAlign: 'center',
    marginBottom: 20,
    borderBottomWidth: 2,
    borderColor: '#000',
    paddingBottom: 5,
    alignSelf: 'center',
  },
  settlementHeaderText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  receiptNarrative: {
    fontSize: 12,
    lineHeight: 1.6,
    marginBottom: 20,
  },
  amountHighlight: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 4,
    fontWeight: 'bold',
    borderRadius: 2,
  },
  overpaymentNotice: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
    padding: 12,
    marginBottom: 20,
    borderRadius: 4,
  },
  overpaymentTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#15803d',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 1,
  },
  overpaymentText: {
    fontSize: 10,
    color: '#166534',
    fontStyle: 'italic',
  },
  paymentTable: {
    marginTop: 20,
    borderTopWidth: 0.5,
    borderColor: '#eee',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: '#eee',
    fontSize: 12,
  },
  totalSettledBox: {
    marginTop: 15,
    backgroundColor: '#f8fafc',
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 6,
  },
  totalSettledLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e293b',
    textTransform: 'uppercase',
  },
  totalSettledValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563eb',
  },

  // Narrative and Ledger spacing
  narrativeText: {
    fontSize: 12,
    lineHeight: 1.6,
    marginTop: 20,
    marginBottom: 10,
  },

  receiptFooterInfo: {
    marginTop: 40,
    textAlign: 'center',
    lineHeight: 1.5, // 1.5px line spacing
  },
  overpaymentBox: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
    lineHeight: 1.125,
  },
  disclaimerText: {
    fontSize: 10,
    color: '#666',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 1.125,
  },

  // Column Widths
  colQty: { width: 50, textAlign: 'left' },
  colDesc: { flex: 3 },
  colPrice: { flex: 2, textAlign: 'right' },
  colTotal: { flex: 2, textAlign: 'right' },

  // Signature blocks
  signatureBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
  },
  sigLine: {
    width: 150,
    borderTopWidth: 1,
    borderColor: '#000',
    marginTop: 30,
    marginBottom: 5,
  },
  signatureImageBox: {
    width: 180,
    height: 72,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginBottom: 5,
  },
  signatureImage: {
    width: 168,
    height: 62,
    objectFit: 'contain',
  },

  // --- Statement Specific Layout ---
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  companySide: {
    flexDirection: 'column',
    textAlign: 'left',
    lineHeight: 1.2,
  },
  statementSide: {
    alignItems: 'flex-end',
    width: 260,
  },
  summaryTable: {
    marginTop: 10,
    width: '100%',
    borderTopWidth: 1,
    borderColor: '#000',
  },
  timestamp: {
    marginTop: 30,
    fontSize: 9,
    color: '#666',
    fontStyle: 'italic',
  },
  // POS A4 Layout
  posA4Wrapper: {
    width: 250,
    paddingVertical: 30,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderStyle: 'dashed',
    alignSelf: 'center',
    backgroundColor: '#fff',
  },

});
