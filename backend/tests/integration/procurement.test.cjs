const { createTestDb, createTestApp, createTestSchema } = require('../setup.cjs');
const { TEST_USER_ID } = require('../helpers.cjs');

describe('Procurement API Integration', () => {
  let db, procurement;

  beforeAll(async () => {
    db = await createTestDb();
    await createTestSchema(db);
    procurement = createTestApp(db).services.procurement;
  });

  afterAll(() => db.close());

  describe('Suppliers', () => {
    test('CRUD supplier', async () => {
      const supplier = await procurement.createSupplier({
        name: 'Acme Corp',
        email: 'orders@acme.com',
        category: 'Raw Materials'
      });
      expect(supplier).toBeDefined();
      expect(supplier.name).toBe('Acme Corp');

      const updated = await procurement.updateSupplier(supplier.id, { email: 'new@acme.com' });
      expect(updated.email).toBe('new@acme.com');

      const suppliers = await procurement.getSuppliers();
      expect(suppliers.length).toBeGreaterThanOrEqual(1);

      await procurement.deleteSupplier(supplier.id);
      const afterDelete = await procurement.getSuppliers();
      expect(afterDelete.find(s => s.id === supplier.id)).toBeUndefined();
    });

    test('create supplier with duplicate id does not overwrite an existing supplier', async () => {
      await procurement.createSupplier({
        id: 'SUP-DUPLICATE',
        name: 'Original Supplier',
        email: 'original@example.com'
      });

      await expect(procurement.createSupplier({
        id: 'SUP-DUPLICATE',
        name: 'Replacement Supplier',
        email: 'replacement@example.com'
      })).rejects.toThrow();

      const supplier = await procurement.getSupplierById('SUP-DUPLICATE');
      expect(supplier.name).toBe('Original Supplier');
      expect(supplier.email).toBe('original@example.com');
    });
  });

  describe('Purchase Orders', () => {
    test('create and retrieve purchase order', async () => {
      const supplier = await procurement.createSupplier({
        name: 'Supply Co',
        category: 'Equipment'
      });

      const po = await procurement.createPurchase({
        supplier_id: supplier.id,
        order_date: new Date().toISOString(),
        status: 'Draft',
        items: [{ item_name: 'Test Item', quantity: 10, unit_price: 50 }]
      }, TEST_USER_ID);
      expect(po).toBeDefined();

      const fetched = await procurement.getPurchaseById(po.id);
      expect(fetched).toBeDefined();
      expect(fetched.supplier_name).toBe('Supply Co');

      const updated = await procurement.updatePurchaseStatus(po.id, 'Approved');
      expect(updated.status).toBe('Approved');

      const purchases = await procurement.getPurchases();
      expect(purchases.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Goods Receipts', () => {
    test('create goods receipt', async () => {
      const supplier = await procurement.createSupplier({
        name: 'Goods Supplier', category: 'Materials'
      });
      const po = await procurement.createPurchase({
        supplier_id: supplier.id,
        order_date: new Date().toISOString(),
        items: [{ item_name: 'Widget', quantity: 100, unit_price: 5 }]
      }, TEST_USER_ID);

      const grn = await procurement.createGoodsReceipt({
        purchase_order_id: po.id,
        received_date: new Date().toISOString(),
        notes: 'All items received in good condition'
      }, TEST_USER_ID);
      expect(grn).toBeDefined();
      expect(grn.status).toBe('Received');

      const receipts = await procurement.getGoodsReceipts();
      expect(receipts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
