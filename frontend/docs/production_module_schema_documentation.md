# Production Module Schema Documentation

## Overview

This document provides comprehensive documentation for the production module schema, which mirrors the examination module structure but adapted for production workflows in the ERP system.

## Architecture Pattern

The production module follows the **Module Cloning Pattern**, adapting the existing examination module to create a similar but context-specific module for production workflows.

### Key Design Principles

1. **Structural Parity**: Maintains the same table structure and relationships as the examination module
2. **Context Adaptation**: Replaces educational examination concepts with production equivalents
3. **Integration-First**: Designed to integrate seamlessly with existing production tables
4. **Audit Trail**: Maintains comprehensive audit logging and tracking
5. **Performance-Optimized**: Includes proper indexes for query performance

## Core Entity Mappings

### 1. Production Batches ↔ Examination Batches

**Purpose**: Represents production batches linked to work orders instead of schools.

**Key Differences**:
- `school_id` → `work_order_id`
- `academic_year` → `production_year`
- `term` → `production_term`
- `exam_type` → `batch_type` (with enum: Production, Job, Run, Batch)

**Table Structure**:
```sql
production_batches (
    id VARCHAR(50) PRIMARY KEY,
    work_order_id VARCHAR(50) NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    batch_name VARCHAR(255) NOT NULL,
    batch_type VARCHAR(50) DEFAULT 'Production' CHECK (batch_type IN ('Production', 'Job', 'Run', 'Batch')),
    production_year VARCHAR(20) NOT NULL,
    production_term VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Approved', 'Invoiced')),
    total_amount NUMERIC(15, 2) DEFAULT 0,
    calculated_material_total NUMERIC(15, 2) DEFAULT 0,
    calculated_adjustment_total NUMERIC(15, 2) DEFAULT 0,
    planned_quantity INTEGER DEFAULT 0,
    completed_quantity INTEGER DEFAULT 0,
    calculated_cost_per_unit NUMERIC(15, 2) DEFAULT 0,
    -- ... additional fields
)
```

### 2. Production Classes ↔ Examination Classes

**Purpose**: Represents production classes/lines within a batch, using planned quantity instead of learner count.

**Key Differences**:
- `number_of_learners` → `planned_quantity`
- Focus on production quantities rather than learner counts
- Maintains same financial tracking structure

**Table Structure**:
```sql
production_classes (
    id VARCHAR(50) PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
    class_name VARCHAR(120) NOT NULL,
    planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
    suggested_cost_per_unit NUMERIC(15, 2) DEFAULT 0,
    manual_cost_per_unit NUMERIC(15, 2),
    is_manual_override BOOLEAN DEFAULT FALSE,
    -- ... additional fields
)
```

### 3. Production Subjects ↔ Examination Subjects

**Purpose**: Represents product variants/components within a class.

**Key Differences**:
- Links to `product_variants` instead of being standalone
- Includes `variant_id` foreign key for direct product variant reference
- Maintains material calculation structure

**Table Structure**:
```sql
production_subjects (
    id VARCHAR(50) PRIMARY KEY,
    class_id VARCHAR(50) NOT NULL REFERENCES production_classes(id) ON DELETE CASCADE,
    subject_name VARCHAR(120) NOT NULL,
    variant_id VARCHAR(50) REFERENCES product_variants(id) ON DELETE SET NULL,
    variant_name VARCHAR(255),
    quantity_required NUMERIC(15, 4) NOT NULL,
    unit_cost NUMERIC(15, 4) NOT NULL,
    total_cost NUMERIC(15, 2) NOT NULL,
    pages INTEGER CHECK (pages >= 0),
    extra_copies INTEGER DEFAULT 0 CHECK (extra_copies >= 0),
    -- ... additional fields
)
```

## Table Relationships

### Primary Relationships

```
work_orders (existing table)
    ↓ (1:N)
production_batches
    ↓ (1:N)
production_classes
    ↓ (1:N)
production_subjects

market_adjustments (existing table)
    ↓ (1:N)
production_class_adjustments
    ↓ (1:N)
production_bom_calculations

product_variants (existing table)
    ↓ (1:N)
production_subjects
```

### Secondary Relationships

```
production_batches
    ↓ (1:N)
production_pricing_audit

production_batches
    ↓ (1:N)
production_batch_notifications

production_batch_notifications
    ↓ (1:N)
production_notification_audit_logs

production_bom_templates
    ↓ (1:N)
production_bom_template_components
```

## Field-by-Field Mapping

