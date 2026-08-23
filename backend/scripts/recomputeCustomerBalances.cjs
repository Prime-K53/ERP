#!/usr/bin/env node
/**
 * recomputeCustomerBalances.cjs — Safely recompute the derived `customers.balance`
 * and `customers.outstandingBalance` cache fields from the authoritative ledger.
 *
 * Usage:
 *   node backend/scripts/recomputeCustomerBalances.cjs [--dry-run] [--customer CUST-0001]
 *
 * This script:
 *   1. Loads all customers from Supabase
 *   2. For each customer, builds the authoritative ledger
 *   3. Compares the ledger balance with the stored balance
 *   4. Updates only the derived cache fields (balance, outstandingBalance)
 *   5. Does NOT modify invoices, payments, credit notes, or any transaction data
 *
 * Safe to run multiple times (idempotent).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const customerLedger = require('../services/customerLedger.cjs');
const repo = require('../services/supabaseRepository.cjs');

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_CUSTOMER = (() => {
  const idx = process.argv.indexOf('--customer');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function main() {
  console.log('='.repeat(70));
  console.log('Customer Balance Recomputation');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will update customers.balance)'}`);
  if (SINGLE_CUSTOMER) console.log(`Customer filter: ${SINGLE_CUSTOMER}`);
  console.log('='.repeat(70));

  // 1. Load all customers
  const customers = await repo.getAll('customers');
  const targets = SINGLE_CUSTOMER
    ? customers.filter((c) => String(c.id || '') === SINGLE_CUSTOMER)
    : customers;

  if (targets.length === 0) {
    console.log('No customers found matching the filter.');
    return;
  }

  console.log(`\nCustomers to process: ${targets.length}\n`);

  // 2. Process each customer
  const results = [];
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (const customer of targets) {
    const customerId = customer.id;
    const customerName = customer.name || customer.id;
    const storedBalance = Number(customer.balance || 0);
    const storedOutstanding = Number(customer.outstandingBalance ?? customer.balance ?? 0);

    try {
      const ledger = await customerLedger.buildLedger(customerId);
      const ledgerBalance = customerLedger.round2(ledger.closingBalance);
      const ledgerOutstanding = ledger.outstandingBalance;
      const diff = customerLedger.round2(ledgerBalance - storedBalance);

      const result = {
        id: customerId,
        name: customerName,
        storedBalance,
        ledgerBalance,
        difference: diff,
        storedOutstanding,
        ledgerOutstanding,
        transactions: ledger.transactions.length,
        status: Math.abs(diff) < 0.01 ? 'MATCH' : diff > 0 ? 'UNDER' : 'OVER',
      };
      results.push(result);

      if (Math.abs(diff) >= 0.01) {
        updated++;
        if (!DRY_RUN) {
          await repo.upsert('customers', {
            ...customer,
            balance: ledgerBalance,
            outstandingBalance: ledgerOutstanding,
          });
        }
      } else {
        unchanged++;
      }

      // Progress indicator
      process.stdout.write('.');
    } catch (err) {
      errors++;
      results.push({
        id: customerId,
        name: customerName,
        storedBalance,
        error: err.message,
        status: 'ERROR',
      });
      process.stdout.write('!');
    }
  }

  console.log('\n');

  // 3. Summary
  console.log('='.repeat(70));
  console.log('RECONCILIATION REPORT');
  console.log('='.repeat(70));
  console.log(`Customers checked:    ${targets.length}`);
  console.log(`Already matching:     ${unchanged}`);
  console.log(`${DRY_RUN ? 'Would update' : 'Updated'}:  ${updated}`);
  console.log(`Errors:               ${errors}`);
  console.log('');

  // 4. Show differences
  const diffResults = results.filter((r) => r.status !== 'MATCH' && r.status !== 'ERROR');
  if (diffResults.length > 0) {
    console.log('Differences:');
    console.log('-'.repeat(70));
    console.log(
      'Customer ID'.padEnd(20) +
      'Name'.padEnd(25) +
      'Stored'.padStart(12) +
      'Ledger'.padStart(12) +
      'Diff'.padStart(12)
    );
    console.log('-'.repeat(70));
    for (const r of diffResults) {
      console.log(
        String(r.id).padEnd(20) +
        String(r.name).substring(0, 24).padEnd(25) +
        r.storedBalance.toLocaleString().padStart(12) +
        r.ledgerBalance.toLocaleString().padStart(12) +
        (r.difference > 0 ? '+' : '') + r.difference.toLocaleString().padStart(12)
      );
    }
    console.log('');
  }

  // 5. Show errors
  const errResults = results.filter((r) => r.status === 'ERROR');
  if (errResults.length > 0) {
    console.log('Errors:');
    console.log('-'.repeat(70));
    for (const r of errResults) {
      console.log(`  ${r.id} (${r.name}): ${r.error}`);
    }
    console.log('');
  }

  // 6. CUST-0001 special check
  const cust1 = results.find((r) => r.id === 'CUST-0001');
  if (cust1) {
    console.log('='.repeat(70));
    console.log('CUST-0001 (Acme LTD) Verification:');
    console.log(`  Stored balance before: ${cust1.storedBalance.toLocaleString()}`);
    console.log(`  Authoritative balance: ${cust1.ledgerBalance.toLocaleString()}`);
    console.log(`  Status: ${cust1.status === 'MATCH' ? '✓ MATCHING' : '✗ DIFFERENT'}`);
    console.log('='.repeat(70));
  }

  console.log(`\n${DRY_RUN ? 'DRY RUN — no changes were made.' : 'Recomputation complete.'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
