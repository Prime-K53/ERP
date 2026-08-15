import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllItems: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  api: {
    inventory: {
      getAllItems: mocks.getAllItems,
    },
  },
}));

describe('inventoryListService', () => {
  it('loads items through the inventory API and normalizes list classifications', async () => {
    mocks.getAllItems.mockResolvedValueOnce([
      {
        id: 'itm-1',
        name: 'Notebook',
        sku: 'PRD-001',
        type: 'product',
        quantity: 4,
        cost_per_unit: 10,
        selling_price: 20,
      },
    ]);

    const { fetchAllItems } = await import('../../views/inventory/InventoryList/services/inventoryListService');
    const items = await fetchAllItems();

    expect(mocks.getAllItems).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'itm-1',
      type: 'Product',
      stock: 4,
      costPrice: 10,
      sellingPrice: 20,
    });
  });
});
