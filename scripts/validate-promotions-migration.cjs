/**
 * Prime ERP — Promotion Engine migration validator
 *
 * Statically validates `database/supabase-promotions-engine.sql` before it is
 * applied to a Supabase project. Catches the common failure modes:
 *   • unbalanced parentheses / quotes / dollar-quoted blocks
 *   • unterminated top-level statements (missing `;`)
 *   • missing required objects (table, function, RLS, realtime publication)
 *
 * Usage:
 *   node scripts/validate-promotions-migration.cjs
 *   node scripts/validate-promotions-migration.cjs [path-to-sql]
 *
 * Exit code 0 = valid, 1 = validation failed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const sqlPath = process.argv[2] || path.join(__dirname, '..', 'database', 'supabase-promotions-engine.sql');

const problems = [];
const requiredTokens = [
  ['promotion_redemptions table', 'CREATE TABLE public.promotion_redemptions'],
  ['atomic usage RPC', 'CREATE OR REPLACE FUNCTION public.apply_promotion_usage'],
  ['redemptions RLS', 'promotion_redemptions ENABLE ROW LEVEL SECURITY'],
  ['RLS helper policy', 'get_current_company_id()'],
  ['realtime: redemptions', 'ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_redemptions'],
  ['realtime: promotions', 'ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_promotions'],
  ['column: channel', 'ADD COLUMN IF NOT EXISTS channel'],
  ['column: status', 'ADD COLUMN IF NOT EXISTS status'],
  ['column: priority', 'ADD COLUMN IF NOT EXISTS priority'],
  ['column: stackable', 'ADD COLUMN IF NOT EXISTS stackable'],
  ['column: is_auto_apply', 'ADD COLUMN IF NOT EXISTS is_auto_apply'],
  ['column: customer_scope', 'ADD COLUMN IF NOT EXISTS customer_scope'],
  ['column: applicable_to', 'ADD COLUMN IF NOT EXISTS applicable_to'],
  ['column: paused_at', 'ADD COLUMN IF NOT EXISTS paused_at'],
  ['column: cancelled_at', 'ADD COLUMN IF NOT EXISTS cancelled_at'],
  ['company-scoped unique code', 'uq_engagement_promotions_company_code'],
  ['idempotency guard', 'uq_promotion_redemption_source'],
  ['usage limit check', 'usage_limit'],
  ['per-customer limit check', 'per_customer_limit'],
  ['row lock', 'FOR UPDATE'],
];

function validate() {
  let sql;
  try {
    sql = fs.readFileSync(sqlPath, 'utf8');
  } catch (err) {
    console.error(`✗ Cannot read migration file: ${sqlPath}\n  ${err.message}`);
    process.exit(1);
  }

  const lines = sql.split('\n');
  let inDollar = false;
  let inString = false;
  let parenDepth = 0;
  let statement = null; // { keyword, startLine, terminated }
  let dollarCount = 0;
  let statementCount = 0;

  const flushStatement = (lineNo) => {
    if (!statement) return;
    statementCount += 1;
    if (!statement.terminated) {
      problems.push(`line ${statement.startLine}: unterminated ${statement.keyword} statement (missing ';')`);
    }
    statement = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Skip full-line comments and blanks (still flush a pending statement terminator).
    if (trimmed.startsWith('--') || trimmed === '') {
      if (trimmed.endsWith(';')) flushStatement(lineNo);
      continue;
    }

    // Start a new top-level statement when we see a known DDL/DML keyword.
    if (!statement && /^(CREATE|DROP|ALTER|GRANT|REVOKE|COMMENT|UPDATE|INSERT|DO)\b/i.test(trimmed)) {
      statement = { keyword: trimmed.split(/\s+/).slice(0, 2).join(' '), startLine: lineNo, terminated: false };
    }

    for (let c = 0; c < line.length; c += 1) {
      const ch = line[c];
      if (inDollar) {
        if (ch === '$' && line[c + 1] === '$') {
          inDollar = false;
          dollarCount += 1;
          c += 1;
        }
        continue;
      }
      if (inString) {
        if (ch === "'") inString = false;
        continue;
      }
      if (ch === '$' && line[c + 1] === '$') {
        inDollar = true;
        dollarCount += 1;
        c += 1;
        continue;
      }
      if (ch === "'") {
        inString = true;
        continue;
      }
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth -= 1;
      else if (ch === ';' && parenDepth === 0 && statement) {
        statement.terminated = true;
        flushStatement(lineNo);
      }
    }
  }
  // Flush any statement left open at EOF.
  flushStatement(lines.length);

  // Structural checks.
  if (inDollar) problems.push('unterminated dollar-quoted block (missing closing $$)');
  if (dollarCount % 2 !== 0) problems.push(`odd number of dollar-quote markers (${dollarCount})`);
  if (inString) problems.push('unterminated single-quoted string');
  if (parenDepth !== 0) problems.push(`unbalanced parentheses (depth ${parenDepth} at EOF)`);
  if (statementCount === 0) problems.push('no statements detected');

  // Required-object checks.
  for (const [label, token] of requiredTokens) {
    if (!sql.includes(token)) problems.push(`missing required ${label} (${token})`);
  }

  if (problems.length === 0) {
    console.log(`✓ ${path.basename(sqlPath)} is valid: ${statementCount} statements, ${dollarCount} dollar-quote delimiters, balanced parens/quotes.`);
    process.exit(0);
  }

  console.error(`✗ ${path.basename(sqlPath)} has ${problems.length} problem(s):`);
  for (const p of problems) console.error(`   • ${p}`);
  process.exit(1);
}

validate();
