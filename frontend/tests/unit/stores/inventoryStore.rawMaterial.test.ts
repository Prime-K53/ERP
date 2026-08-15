import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApi = {
  inventory: {
    getAllItems: vi.fn(),
    deleteItem: vi.fn(),
  }
};

const mockTransactionService = {
  saveItem: vi.fn(async () => ({ success: true })),
  deleteItem: vi.fn(async () => ({ success: true })),
  adjustStock: vi.fn(),
  updateReservedStock: vi.fn(),
  transferStock: vi.fn(),
};

const mockDbService = {
  getAll: vi.fn(async () => []),
  put: vi.fn(async () => undefined),
};

vi.mock('../../../services/api', () => ({
  api: mockApi
}));

vi.mock('../../../services/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../../services/db', () => ({
  dbService: mockDbService
}));

vi.mock('../../../services/transactionService', () => ({
  transactionService: mockTransactionService
}));

vi.mock('../../../services/pricingValidationService', () => ({
  validateMinimumMarkup: vi.fn(() => ({ valid: true, profit: 0, profitMarkup: 0, minimumMarkup: 0 }))
}));

describe('useInventoryStore raw material creation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockApi.inventory.getAllItems.mockResolvedValue([]);

    const { useInventoryStore } = await import('../../../stores/inventoryStore');
    useInventoryStore.setState({
      inventory: [],
      warehouses: [],
      isLoading: false,
      error: null
    });
  });

  it('creates two raw materials sequentially without overwriting the first', async () => {
    const { useInventoryStore } = await import('../../../stores/inventoryStore');

    const firstItem = {
      id: 'ITM-001',
      name: 'Bond Paper 80gsm',
      type: 'Raw Material',
      sku: 'RAW-001',
      stock: 100,
      cost: 50,
      costPrice: 50,
      price: 0,
      sellingPrice: 0,
    };

    const secondItem = {
      id: 'ITM-002',
      name: 'Toner Cartridge',
      type: 'Raw Material',
      sku: 'RAW-002',
      stock: 20,
      cost: 150,
      costPrice: 150,
      price: 0,
      sellingPrice: 0,
    };

    await useInventoryStore.getState().addItem(firstItem);
    await useInventoryStore.getState().addItem(secondItem);

    const state = useInventoryStore.getState();
    expect(state.inventory).toHaveLength(2);
    expect(state.inventory.map(i => i.id)).toEqual(['ITM-001', 'ITM-002']);
    expect(state.inventory[0].name).toBe('Bond Paper 80gsm');
    expect(state.inventory[1].name).toBe('Toner Cartridge');
    expect(mockTransactionService.saveItem).toHaveBeenCalledTimes(2);
  });

  it('does not reuse a stale sequential ID across multiple creations', async () => {
    const { useInventoryStore } = await import('../../../stores/inventoryStore');

    mockApi.inventory.getAllItems.mockResolvedValue([
      { id: 'ITM-001', name: 'Existing Item', type: 'Raw Material' }
    ]);

    const firstNewItem = {
      name: 'New Raw Material A',
      type: 'Raw Material',
      sku: 'RAW-003',
      stock: 50,
      cost: 30,
      costPrice: 30,
      price: 0,
      sellingPrice: 0,
    };

    const secondNewItem = {
      name: 'New Raw Material B',
      type: 'Raw Material',
      sku: 'RAW-004',
      stock: 75,
      cost: 40,
      costPrice: 40,
      price: 0,
      sellingPrice: 0,
    };

    await useInventoryStore.getState().addItem(firstNewItem);
    await useInventoryStore.getState().addItem(secondNewItem);

    const calls = mockTransactionService.saveItem.mock.calls;
    const firstCallId = calls[0][0].id;
    const secondCallId = calls[1][0].id;

    expect(firstCallId).not.toBe(secondCallId);
    expect(firstCallId).not.toBe('ITM-001');
    expect(secondCallId).not.toBe('ITM-001');
  });

  it('treats items with explicit IDs as updates rather than inserts', async () => {
    const { useInventoryStore } = await import('../../../stores/inventoryStore');

    useInventoryStore.setState({
      inventory: [
        { id: 'ITM-EXISTING', name: 'Existing Item', type: 'Raw Material', stock: 10, cost: 10, costPrice: 10, price: 0, sellingPrice: 0 }
      ],
      warehouses: [],
      isLoading: false,
      error: null
    });

    await useInventoryStore.getState().updateItem({
      id: 'ITM-EXISTING',
      name: 'Existing Item Updated',
      type: 'Raw Material',
      stock: 20,
      cost: 15,
      costPrice: 15,
      price: 0,
      sellingPrice: 0,
    });

    expect(mockTransactionService.saveItem).toHaveBeenCalledTimes(1);
    expect(useInventoryStore.getState().inventory).toHaveLength(1);
    expect(useInventoryStore.getState().inventory[0].name).toBe('Existing Item Updated');
  });
});
