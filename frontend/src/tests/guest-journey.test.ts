import { describe, expect, it } from 'vitest';
import { CRITERIA_10 } from '../lib/scoring';
import { parseScoresPayload, provisionalTotalOf } from '../features/evaluation-sheet/helpers';
import {
  filterGuestRoster,
  guestSaveLabel,
  guestSessionPath,
  guestSheetPath,
  resolveGuestNext,
} from '../features/guest-invite/helpers';

describe('guest journey Phase 1C — scope filtering (names + status only)', () => {
  const rows = [
    { id: 's-1', studentId: 's-1', name: 'Ava', elevateMeId: 'EM-1', reportStatus: 'DRAFT', evaluationId: 'e-1', email: 'ava@example.com', phone: '123', history: [1, 2] },
    { id: 's-2', studentId: 's-2', name: 'Ben', elevateMeId: 'EM-2', reportStatus: 'SUBMITTED', evaluationId: 'e-2', email: 'ben@example.com' },
    { id: 's-9', studentId: 's-9', name: 'Zed', reportStatus: 'DRAFT', evaluationId: 'e-9' },
  ] as unknown as Parameters<typeof filterGuestRoster>[0];

  it('empty allow-list keeps all (session scope is the gate)', () => {
    const out = filterGuestRoster(rows, []);
    expect(out).toHaveLength(3);
  });

  it('allow-list hides unassigned students (no enumeration)', () => {
    const out = filterGuestRoster(rows, ['s-1', 's-2']);
    expect(out.map((r) => r.studentId).sort()).toEqual(['s-1', 's-2']);
  });

  it('strips contacts/history — names + status only', () => {
    const out = filterGuestRoster(rows, null);
    for (const r of out) {
      expect(r).not.toHaveProperty('email');
      expect(r).not.toHaveProperty('phone');
      expect(r).not.toHaveProperty('history');
      expect(Object.keys(r).sort()).toEqual(
        ['elevateMeId', 'evaluationId', 'id', 'name', 'reportStatus', 'studentId'].sort(),
      );
    }
  });

  it('sheet/session routes carry no DB evaluation ids (student-resolved server-side)', () => {
    expect(guestSheetPath('s-1')).toBe('/evaluate/students/s-1');
    expect(guestSessionPath()).toBe('/evaluate/session');
    expect(guestSheetPath('s-1')).not.toContain('e-1');
  });
});

describe('guest journey Phase 1C — save states', () => {
  it('save/saving/saved/failed/submitted labels', () => {
    expect(guestSaveLabel('save')).toBe('Save');
    expect(guestSaveLabel('saving')).toBe('Saving…');
    expect(guestSaveLabel('saved')).toBe('Saved');
    expect(guestSaveLabel('failed')).toContain('retry');
    expect(guestSaveLabel('submitted')).toBe('Submitted');
  });

  it('drafts survive refresh: server GET parses ordered array with null blanks', () => {
    const ordered = [80, 70, null, null, null, null, null, null, null, null];
    const parsed = parseScoresPayload(ordered);
    expect(parsed.preparation).toBe(80);
    expect(parsed.clarity).toBe(70);
    expect(parsed.confidence).toBeNull();
    expect(provisionalTotalOf(parsed)).toBe(150);
  });

  it('full 10 parses for submit readiness', () => {
    const full = Object.fromEntries(CRITERIA_10.map((k) => [k, 60]));
    const parsed = parseScoresPayload(full);
    expect(provisionalTotalOf(parsed)).toBe(600);
  });
});

describe('guest journey Phase 1C — Next preserves (never discards)', () => {
  it('stay while dirty/saving/failed, proceed only when clean', () => {
    expect(resolveGuestNext({ dirty: true, saving: false, saveFailed: false })).toBe('stay');
    expect(resolveGuestNext({ dirty: false, saving: true, saveFailed: false })).toBe('stay');
    expect(resolveGuestNext({ dirty: false, saving: false, saveFailed: true })).toBe('stay');
    expect(resolveGuestNext({ dirty: false, saving: false, saveFailed: false })).toBe('proceed');
  });
});
