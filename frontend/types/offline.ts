export type BatchSyncStatus = 'pending' | 'synced' | 'failed' | 'blocked';

export interface BatchSubjectRecord {
  id: string;
  name?: string;
  subject_name?: string;
  pages?: number;
  extra_copies?: number;
  total_pages?: number;
  total_sheets?: number;
  [key: string]: unknown;
}

export interface BatchClassRecord {
  id: string;
  name?: string;
  class_name?: string;
  number_of_learners?: number;
  expected_fee_per_learner?: number;
  final_fee_per_learner?: number;
  live_total_preview?: number;
  material_total_cost?: number;
  adjustment_total_cost?: number;
  calculated_total_cost?: number;
  subjects?: BatchSubjectRecord[];
  [key: string]: unknown;
}

export interface BatchRecord {
  id: string;
  batch_number?: string;
  batchNumber?: string;
  school_id?: string;
  customerId?: string;
  name?: string;
  academic_year?: string;
  term?: string;
  exam_type?: string;
  type?: string;
  parent_batch_id?: string;
  status?: string;
  currency?: string;
  total_amount?: number;
  material_total?: number;
  adjustment_total?: number;
  created_at?: string;
  updated_at?: string;
  classes?: BatchClassRecord[];
  subjects?: BatchSubjectRecord[];
  pricing_settings_snapshot?: Record<string, unknown>;
  pricing_lock?: Record<string, unknown>;
  _offline?: boolean;
  _syncStatus?: BatchSyncStatus;
  _lastSyncedAt?: string;
  _lastModifiedAt?: string;
  [key: string]: unknown;
}

export interface OfflineState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  pendingMutations: number;
  authBlocked: boolean;
  cacheReady: boolean;
  reason?: string;
}
