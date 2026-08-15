const { createTestDb, createTestApp, createTestSchema, generateTestId } = require('../setup.cjs');
const { TEST_USER_ID } = require('../helpers.cjs');

describe('Production API Integration', () => {
  let db, production;

  beforeAll(async () => {
    db = await createTestDb();
    await createTestSchema(db);
    production = createTestApp(db).services.production;
  });

  afterAll(() => db.close());

  describe('Work Centers', () => {
    test('create and list work centers', async () => {
      const wc = await production.createWorkCenter({
        name: 'Assembly Line 1',
        hourly_rate: 50,
        capacity_per_day: 8,
        status: 'Active'
      });
      expect(wc).toBeDefined();
      expect(wc.name).toBe('Assembly Line 1');

      const centers = await production.getWorkCenters();
      expect(centers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Resources', () => {
    test('create resource linked to work center', async () => {
      const wc = await production.createWorkCenter({
        name: 'Painting Station', hourly_rate: 40, capacity_per_day: 8
      });

      const res = await production.createResource({
        name: 'Operator A',
        work_center_id: wc.id,
        status: 'Active',
        resource_type: 'Human'
      });
      expect(res).toBeDefined();
      expect(res.work_center_id).toBe(wc.id);

      const resources = await production.getResources();
      expect(resources.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Work Orders', () => {
    test('full CRUD', async () => {
      const wo = await production.createWorkOrder({
        customer_name: 'Test Client',
        product_name: 'Widget A',
        quantity_planned: 100,
        status: 'Draft',
        priority: 'High'
      }, TEST_USER_ID);
      expect(wo).toBeDefined();
      expect(wo.status).toBe('Draft');

      const updated = await production.updateWorkOrder(wo.id, {
        status: 'In Progress',
        quantity_completed: 50
      });
      expect(updated.status).toBe('In Progress');
      expect(updated.quantity_completed).toBe(50);

      const fetched = await production.getWorkOrderById(wo.id);
      expect(fetched).toBeDefined();

      const orders = await production.getWorkOrders();
      expect(orders.length).toBeGreaterThanOrEqual(1);

      await production.deleteWorkOrder(wo.id);
      const afterDelete = await production.getWorkOrderById(wo.id);
      expect(afterDelete).toBeUndefined();
    });
  });

  describe('Batches', () => {
    test('create and list production batches', async () => {
      const wo = await production.createWorkOrder({
        customer_name: 'Batch Client',
        product_name: 'Batch Product',
        quantity_planned: 50
      }, TEST_USER_ID);

      const batch = await production.createBatch({
        work_order_id: wo.id,
        customer_name: 'Batch Client',
        name: 'Batch 001',
        status: 'Pending',
        quantity_produced: 50,
        unit_cost: 10,
        total_cost: 500
      });
      expect(batch).toBeDefined();
      expect(batch.name).toBe('Batch 001');

      const batches = await production.getBatches();
      expect(batches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