### Core Fields

| Examination Field | Production Equivalent | Notes |
|-------------------|----------------------|-------|
| `school_id` | `work_order_id` | Links to work_orders table |
| `academic_year` | `production_year` | Production-specific year field |
| `term` | `production_term` | Production-specific term field |
| `exam_type` | `batch_type` | Enum: Production, Job, Run, Batch |
| `expected_candidature` | `planned_quantity` | Production quantity instead of learner count |
| `number_of_learners` | `planned_quantity` | In production_classes table |

### Financial Fields (Identical Structure)

Both modules maintain identical financial tracking fields:
- `suggested_cost_per_unit`
- `manual_cost_per_unit`
- `is_manual_override`
- `manual_override_reason`
- `manual_override_by`
- `manual_override_at`
- `calculated_total_cost`
- `material_total_cost`
- `adjustment_total_cost`
- `adjustment_delta_percent`
- `cost_last_calculated_at`
- `unit_price`
- `total_price`

### Audit Fields (Identical Structure)

Both modules maintain identical audit tracking:
- `created_at`
- `updated_at`
- User tracking fields for overrides
- Timestamps for calculations

## Integration Points

### With Existing Production Tables

#### 1. Work Orders Integration

```sql
-- production_batches.work_order_id
-- Foreign key to work_orders.id
-- CASCADE DELETE: When work order is deleted, all production batches are deleted
```

**Use Case**: Link production batches to specific work orders for tracking production costs against work orders.

#### 2. Product Variants Integration

```sql
-- production_subjects.variant_id
-- Foreign key to product_variants.id
-- SET NULL: When product variant is deleted, variant_id becomes NULL
```

**Use Case**: Reference specific product variants in production calculations.

#### 3. Market Adjustments Integration

```sql
-- production_class_adjustments.adjustment_id
-- Foreign key to market_adjustments.id
-- CASCADE DELETE: When market adjustment is deleted, related adjustments are deleted
```

**Use Case**: Apply the same market adjustment rules to production costs as sales.

### With Existing BOM Tables

#### 4. BOM Templates Integration

The production module includes its own BOM template system:

```sql
production_bom_templates
    ↓ (1:N)
production_bom_template_components
```

**Use Case**: Create reusable BOM templates for common production runs.

## Workflow Adaptations

### Examination Workflow

1. **Batch Creation** → School selects exam type and candidates
2. **Class Creation** → Classes are created for each grade/section
3. **Subject Addition** → Subjects are added to each class with page counts
4. **Calculation** → BOM calculations are performed using inventory costs
5. **Adjustments** → Market adjustments are applied
6. **Approval** → Batch is approved for invoicing
7. **Invoicing** → Invoice is generated for the school

### Production Workflow (Adapted)

1. **Batch Creation** → Work order is linked to production batch
2. **Class Creation** → Production classes/lines are created with planned quantities
3. **Subject/Variant Addition** → Product variants are added with quantities
4. **Calculation** → BOM calculations are performed using inventory costs
5. **Adjustments** → Market adjustments are applied
6. **Approval** → Batch is approved for invoicing
7. **Invoicing** → Invoice is generated for the work order/customer

## Key Differences in Operations

### 1. Quantity Tracking

**Examination**:
- Tracks `number_of_learners` per class
- Learners are the unit of measure

**Production**:
- Tracks `planned_quantity` and `completed_quantity` per class
- Units are production units (e.g., sheets, prints, items)

### 2. Customer Context

**Examination**:
- Customer is a school
- School-specific pricing and relationships

**Production**:
- Customer is the work order's customer
- Work order-specific pricing and relationships

### 3. Time Periods

**Examination**:
- Uses `academic_year` and `term` (e.g., 2025, Term 1)

**Production**:
- Uses `production_year` and `production_term` (e.g., 2025, Term 1)

### 4. Batch Types

**Examination**:
- Single exam type per batch

**Production**:
- Multiple batch types: Production, Job, Run, Batch
- Allows categorization of different production scenarios

## Index Strategy

### Performance-Optimized Indexes

1. **Batch Indexes**:
   - `idx_production_batches_work_order` - For work order queries
   - `idx_production_batches_status` - For status-based filtering
   - `idx_production_batches_year_term` - For period-based queries
   - `idx_production_batches_invoice` - For invoice lookups

2. **Class Indexes**:
   - `idx_production_classes_batch` - For batch-level queries
   - `idx_production_classes_name` - For name-based searches

