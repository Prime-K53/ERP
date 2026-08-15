const { createTestDb, createTestApp, createTestSchema } = require('../setup.cjs');

describe('HR API Integration', () => {
  let db, hr;

  beforeAll(async () => {
    db = await createTestDb();
    await createTestSchema(db);
    hr = createTestApp(db).services.hr;
  });

  afterAll(() => db.close());

  describe('Employees', () => {
    test('CRUD employee', async () => {
      const emp = await hr.createEmployee({
        name: 'John Doe',
        email: 'john@example.com',
        department: 'Engineering',
        role: 'Developer',
        salary: 75000
      });
      expect(emp).toBeDefined();
      expect(emp.name).toBe('John Doe');

      const updated = await hr.updateEmployee(emp.id, { salary: 80000, role: 'Senior Developer' });
      expect(updated.salary).toBe(80000);
      expect(updated.role).toBe('Senior Developer');

      const employees = await hr.getEmployees();
      expect(employees.length).toBeGreaterThanOrEqual(1);

      await hr.deleteEmployee(emp.id);
      const afterDelete = await hr.getEmployees();
      expect(afterDelete.find(e => e.id === emp.id)).toBeUndefined();
    });
  });

  describe('Payroll Runs', () => {
    test('create and list payroll runs', async () => {
      const run = await hr.createPayrollRun({
        name: 'June 2026 Payroll',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        status: 'Draft',
        total_gross: 50000,
        total_deductions: 10000,
        total_net: 40000,
        employee_count: 10
      });
      expect(run).toBeDefined();
      expect(run.name).toBe('June 2026 Payroll');

      const runs = await hr.getPayrollRuns();
      expect(runs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Payslips', () => {
    test('create and list payslips', async () => {
      const emp = await hr.createEmployee({
        name: 'Jane Smith', department: 'Marketing', salary: 60000
      });
      const run = await hr.createPayrollRun({
        name: 'Test Payroll', period_start: '2026-06-01', period_end: '2026-06-30'
      });

      const slip = await hr.createPayslip({
        employee_id: emp.id,
        payroll_run_id: run.id,
        gross_pay: 5000,
        deductions: 1000,
        net_pay: 4000,
        pay_period: '2026-06',
        status: 'Draft'
      });
      expect(slip).toBeDefined();
      expect(slip.net_pay).toBe(4000);

      const slips = await hr.getPayslips();
      expect(slips.length).toBeGreaterThanOrEqual(1);
    });
  });
});
