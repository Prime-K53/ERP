import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '../../utils/formatters';

describe('formatters — safe date fallbacks', () => {
  it('renders an em-dash for missing or unparseable dates instead of "Invalid Date"', () => {
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(new Date('not-a-date').toString()).toContain('Invalid'); // sanity: raw JS would fail

    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('')).toBe('—');
    expect(formatDateTime('garbage-input')).toBe('—');
  });

  it('formats valid ISO timestamps', () => {
    expect(formatDate('2026-08-23T10:30:00.000Z')).toMatch(/Aug 23, 2026/);
    expect(formatDateTime('2026-08-23T10:30:00.000Z')).toContain('Aug 23, 2026');
  });
});
