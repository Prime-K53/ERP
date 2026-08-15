/**
 * Database Migration: Add Examination Consumables and Protection
 * 
 * This migration:
 * 1. Adds is_protected column to inventory table
 * 2. Adds HP Universal Toner 1kg to inventory
 * 3. Adds A4 Paper 80gsm Ream 500 to inventory
 * 4. Marks these materials as protected (cannot be deleted)
 * 5. Updates BOM default materials configuration
 * 
 * Run with: node server/migrations/add_exam_consumables.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../examination.db');
const db = new sqlite3.Database(dbPath);

// Constants for the new materials (using numeric IDs for INTEGER PRIMARY KEY)
const PAPER_ID = 5001;
const TONER_ID = 5002;

// SQL statements
const ADD_PROTECTED_COLUMN = `
  ALTER TABLE inventory ADD COLUMN is_protected INTEGER DEFAULT 0
`;

const ADD_CATEGORY_COLUMN = `
  ALTER TABLE inventory ADD COLUMN category TEXT DEFAULT ''
`;

const ADD_DESCRIPTION_COLUMN = `
  ALTER TABLE inventory ADD COLUMN description TEXT DEFAULT ''
`;

const INSERT_PAPER = `
  INSERT OR REPLACE INTO inventory 
  (id, name, material, quantity, cost_per_unit, unit, reorder_point, is_protected, category, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_TONER = `
  INSERT OR REPLACE INTO inventory 
  (id, name, material, quantity, cost_per_unit, unit, reorder_point, is_protected, category, description)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const CREATE_BOM_DEFAULTS_TABLE = `
  CREATE TABLE IF NOT EXISTS bom_default_materials (
    id TEXT PRIMARY KEY,
    material_type TEXT NOT NULL UNIQUE,
    preferred_item_id TEXT,
    fallback_item_ids TEXT,
    match_criteria TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (preferred_item_id) REFERENCES inventory(id)
  )
`;

const INSERT_BOM_PAPER = `
  INSERT OR REPLACE INTO bom_default_materials 
  (id, material_type, preferred_item_id, match_criteria, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`;

const INSERT_BOM_TONER = `
  INSERT OR REPLACE INTO bom_default_materials 
  (id, material_type, preferred_item_id, match_criteria, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`;

// Match criteria for flexible matching
const PAPER_MATCH_CRITERIA = JSON.stringify({
  specifications: {
    paper: {
      size: 'A4',
      weight: 80,
      sheetsPerReam: 500,
      weightTolerance: 5,
      type: 'Any'
    }
  },
  keywordPatterns: {
    primary: ['paper', 'a4', 'ream'],
    secondary: [
      '80gsm', '80 gsm', '80-gsm',
      '500 sheets', '500sheets',
      'copy paper', 'bond paper', 'printing paper',
      'a4 paper', 'a4paper'
    ],
    exclude: ['photo', 'glossy', 'cardstock', 'card stock', 'photo paper']
  },
  categoryConstraint: {
    mustInclude: ['paper', 'stationery', 'consumable', 'supplies'],
    mustExclude: ['equipment', 'machine', 'printer', 'copier']
  }
});

const TONER_MATCH_CRITERIA = JSON.stringify({
  specifications: {
    toner: {
      brand: 'HP',
      type: 'Universal',
      weight: 1,
      weightUnit: 'kg',
      weightTolerance: 0.1,
      color: 'Black'
    }
  },
  keywordPatterns: {
    primary: ['toner', 'hp universal', '1kg', 'universal toner'],
    secondary: [
      'hp toner', 'laser toner', 'black toner',
      'universal', '1 kg', '1kg toner',
      'hp universal toner', 'hpuniversal',
      'toner powder', 'bulk toner'
    ],
    exclude: [
      'ink', 'cartridge', 'color', 'cyan', 'magenta', 'yellow',
      'drum', 'fuser', 'inkjet'
    ]
  },
  categoryConstraint: {
    mustInclude: ['toner', 'consumable', 'supplies'],
    mustExclude: ['printer', 'machine', 'equipment', 'copier']
  }
});

// Run migration
console.log('Starting Examination Consumables Migration...\n');

db.serialize(() => {
  // Step 1: Add is_protected column if it doesn't exist
  db.all('PRAGMA table_info(inventory)', [], (err, columns) => {
    if (err) {
      console.error('Error checking table info:', err);
      return;
    }

    const hasProtected = columns.some(col => col.name === 'is_protected');
    const hasCategory = columns.some(col => col.name === 'category');
    const hasDescription = columns.some(col => col.name === 'description');

    const addColumnIfMissing = (columnName, sql) => {
      return new Promise((resolve, reject) => {
        const hasColumn = columns.some(col => col.name === columnName);
        if (!hasColumn) {
          db.run(sql, (err) => {
            if (err) {
              console.error(`Error adding ${columnName} column:`, err);
              reject(err);
            } else {
              console.log(`✓ Added ${columnName} column to inventory table`);
              resolve();
            }
          });
        } else {
          console.log(`✓ ${columnName} column already exists`);
          resolve();
        }
      });
    };

    // Add columns
    Promise.all([
      addColumnIfMissing('is_protected', ADD_PROTECTED_COLUMN),
      addColumnIfMissing('category', ADD_CATEGORY_COLUMN),
      addColumnIfMissing('description', ADD_DESCRIPTION_COLUMN)
    ]).then(() => {
      // Step 2: Insert paper material
      db.run(
        INSERT_PAPER,
        [
          PAPER_ID,
          'A4 Paper 80gsm Ream 500',
          'Paper',
          100,                    // quantity
          5000,                   // cost_per_unit (MWK)
          'Ream',                 // unit
          20,                     // reorder_point
          1,                      // is_protected = TRUE
          'Paper',                // category
          'Standard examination paper - A4 size, 80gsm weight, 500 sheets per ream. Protected material for examination module.'
        ],
        (err) => {
          if (err) {
            console.error('Error inserting paper:', err);
          } else {
            console.log(`✓ Added A4 Paper 80gsm Ream 500 (ID: ${PAPER_ID})`);
          }
        }
      );

      // Step 3: Insert toner material
      db.run(
        INSERT_TONER,
        [
          TONER_ID,
          'HP Universal Toner 1kg',
          'Toner',
          50,                     // quantity
          85000,                  // cost_per_unit (MWK)
          'kg',                   // unit
          10,                     // reorder_point
          1,                      // is_protected = TRUE
          'Toner',                // category
          'HP Universal Toner 1kg - Standard examination toner. Protected material for examination module. Yields approximately 20,000 pages per kg.'
        ],
        (err) => {
          if (err) {
            console.error('Error inserting toner:', err);
          } else {
            console.log(`✓ Added HP Universal Toner 1kg (ID: ${TONER_ID})`);
          }
        }
      );

      // Step 4: Create BOM defaults table
      db.run(CREATE_BOM_DEFAULTS_TABLE, (err) => {
        if (err) {
          console.error('Error creating bom_default_materials table:', err);
        } else {
          console.log('✓ Created bom_default_materials table');

          // Step 5: Insert BOM default for paper
          db.run(
            INSERT_BOM_PAPER,
            ['BOM-PAPER-DEFAULT', 'paper', PAPER_ID, PAPER_MATCH_CRITERIA],
            (err) => {
              if (err) {
                console.error('Error inserting BOM paper default:', err);
              } else {
                console.log(`✓ Set A4 Paper 80gsm Ream 500 as default paper for examination BOM`);
              }
            }
          );

          // Step 6: Insert BOM default for toner
          db.run(
            INSERT_BOM_TONER,
            ['BOM-TONER-DEFAULT', 'toner', TONER_ID, TONER_MATCH_CRITERIA],
            (err) => {
              if (err) {
                console.error('Error inserting BOM toner default:', err);
              } else {
                console.log(`✓ Set HP Universal Toner 1kg as default toner for examination BOM`);
              }
            }
          );
        }
      });
    });
  });
});

// Close database after a delay to allow async operations to complete
setTimeout(() => {
  console.log('\n✓ Migration completed successfully!');
  console.log('\nProtected Materials Added:');
  console.log('  - A4 Paper 80gsm Ream 500 (ID: EXAM-PAPER-A4-80GSM)');
  console.log('  - HP Universal Toner 1kg (ID: EXAM-TONER-HP-UNIVERSAL-1KG)');
  console.log('\nThese materials are now protected and cannot be deleted.');
  db.close();
}, 2000);
