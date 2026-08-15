import React from 'react';
import { logger } from '@/services/logger';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import { CompanyConfig } from '../../../../types.ts';
import { resolvePdfLogoSource } from '../../../../utils/companyAssetUtils.ts';
import { resolvePrimeTemplateSettings, getStoredCompanyConfig } from './templateSettings.ts';

// Helper to get dynamic config from CompanyConfig (mirrored from transactionService)
const getCompanyConfig = (): CompanyConfig | null => {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('nexus_company_config');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      logger.error("Failed to parse company config", e);
    }
  }
  return null;
};

// Disable hyphenation
Font.registerHyphenationCallback(word => [word]);

// Format amount helper
const formatAmount = (amount: number) => {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export interface StatementEntry {
  date: string;
  id: string;
  memo: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface StatementData {
  customer: {
    name: string;
    address: string;
    cityStateZip: string;
  };
  openingBalance: number;
  closingBalance: number;
  startDate: string;
  endDate: string;
  currency: string;
  entries: StatementEntry[];
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    lineHeight: 1.4,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  companyInfo: {
    textAlign: 'right',
  },
  customerSection: {
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#666',
  },
  periodSection: {
    textAlign: 'right',
    marginTop: -5,
  },
  summaryGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 4,
    marginBottom: 10,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000',
    color: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  colDate: { width: '12%' },
  colRef: { width: '12%' },
  colDesc: { width: '26%' },
  colDebit: { width: '16%', textAlign: 'right' },
  colCredit: { width: '16%', textAlign: 'right' },
  colBalance: { width: '18%', textAlign: 'right' },
  footer: {
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    textAlign: 'center',
    color: '#999',
    fontSize: 8,
  },
  logo: {
    width: 150,
    height: 42,
    marginBottom: 10,
  }
});

export const StatementTemplate: React.FC<{ data: StatementData }> = ({ data }) => {
  const config = getStoredCompanyConfig();
  const templateSettings = resolvePrimeTemplateSettings(config);
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';
  const companyContact = `${config?.phone || ''} | ${config?.email || ''}`;
  const logo = resolvePdfLogoSource(config, true);

  return (
    <Document
      title={`Statement - ${data.customer.name}`}
      author={companyName}
      subject="Customer Account Statement"
      creator="Prime ERP System"
    >
      <Page size="A4" style={[styles.page, { fontFamily: templateSettings.fontFamily }]}>
        <View style={styles.headerSection}>
          <View>
            {logo ? (
              <Image src={logo} style={styles.logo} />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>{companyName}</Text>
            )}
            <Text style={styles.title}>Customer Statement</Text>
            <Text>Generated on: {new Date().toLocaleDateString()}</Text>
          </View>
          <View style={styles.companyInfo}>
            <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 2 }}>{companyName}</Text>
            <Text>{companyAddress}</Text>
            <Text>{companyContact}</Text>
          </View>
        </View>

        <View style={styles.customerSection}>
          <View>
            <Text style={styles.sectionTitle}>STATEMENT FOR:</Text>
            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{data.customer.name}</Text>
            <Text>{data.customer.address}</Text>
            <Text>{data.customer.cityStateZip}</Text>
          </View>
          <View style={styles.periodSection}>
            <Text style={styles.sectionTitle}>PERIOD:</Text>
            <Text>{data.startDate || 'Beginning'} - {data.endDate || 'Present'}</Text>
            <Text style={{ marginTop: 5 }}>Currency: {data.currency}</Text>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Opening Balance</Text>
            <Text style={styles.summaryValue}>{data.currency}{formatAmount(data.openingBalance)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Closing Balance</Text>
            <Text style={[styles.summaryValue, { color: data.closingBalance > 0 ? '#e11d48' : '#059669' }]}>
              {data.currency}{formatAmount(data.closingBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.colDate}>Date</Text>
          <Text style={styles.colRef}>Reference</Text>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colDebit}>Debit</Text>
          <Text style={styles.colCredit}>Credit</Text>
          <Text style={styles.colBalance}>Balance</Text>
        </View>

        {data.entries.map((entry, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={styles.colDate}>{entry.date}</Text>
            <Text style={styles.colRef}>{entry.id}</Text>
            <Text style={styles.colDesc}>{entry.memo}</Text>
            <Text style={styles.colDebit}>{entry.debit > 0 ? formatAmount(entry.debit) : '-'}</Text>
            <Text style={styles.colCredit}>{entry.credit > 0 ? formatAmount(entry.credit) : '-'}</Text>
            <Text style={styles.colBalance}>{formatAmount(entry.runningBalance)}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text>This is a computer-generated statement and does not require a signature.</Text>
          <Text>Please contact {config?.email || 'accounts@prime-erp.com'} for any discrepancies.</Text>
        </View>
      </Page>
    </Document>
  );
};
