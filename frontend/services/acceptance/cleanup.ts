// Post-run cleanup: hard-delete acceptance-tagged cloud rows, remove storage
// objects and close the run. Also verifies the cloud is clean afterwards.

import { acceptanceApi } from './api';

const CLEANUP_TABLES = ['customers', 'invoices', 'files'];

export interface CleanupResult {
  ok: boolean;
  counts: Record<string, number>;
  filesRemoved: number;
  rowsRemoved: number;
  remaining: Record<string, number>;
}

export async function cleanupRun(runId: string): Promise<CleanupResult> {
  const storage = await acceptanceApi.verifyCloud(runId, '_storage');
  const filePaths = storage.rows.map((r) => String(r.name)).filter(Boolean);

  const result = await acceptanceApi.cleanup({ runId, tables: CLEANUP_TABLES, filePaths });

  const remaining: Record<string, number> = {};
  for (const table of CLEANUP_TABLES) {
    remaining[table] = (await acceptanceApi.verifyCloud(runId, table)).count;
  }
  remaining._storage = (await acceptanceApi.verifyCloud(runId, '_storage')).count;

  return {
    ok: Object.values(remaining).every((n) => n === 0),
    counts: CLEANUP_TABLES.reduce((acc, t) => ({ ...acc, [t]: remaining[t] }), {}),
    filesRemoved: Number(result.filesRemoved ?? 0),
    rowsRemoved: Number(result.rowsRemoved ?? 0),
    remaining,
  };
}