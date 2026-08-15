export interface ExaminationSubjectRecord {
  id?: string;
  subject_name?: string;
  name?: string;
  pages?: number;
  extra_copies?: number;
}

export interface ExaminationClassRecord {
  id?: string;
  class_name?: string;
  number_of_learners?: number;
  is_manual_override?: number | boolean;
  manual_cost_per_learner?: number | null;
  expected_fee_per_learner?: number;
  final_fee_per_learner?: number;
  live_total_preview?: number;
  total_pages?: number;
  total_sheets?: number;
  total_bom_cost?: number;
  total_adjustments?: number;
  total_cost?: number;
  subjects?: ExaminationSubjectRecord[];
}

export interface ExaminationBatchRecord {
  id: string;
  name?: string;
  school_id?: string;
  exam_type?: string;
  currency?: string;
  status?: string;
  total_amount?: number;
  classes?: ExaminationClassRecord[];
  approvals?: unknown;
  invoice?: unknown;
  created_at: string;
  updated_at: string;
}

export interface ExaminationRepository {
  createBatch(batch: Omit<ExaminationBatchRecord, 'created_at' | 'updated_at'>): Promise<ExaminationBatchRecord>;
  getBatchById(id: string): Promise<ExaminationBatchRecord | null>;
  getAllBatches(): Promise<ExaminationBatchRecord[]>;
  updateBatch(id: string, patch: Partial<ExaminationBatchRecord>): Promise<ExaminationBatchRecord>;
  saveCalculationResults(
    id: string,
    payload: {
      classes: ExaminationClassRecord[];
      total_amount: number;
      status: string;
    }
  ): Promise<ExaminationBatchRecord>;
}

const cloneRecord = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const nowIso = () => new Date().toISOString();

export interface PostgreSqlQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface PostgreSqlQueryExecutor {
  query<Row = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<PostgreSqlQueryResult<Row>>;
}

interface ExaminationBatchRow {
  id: string;
  name: string | null;
  school_id: string | null;
  exam_type: string | null;
  currency: string | null;
  status: string | null;
  total_amount: number | null;
  classes_json: ExaminationClassRecord[] | string | null;
  approvals_json: unknown;
  invoice_json: unknown;
  created_at: string;
  updated_at: string;
}

const parseJsonField = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

const mapRowToBatchRecord = (row: ExaminationBatchRow): ExaminationBatchRecord => ({
  id: String(row.id),
  name: row.name ?? undefined,
  school_id: row.school_id ?? undefined,
  exam_type: row.exam_type ?? undefined,
  currency: row.currency ?? undefined,
  status: row.status ?? undefined,
  total_amount: Number(row.total_amount ?? 0),
  classes: parseJsonField<ExaminationClassRecord[]>(row.classes_json, []),
  approvals: parseJsonField<unknown>(row.approvals_json, null),
  invoice: parseJsonField<unknown>(row.invoice_json, null),
  created_at: String(row.created_at),
  updated_at: String(row.updated_at)
});

export class PostgreSqlExaminationRepository implements ExaminationRepository {
  constructor(private readonly db: PostgreSqlQueryExecutor) {}

  async createBatch(
    batch: Omit<ExaminationBatchRecord, 'created_at' | 'updated_at'>
  ): Promise<ExaminationBatchRecord> {
    const sql = `
      INSERT INTO examination_batches (
        id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10::jsonb
      )
      RETURNING id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json, created_at, updated_at
    `;
    const params = [
      batch.id,
      batch.name ?? null,
      batch.school_id ?? null,
      batch.exam_type ?? null,
      batch.currency ?? null,
      batch.status ?? null,
      batch.total_amount ?? 0,
      JSON.stringify(batch.classes ?? []),
      JSON.stringify(batch.approvals ?? null),
      JSON.stringify(batch.invoice ?? null)
    ];
    const result = await this.db.query<ExaminationBatchRow>(sql, params);
    if (result.rowCount === 0) {
      throw new Error('Failed to create examination batch');
    }
    return mapRowToBatchRecord(result.rows[0]);
  }

  async getBatchById(id: string): Promise<ExaminationBatchRecord | null> {
    const result = await this.db.query<ExaminationBatchRow>(
      `
      SELECT id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json, created_at, updated_at
      FROM examination_batches
      WHERE id = $1
      `,
      [id]
    );
    if (result.rowCount === 0) return null;
    return mapRowToBatchRecord(result.rows[0]);
  }

