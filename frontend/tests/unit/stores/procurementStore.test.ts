import { beforeEach, describe, expect, it, vi } from 'vitest';

const suppliersApi = {
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteSupplier: vi.fn()
};

const procurementApi = {
  getPurchases: vi.fn(),
  getGoodsReceipts: vi.fn(),
  getSubcontractOrders: vi.fn(),
  savePurchase: vi.fn(),
  saveGoodsReceipt: vi.fn(),
  deleteGoodsReceipt: vi.fn(),
  saveSubcontractOrder: vi.fn(),
  deleteSubcontractOrder: vi.fn()
};

vi.mock('../../../services/api', () => ({
  api: {
    procurement: procurementApi,
    suppliers: suppliersApi
  }
}));

vi.mock('../../../services/transactionService', () => ({
  transactionService: {
    approvePurchaseOrder: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
    processGoodsReceipt: vi.fn()
  }
}));

vi.mock('../../../utils/helpers', () => ({
  generateNextId: vi.fn(() => 'SUP-NEW')
}));

vi.mock('@/services/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

describe('useProcurementStore supplier workflows', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { useProcurementStore } = await import('../../../stores/procurementStore');
    useProcurementStore.setState({
      purchases: [],
      goodsReceipts: [],
      subcontractOrders: [],
      suppliers: [],
      isLoading: false
    });
  });

  it('creates a new supplier without overwriting an existing supplier when a stale id is supplied', async () => {
    const { useProcurementStore } = await import('../../../stores/procurementStore');

    const existingSupplier = {
      id: 'SUP-001',
      name: 'Legacy Supplier',
      status: 'Active'
    };

    useProcurementStore.setState({ suppliers: [existingSupplier] });
    suppliersApi.create.mockResolvedValue({ id: 'SUP-NEW' });

    const createdSupplier = await useProcurementStore.getState().addSupplier({
      id: 'SUP-001',
      name: 'Fresh Supplier',
      status: 'Active'
    } as any);

    expect(createdSupplier).toEqual({
      id: 'SUP-NEW',
      name: 'Fresh Supplier',
      status: 'Active'
    });
    expect(suppliersApi.create).toHaveBeenCalledWith({
      id: 'SUP-NEW',
      name: 'Fresh Supplier',
      status: 'Active'
    });
    expect(useProcurementStore.getState().suppliers).toEqual([
      existingSupplier,
      {
        id: 'SUP-NEW',
        name: 'Fresh Supplier',
        status: 'Active'
      }
    ]);
  });

  it('updates an existing supplier in place without creating a duplicate', async () => {
    const { useProcurementStore } = await import('../../../stores/procurementStore');

    useProcurementStore.setState({
      suppliers: [
        {
          id: 'SUP-001',
          name: 'Legacy Supplier',
          status: 'Active',
          phone: '111'
        }
      ]
    });

    suppliersApi.update.mockResolvedValue({ id: 'SUP-001' });

    await useProcurementStore.getState().updateSupplier({
      id: 'SUP-001',
      name: 'Legacy Supplier',
      status: 'Inactive',
      phone: '222'
    } as any);

    expect(suppliersApi.update).toHaveBeenCalledWith({
      id: 'SUP-001',
      name: 'Legacy Supplier',
      status: 'Inactive',
      phone: '222'
    });
    expect(useProcurementStore.getState().suppliers).toEqual([
      {
        id: 'SUP-001',
        name: 'Legacy Supplier',
        status: 'Inactive',
        phone: '222'
      }
    ]);
  });
});
