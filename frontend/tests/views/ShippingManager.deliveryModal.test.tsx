import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShippingManager from '../../views/sales/ShippingManager';

const mockNotify = vi.fn();
const mockHandlePreview = vi.fn();
const mockUpdateShipmentStatus = vi.fn(async () => ({ success: true }));
const mockReconcileLegacy = vi.fn(async () => ({ success: true, updatedCount: 0 }));
const mockFetchSalesData = vi.fn(async () => undefined);
const mockFetchFinanceData = vi.fn(async () => undefined);

vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    deliveryNotes: [
      {
        id: 'DN-1',
        invoiceId: 'INV-1',
        date: '2026-02-22T09:00:00.000Z',
        customerName: 'Acme Ltd',
        shippingAddress: 'Area 3',
        items: [{ id: 'I-1', name: 'A4 Paper', quantity: 3 }],
        status: 'In Transit'
      }
    ],
    shipments: [
      {
        id: 'SHP-1',
        orderId: 'DN-1',
        customerName: 'Acme Ltd',
        carrier: 'Own Delivery',
        trackingNumber: 'TRK-1',
        weight: 1,
        weightUnit: 'kg',
        dimensions: { l: 1, w: 1, h: 1 },
        status: 'In Transit',
        shippingCost: 12
      }
    ],
    customers: [{ id: 'C-1', name: 'Acme Ltd', contact: '+265991234567' }],
    companyConfig: { companyName: 'Prime ERP', currencySymbol: 'K' },
    employees: [{ id: 'EMP-1', name: 'Driver One', role: 'Driver', status: 'Active' }],
    notify: mockNotify,
    fetchSalesData: mockFetchSalesData,
    fetchFinanceData: mockFetchFinanceData
  })
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    companyConfig: { companyName: 'Prime ERP', currencySymbol: 'K' },
    notify: mockNotify,
    user: { id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}));

vi.mock('../../context/FinanceContext', () => ({
  useFinance: () => ({
    deliveryNotes: [
      {
        id: 'DN-1',
        invoiceId: 'INV-1',
        date: '2026-02-22T09:00:00.000Z',
        customerName: 'Acme Ltd',
        shippingAddress: 'Area 3',
        items: [{ id: 'I-1', name: 'A4 Paper', quantity: 3 }],
        status: 'In Transit'
      }
    ],
    employees: [{ id: 'EMP-1', name: 'Driver One', role: 'Driver', status: 'Active' }],
    fetchFinanceData: mockFetchFinanceData,
  }),
}));

vi.mock('../../context/SalesContext', () => ({
  useSales: () => ({
    shipments: [
      {
        id: 'SHP-1',
        orderId: 'DN-1',
        customerName: 'Acme Ltd',
        carrier: 'Own Delivery',
        trackingNumber: 'TRK-1',
        weight: 1,
        weightUnit: 'kg',
        dimensions: { l: 1, w: 1, h: 1 },
        status: 'In Transit',
        shippingCost: 12
      }
    ],
    customers: [{ id: 'C-1', name: 'Acme Ltd', contact: '+265991234567' }],
    fetchSalesData: mockFetchSalesData,
  }),
}));

vi.mock('../../hooks/useDocumentPreview', () => ({
  useDocumentPreview: () => ({
    handlePreview: mockHandlePreview
  })
}));

vi.mock('../../services/transactionService', () => ({
  transactionService: {
    updateShipmentStatus: (...args: any[]) => mockUpdateShipmentStatus(...args),
    reconcileLegacyShipmentProofToDeliveryNotes: (...args: any[]) => mockReconcileLegacy(...args)
  }
}));

vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    pdf: vi.fn(() => ({
      toBlob: vi.fn(async () => new Blob())
    }))
  };
});

describe('ShippingManager delivery modal signature flows', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    mockHandlePreview.mockClear();
    mockUpdateShipmentStatus.mockClear();
    mockReconcileLegacy.mockClear();
    mockFetchSalesData.mockClear();
    mockFetchFinanceData.mockClear();

    const contextMock = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      lineWidth: 0,
      lineCap: 'round',
      lineJoin: 'round',
      strokeStyle: '#000'
    } as unknown as CanvasRenderingContext2D;

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: vi.fn(() => contextMock)
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
      configurable: true,
      value: vi.fn(() => 'data:image/png;base64,DRAWN_SIG')
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: vi.fn(() => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 600,
        height: 192,
        right: 600,
        bottom: 192,
        toJSON: () => ({})
      }))
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true)
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn()
    });

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: any) =>
          success({
            coords: { latitude: -13.9626, longitude: 33.7741 }
          })
        )
      }
    });

    class MockFileReader {
      onload: ((e: any) => void) | null = null;
      readAsDataURL() {
        this.onload?.({ target: { result: 'data:image/png;base64,UPLOADED_SIG' } });
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openDeliveryModal = () => {
    const result = render(<ShippingManager />);
    fireEvent.click(screen.getByRole('button', { name: /active/i }));
    fireEvent.click(screen.getByRole('button', { name: /seal proof of delivery/i }));
    return result;
  };

  it('blocks finalize when signature is missing', () => {
    openDeliveryModal();
    const finalizeButton = screen.getByRole('button', { name: /finalize & generate certificate/i });
    expect(finalizeButton).toBeDisabled();
  });

  it('enables finalize after drawing a signature on the pointer canvas', async () => {
    const { container } = openDeliveryModal();

    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas).toBeTruthy();

    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 60, pointerId: 1 });

    const finalizeButton = screen.getByRole('button', { name: /finalize & generate certificate/i });
    await waitFor(() => expect(finalizeButton).toBeEnabled());
  });

  it('enables finalize after uploading a signature image', async () => {
    openDeliveryModal();

    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    const uploadInput = screen.getByTestId('signature-upload-input') as HTMLInputElement;
    const file = new File(['signature'], 'signature.png', { type: 'image/png' });
    fireEvent.change(uploadInput, { target: { files: [file] } });

    const finalizeButton = screen.getByRole('button', { name: /finalize & generate certificate/i });
    await waitFor(() => expect(finalizeButton).toBeEnabled());
  });
});
