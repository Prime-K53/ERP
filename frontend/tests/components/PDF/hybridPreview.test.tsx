import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NativePdfPreview } from '../../../views/shared/components/PDF/NativePdfPreview';

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn(() => ({
    toBlob: vi.fn(() => Promise.resolve(new Blob(['mock pdf content'], { type: 'application/pdf' }))),
  })),
  Document: vi.fn(({ children }) => children),
  Page: vi.fn(({ children }) => children),
  View: vi.fn(({ children }) => children),
  Text: vi.fn(({ children }) => children),
  Font: {
    registerHyphenationCallback: vi.fn(),
  },
}));

vi.mock('../../../views/shared/components/PDF/PrimeDocument', () => ({
  default: vi.fn(),
}));

vi.mock('../../../utils/documentSecurity', () => ({
  attachDocumentSecurity: vi.fn(() => Promise.resolve({
    testData: 'mock secured data',
    securityQrPayload: 'mock qr payload'
  })),
}));

vi.mock('../../../views/shared/components/PDF/templateSettings', () => ({
  getStoredCompanyConfig: vi.fn(() => ({
    companyName: 'Test Company',
    invoiceTemplates: { fontFamily: 'Helvetica' }
  })),
  initializePrimePdfFonts: vi.fn(() => Promise.resolve()),
}));

describe('NativePdfPreview', () => {
  const mockPdfBlob = new Blob(['%PDF-1.4 mock pdf content'], { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url-123');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders empty state when no source provided', () => {
    render(<NativePdfPreview source={null} />);
    expect(screen.getByText('No preview available')).toBeInTheDocument();
  });

  it('shows preparing state when source is provided', async () => {
    render(<NativePdfPreview source={mockPdfBlob} title="Test PDF" />);
    expect(screen.getByText('Preparing PDF\u2026')).toBeInTheDocument();
  });
});
