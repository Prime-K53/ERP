/**
 * Database Migration: BOM Default Materials Configuration
 * 
 * This migration adds support for flexible product matching in the examination module.
 * It creates the bom_default_materials table and seeds it with default configurations
 * for paper and toner products.
 * 
 * Run with: node server/migrations/add_bom_default_materials.cjs
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../examination.db');
const db = new sqlite3.Database(dbPath);

// Default configurations for examination materials
const DEFAULT_CONFIGS = [
  {
    id: 'BOM-PAPER-DEFAULT',
    material_type: 'paper',
    match_criteria: JSON.stringify({
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
    })
  },
  {
    id: 'BOM-TONER-DEFAULT',
    material_type: 'toner',
    match_criteria: JSON.stringify({
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
    })
  }
];

// SQL statements
const CREATE_TABLE = `
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

const CREATE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_bom_default_materials_type 
  ON bom_default_materials(material_type)
`;

const INSERT_CONFIG = `
  INSERT OR REPLACE INTO bom_default_materials 
  (id, material_type, match_criteria, created_at, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`;

// Run migration
db.serialize(() => {
  console.log('Starting BOM Default Materials migration...');

  // Create table
  db.run(CREATE_TABLE, (err) => {
    if (err) {
      console.error('Error creating table:', err);
      return;
    }
    console.log('✓ Created bom_default_materials table');

    // Create index
    db.run(CREATE_INDEX, (err) => {
      if (err) {
        console.error('Error creating index:', err);
        return;
      }
      console.log('✓ Created index on material_type');

      // Insert default configurations
      let inserted = 0;
      DEFAULT_CONFIGS.forEach((config) => {
        db.run(
          INSERT_CONFIG,
          [config.id, config.material_type, config.match_criteria],
          (err) => {
            if (err) {
              console.error(`Error inserting ${config.material_type} config:`, err);
            } else {
              console.log(`✓ Inserted default configuration for ${config.material_type}`);
              inserted++;
            }

            // Close database when all inserts complete
            if (inserted === DEFAULT_CONFIGS.length) {
              console.log('\n✓ Migration completed successfully!');
              db.close();
            }
          }
        );
      });
    });
  });
});

// Handle errors
db.on('error', (err) => {
  console.error('Database error:', err);
});