  async getAllBatches(): Promise<ExaminationBatchRecord[]> {
    const result = await this.db.query<ExaminationBatchRow>(
      `
      SELECT id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json, created_at, updated_at
      FROM examination_batches
      ORDER BY created_at DESC
      `
    );
    return result.rows.map(mapRowToBatchRecord);
  }

  async updateBatch(id: string, patch: Partial<ExaminationBatchRecord>): Promise<ExaminationBatchRecord> {
    const sql = `
      UPDATE examination_batches
      SET
        name = COALESCE($2, name),
        school_id = COALESCE($3, school_id),
        exam_type = COALESCE($4, exam_type),
        currency = COALESCE($5, currency),
        status = COALESCE($6, status),
        total_amount = COALESCE($7, total_amount),
        classes_json = COALESCE($8::jsonb, classes_json),
        approvals_json = COALESCE($9::jsonb, approvals_json),
        invoice_json = COALESCE($10::jsonb, invoice_json),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json, created_at, updated_at
    `;
    const params = [
      id,
      patch.name ?? null,
      patch.school_id ?? null,
      patch.exam_type ?? null,
      patch.currency ?? null,
      patch.status ?? null,
      patch.total_amount ?? null,
      patch.classes ? JSON.stringify(patch.classes) : null,
      patch.approvals !== undefined ? JSON.stringify(patch.approvals) : null,
      patch.invoice !== undefined ? JSON.stringify(patch.invoice) : null
    ];
    const result = await this.db.query<ExaminationBatchRow>(sql, params);
    if (result.rowCount === 0) {
      throw new Error(`Examination batch "${id}" not found`);
    }
    return mapRowToBatchRecord(result.rows[0]);
  }

  async saveCalculationResults(
    id: string,
    payload: { classes: ExaminationClassRecord[]; total_amount: number; status: string }
  ): Promise<ExaminationBatchRecord> {
    const result = await this.db.query<ExaminationBatchRow>(
      `
      UPDATE examination_batches
      SET
        classes_json = $2::jsonb,
        total_amount = $3,
        status = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, school_id, exam_type, currency, status, total_amount,
        classes_json, approvals_json, invoice_json, created_at, updated_at
      `,
      [id, JSON.stringify(payload.classes || []), payload.total_amount, payload.status]
    );
    if (result.rowCount === 0) {
      throw new Error(`Examination batch "${id}" not found`);
    }
    return mapRowToBatchRecord(result.rows[0]);
  }
}

export class InMemoryExaminationRepository implements ExaminationRepository {
  private readonly records = new Map<string, ExaminationBatchRecord>();

  async createBatch(
    batch: Omit<ExaminationBatchRecord, 'created_at' | 'updated_at'>
  ): Promise<ExaminationBatchRecord> {
    const createdAt = nowIso();
    const saved: ExaminationBatchRecord = {
      ...cloneRecord(batch),
      created_at: createdAt,
      updated_at: createdAt
    };
    this.records.set(saved.id, saved);
    return cloneRecord(saved);
  }

  async getBatchById(id: string): Promise<ExaminationBatchRecord | null> {
    const found = this.records.get(String(id));
    return found ? cloneRecord(found) : null;
  }

  async getAllBatches(): Promise<ExaminationBatchRecord[]> {
    return Array.from(this.records.values()).map((record) => cloneRecord(record));
  }

  async updateBatch(id: string, patch: Partial<ExaminationBatchRecord>): Promise<ExaminationBatchRecord> {
    const existing = this.records.get(String(id));
    if (!existing) {
      throw new Error(`Examination batch "${id}" not found`);
    }
    const updated: ExaminationBatchRecord = {
      ...existing,
      ...cloneRecord(patch),
      id: existing.id,
      created_at: existing.created_at,
      updated_at: nowIso()
    };
    this.records.set(updated.id, updated);
    return cloneRecord(updated);
  }

  async saveCalculationResults(
    id: string,
    payload: { classes: ExaminationClassRecord[]; total_amount: number; status: string }
  ): Promise<ExaminationBatchRecord> {
    return this.updateBatch(id, {
      classes: payload.classes,
      total_amount: payload.total_amount,
      status: payload.status
    });
  }
}
