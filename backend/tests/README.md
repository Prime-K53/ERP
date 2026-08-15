# Backend Tests

## Prerequisites
```bash
cd backend
npm install
npm run build  # if applicable
```

## Running Tests
```bash
npm test
```

## Test Structure
- `setup.cjs` - Test database initialization (in-memory SQLite)
- `helpers.cjs` - Shared test utilities (create user, auth token, etc.)
- `integration/` - Integration tests for API endpoints
  - `finance.test.cjs` - Chart of Accounts, Ledger, Expenses, Income, Budgets, Transfers
  - `procurement.test.cjs` - Suppliers, Purchase Orders, Goods Receipts
  - `production.test.cjs` - Work Centers, Resources, Work Orders, Batches
  - `hr.test.cjs` - Employees, Payroll Runs, Payslips
  - `sales.test.cjs` - Sales CRUD
  - `documents.test.cjs` - Document engine
- `unit/` - Unit tests for services
  - `financeService.test.cjs`
  - `procurementService.test.cjs`
  - `productionService.test.cjs`
  - `hrService.test.cjs`

## Writing Tests
Use the `setupTestDb()` helper to get a fresh in-memory database:
```javascript
const { setupTestDb, createTestUser, getAuthHeaders } = require('../helpers.cjs');

describe('Finance API', () => {
  let app, db;

  beforeAll(async () => {
    db = await setupTestDb();
    app = createTestApp(db);
  });

  afterAll(() => db.close());
});
```
