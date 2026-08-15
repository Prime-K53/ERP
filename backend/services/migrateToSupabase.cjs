const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'backend', 'services', 'examinationService.cjs');
const outputFile = path.join(__dirname, 'backend', 'services', 'examinationService.cjs.migrated.cjs');

let content = fs.readFileSync(inputFile, 'utf8');

// 1. Replace imports
content = content.replace(
  "const { getDatabase } = require('../db.cjs');\nconst getDb = () => getDatabase();",
  "const repo = require('./supabaseRepository.cjs');"
);

// 2. Remove helper functions (runQuery, runGet, runRun, all, addColumnIfMissing)
// We'll remove from line 19 to line 81 (the helper functions block)
const helperStart = content.indexOf('// Helper to run DB queries as promises');
const helperEnd = content.indexOf('\nconst toBoolean =');
if (helperStart !== -1 && helperEnd !== -1) {
  content = content.substring(0, helperStart) + content.substring(helperEnd);
}

// 3. Remove addColumnIfMissing function
content = content.replace(
  /const addColumnIfMissing = async \(tableName, columnName, columnType\) => \{[\s\S]*?\};\n/,
  ''
);

// 4. Remove getTableColumnSet and related cache variables (they rely on PRAGMA)
// We need to keep the function but make it a no-op or return empty set
content = content.replace(
  /const tableColumnCache = new Map\(\);\nconst tableExistsCache = new Map\(\);\n/,
  'const tableColumnCache = new Map();\nconst tableExistsCache = new Map();\n'
);

content = content.replace(
  /const getTableColumnSet = async \(tableName\) => \{[\s\S]*?return columnSet;\n\};\n/,
  `const getTableColumnSet = async (tableName) => {
    const normalizedTable = String(tableName || '').trim().toLowerCase();
    if (!normalizedTable) return new Set();
    if (tableColumnCache.has(normalizedTable)) {
      return tableColumnCache.get(normalizedTable);
    }
    const columnSet = new Set();
    tableColumnCache.set(normalizedTable, columnSet);
    return columnSet;
  };\n`
);

content = content.replace(
  /const tableExists = async \(tableName\) => \{[\s\S]*?return exists;\n\};\n/,
  `const tableExists = async (tableName) => {
    const normalizedTable = String(tableName || '').trim().toLowerCase();
    if (!normalizedTable) return false;
    if (tableExistsCache.has(normalizedTable)) {
      return tableExistsCache.get(normalizedTable);
    }
    const exists = true;
    tableExistsCache.set(normalizedTable, exists);
    return exists;
  };\n`
);

content = content.replace(
  /const clearTableCache = \(tableName\) => \{[\s\S]*?tableColumnCache\.clear\(\);\n\};\n/,
  `const clearTableCache = (tableName) => {
    if (tableName) {
      const normalized = String(tableName).trim().toLowerCase();
      tableColumnCache.delete(normalized);
      tableExistsCache.delete(normalized);
    } else {
      tableColumnCache.clear();
      tableExistsCache.clear();
    }
  };\n`
);

// 5. Replace ensureColumnIfMissing with no-op
content = content.replace(
  /const ensureColumnIfMissing = async \(tableName, columnName, definition\) => \{[\s\S]*?console\.log\(`\[Schema\] Adding missing column \$\{normalizedCol\} to \$\{tableName\}`\);\n[\s\S]*?\};\n/,
  `const ensureColumnIfMissing = async (tableName, columnName, definition) => {
  };\n`
);

// 6. Replace schema functions with no-ops
const schemaFunctions = [
  'ensureCoreExaminationSchema',
  'ensureNotificationSchema',
  'ensureExaminationSyncSchema',
  'ensureExaminationPricingSchema',
  'ensureExaminationInvoiceSchema'
];

for (const fn of schemaFunctions) {
  const regex = new RegExp(`const ${fn} = async \\(\\) => \\{[\\s\\S]*?return ensure\\w+SchemaPromise;\n\\};`, 'g');
  content = content.replace(regex, `const ${fn} = async () => {
  };\n`);
}

console.log('Basic replacements done. Writing intermediate file...');
fs.writeFileSync(outputFile, content);
console.log('Intermediate file written to:', outputFile);
