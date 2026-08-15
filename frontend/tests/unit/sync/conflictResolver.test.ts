import { describe, it, expect } from 'vitest';
import { resolveConflict, fieldLevelMerge, resolvePushConflict } from '../../../services/syncConflictResolver';

describe('syncConflictResolver', () => {
  describe('resolveConflict', () => {
    it('should prefer higher version number', () => {
      const local = { id: '1', _version: 2, _updatedAt: '2026-01-01T00:00:00Z' };
      const remote = { id: '1', version: 1, updated_at: '2026-06-01T00:00:00Z' };
      expect(resolveConflict(local, remote)).toBe('local_wins');
    });

    it('should prefer server authoritative timestamps over client timestamps', () => {
      const local = { id: '1', serverUpdatedAt: '2026-06-29T12:00:00Z', _updatedAt: '2026-06-01T00:00:00Z' };
      const remote = { id: '1', updated_at: '2026-06-28T12:00:00Z' };
      expect(resolveConflict(local, remote)).toBe('local_wins');
    });

    it('should use server updated_at when no serverUpdatedAt', () => {
      const local = { id: '1', updated_at: '2026-06-01T00:00:00Z' };
      const remote = { id: '1', updated_at: '2026-06-29T12:00:00Z' };
      expect(resolveConflict(local, remote)).toBe('remote_wins');
    });

    it('should prefer local when timestamps are equal', () => {
      const local = { id: '1', _updatedAt: '2026-06-29T12:00:00Z' };
      const remote = { id: '1', updated_at: '2026-06-29T12:00:00Z' };
      expect(resolveConflict(local, remote)).toBe('local_wins');
    });
  });

  describe('fieldLevelMerge', () => {
    it('should prefer remote fields when remote timestamp is newer (unless local per-field)', () => {
      const local = { id: '1', name: 'Local Name', price: 100, _updatedAt: '2026-01-01T00:00:00Z' };
      const remote = { id: '1', name: 'Remote Name', description: 'Remote desc', updated_at: '2026-06-29T12:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      // Remote timestamp is newer, so remote values win for all fields
      expect(merged.name).toBe('Remote Name');
      expect(merged.price).toBe(100);
      expect(merged.description).toBe('Remote desc');
    });

    it('should prefer remote values when remote timestamp is newer', () => {
      const local = { id: '1', name: 'Old', price: 100, _updatedAt: '2026-01-01T00:00:00Z' };
      const remote = { id: '1', name: 'New', price: 200, updated_at: '2026-06-29T12:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      expect(merged.name).toBe('New');
      expect(merged.price).toBe(200);
    });

    it('should prefer local values when local timestamp is newer', () => {
      const local = { id: '1', name: 'Newer Local', _updatedAt: '2026-06-29T12:00:00Z' };
      const remote = { id: '1', name: 'Older Remote', updated_at: '2026-01-01T00:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      expect(merged.name).toBe('Newer Local');
    });

    it('should use server authoritative timestamps for field comparison', () => {
      const local = { id: '1', name: 'Local Edit', serverUpdatedAt: '2026-06-29T12:00:00Z', _updatedAt: '2026-01-01T00:00:00Z' };
      const remote = { id: '1', name: 'Remote Edit', updated_at: '2026-06-28T00:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      expect(merged.name).toBe('Local Edit');
    });

    it('should handle null and undefined values', () => {
      const local = { id: '1', name: null, price: undefined, _updatedAt: '2026-06-29T00:00:00Z' };
      const remote = { id: '1', name: 'Remote Name', price: 50, updated_at: '2026-01-01T00:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      // local timestamp is newer, so local null wins for name
      expect(merged.name).toBeNull();
      // local price is undefined, so remote price wins
      expect(merged.price).toBe(50);
    });

    it('should strip metadata fields from merged data', () => {
      const local = { id: '1', name: 'Test', _version: 5, _updatedAt: '2026-06-29T00:00:00Z' };
      const remote = { id: '1', updated_at: '2026-01-01T00:00:00Z' };

      const merged = fieldLevelMerge(local, remote);
      expect(merged.name).toBe('Test');
      expect(merged._version).toBeUndefined();
      expect(merged.updated_at).toBeUndefined();
    });
  });

  describe('resolvePushConflict', () => {
    it('should preserve local-only fields and take the fresh server version', () => {
      const local = { id: 'r1', name: 'Local Name' };
      const serverData = { id: 'r1', price: 200 };
      const serverMeta = { version: 7, updatedAt: '2026-06-30T00:00:00Z' };

      const resolution = resolvePushConflict(local, serverData, serverMeta);
      expect(resolution.converged).toBe(false);
      expect(resolution.merged).not.toBeNull();
      expect(resolution.merged!.name).toBe('Local Name');
      expect(resolution.merged!.price).toBe(200);
      expect(resolution.merged!._version).toBe(7);
      expect(resolution.merged!.version).toBe(7);
      expect(resolution.merged!.serverUpdatedAt).toBe('2026-06-30T00:00:00Z');
      expect(resolution.serverVersion).toBe(7);
      expect(resolution.conflictedFields).toEqual([]);
    });

    it('should flag same-field edits with different values for review', () => {
      const local = { id: 'r1', name: 'Local Name', price: 100, _updatedAt: '2026-07-01T00:00:00Z' };
      const serverData = { id: 'r1', name: 'Server Name', price: 100 };
      const serverMeta = { version: 9, updatedAt: '2026-06-30T00:00:00Z' };

      const resolution = resolvePushConflict(local, serverData, serverMeta);
      expect(resolution.conflictedFields).toEqual(['name']);
      expect(resolution.converged).toBe(false);
      // LWW by field timestamp: local edit is newer, so the local value wins
      expect(resolution.merged!.name).toBe('Local Name');
      expect(resolution.merged!.price).toBe(100);
    });

    it('should converge when the local payload matches the server row', () => {
      const local = { id: 'r1', name: 'Same', price: 100 };
      const serverData = { id: 'r1', name: 'Same', price: 100 };
      const serverMeta = { version: 5, updatedAt: '2026-06-30T00:00:00Z' };

      const resolution = resolvePushConflict(local, serverData, serverMeta);
      expect(resolution.converged).toBe(true);
      expect(resolution.merged).toBeNull();
      expect(resolution.conflictedFields).toEqual([]);
    });

    it('should exclude metadata fields from conflicted fields', () => {
      const local = { id: 'r1', name: 'X', price: 100, version: 9, _updatedAt: '2026-07-01T00:00:00Z' };
      const serverData = { id: 'r1', name: 'Y', price: 150, version: 9, updated_at: '2026-06-02T00:00:00Z' };
      const serverMeta = { version: 9, updatedAt: '2026-06-02T00:00:00Z' };

      const resolution = resolvePushConflict(local, serverData, serverMeta);
      expect(resolution.conflictedFields).toEqual(['name', 'price']);
      expect(resolution.merged!._version).toBe(9);
    });

    it('should keep a local-only field as a pushable delta when no server snapshot is returned', () => {
      const local = { id: 'r1', name: 'Local Name' };

      const resolution = resolvePushConflict(local, undefined, { version: 3, updatedAt: null });
      expect(resolution.converged).toBe(false);
      expect(resolution.merged).not.toBeNull();
      expect(resolution.merged!.name).toBe('Local Name');
      expect(resolution.merged!._version).toBe(3);
      expect(resolution.conflictedFields).toEqual([]);
      expect(resolution.serverVersion).toBe(3);
    });
  });
});