3. **Subject Indexes**:
   - `idx_production_subjects_class` - For class-level queries
   - `idx_production_subjects_variant` - For variant lookups

4. **Calculation Indexes**:
   - `idx_production_bom_batch_class` - For cost breakdown queries
   - `idx_production_bom_item` - For item-level queries

5. **Adjustment Indexes**:
   - `idx_production_class_adjustments_batch` - For batch adjustment queries
   - `idx_production_class_adjustments_class` - For class adjustment queries
   - `idx_production_class_adjustments_adjustment` - For adjustment lookups

6. **Audit Indexes**:
   - `idx_production_pricing_audit_batch` - For batch audit queries
   - `idx_production_pricing_audit_class` - For class audit queries
   - `idx_production_pricing_audit_event` - For event-type filtering

7. **Notification Indexes**:
   - `idx_production_notifications_batch` - For batch notifications
   - `idx_production_notifications_user` - For user notification queries
   - `idx_production_notifications_created` - For time-based queries
   - `idx_production_notifications_is_read` - For read status filtering

8. **Template Indexes**:
   - `idx_production_bom_templates_active` - For active template queries
   - `idx_production_bom_template_components_template` - For template component queries

## Data Integrity Constraints

### Foreign Key Constraints

1. **Cascade Deletes**:
   - `production_batches` → `work_orders` (CASCADE)
   - `production_classes` → `production_batches` (CASCADE)
   - `production_subjects` → `production_classes` (CASCADE)
   - `production_bom_calculations` → `production_batches` (CASCADE)
   - `production_class_adjustments` → `production_batches` (CASCADE)

2. **Set Null Deletes**:
   - `production_subjects` → `product_variants` (SET NULL)
   - `production_notification_audit_logs` → `production_batch_notifications` (SET NULL)

### Check Constraints

- `planned_quantity > 0` in production_classes
- `quantity_required >= 0` in production_subjects
- `extra_copies >= 0` in production_subjects
- `pages >= 0` in production_subjects
- Status enum values in all status fields
- Adjustment type enum values in adjustment tables

## Security and Compliance

### Data Access

1. **User Identification**:
   - All operations logged with `user_id`
   - Manual overrides tracked with `manual_override_by`

2. **Audit Trail**:
   - Complete pricing audit history
   - Notification audit logs
   - Timestamps for all modifications

3. **Permission Controls**:
   - Manual override permissions controlled by authorization logic
   - Status transitions validated by business rules

### Compliance

- GDPR: Audit logs with timestamps and user tracking
- Audit Trail: Complete history of all pricing changes
- Data Retention: Timestamp-based expiration for notifications

## Migration Strategy

### Execution Order

1. Create all tables in dependency order
2. Create all indexes
3. Add foreign key constraints
4. Verify table creation
5. Verify index creation

### Rollback Procedure

1. Drop foreign key constraints
2. Drop all indexes
3. Drop all tables (in reverse dependency order)

### Migration Script

Run with: `node database/migrate_production_schema.cjs`

Features:
- Checks if migration already run
- Executes all SQL statements
- Verifies table and index creation
- Provides detailed progress output

## Future Enhancements

### Potential Additions

1. **Production Templates**: Pre-configured production batches for common scenarios
2. **Batch Templates**: Reusable batch structures
3. **Versioning**: Track changes to production batches over time
4. **Approval Workflows**: Multi-level approval for production batches
5. **Budget Tracking**: Compare planned vs actual costs
6. **Waste Tracking**: Track material waste in production
7. **Quality Control**: Integration with quality inspection data
8. **Production Scheduling**: Integration with production scheduling system

### Scalability Considerations

1. **Partitioning**: Consider partitioning by production_year for large datasets
2. **Archiving**: Archive old production batches (e.g., > 2 years)
3. **Materialized Views**: Create views for common query patterns
4. **Query Optimization**: Monitor slow queries and add indexes as needed

## Summary

The production module schema provides a robust, production-ready implementation that mirrors the examination module's proven architecture while adapting it for production workflows. Key strengths include:

- **Structural Parity**: Same table structure and relationships
- **Context Adaptation**: Production-specific fields and workflows
- **Integration-First**: Seamless integration with existing ERP tables
- **Audit Trail**: Comprehensive tracking and compliance
- **Performance**: Optimized indexes for common query patterns
- **Data Integrity**: Strong constraints and relationships

This schema forms the foundation for the production module implementation, enabling consistent, reliable production cost tracking and management within the ERP system.
