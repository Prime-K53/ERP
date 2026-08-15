import QRCode from 'qrcode';

const getCompanyNameFromStorage = () => {
  if (typeof window === 'undefined') return 'Prime ERP';

  const saved = localStorage.getItem('nexus_company_config');
  if (!saved) return 'Prime ERP';

  try {
    const parsed = JSON.parse(saved);
    return String(parsed?.companyName || '').trim() || 'Prime ERP';
  } catch {
    return 'Prime ERP';
  }
};

const formatSecurityTimestamp = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return String(value || 'Unknown time');
  return parsed.toLocaleString();
};

const resolveDocumentNumber = (data: any) =>
  String(
    data?.number
    || data?.invoiceNumber
    || data?.orderNumber
    || data?.receiptNumber
    || data?.paymentId
    || data?.exchangeNumber
    || data?.reportName
    || 'N/A'
  ).trim() || 'N/A';

const resolveCreatedBy = (data: any) =>
  String(
    data?.createdByName
    || data?.createdBy
    || data?.created_by
    || data?.cashierName
    || data?.cashier_name
    || data?.operatorName
    || data?.operator_name
    || 'System User'
  ).trim() || 'System User';

const resolveCreatedAt = (data: any) =>
  String(
    data?.createdAtIso
    || data?.createdAt
    || data?.created_at
    || data?.date
    || ''
  ).trim();

export const buildSecurityQrPayload = (data: any, companyName?: string) => {
  const resolvedCompanyName = String(companyName || '').trim() || getCompanyNameFromStorage();
  const documentNumber = resolveDocumentNumber(data);
  const createdOn = formatSecurityTimestamp(resolveCreatedAt(data));
  const createdBy = resolveCreatedBy(data);

  return `${resolvedCompanyName}, ${documentNumber}, created on ${createdOn}, by ${createdBy}`;
};

export const attachDocumentSecurity = async <T extends Record<string, any>>(data: T, companyName?: string): Promise<T> => {
  const payload = buildSecurityQrPayload(data, companyName);
  let securityQrCodeDataUrl: string | undefined;

  try {
    securityQrCodeDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 96,
    });
  } catch (error) {
    console.warn('[documentSecurity] Failed to generate QR code data URL.', error);
  }

  return {
    ...data,
    securityQrPayload: payload,
    securityQrCodeDataUrl,
  };
};
