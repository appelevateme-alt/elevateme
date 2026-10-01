import type { GuestRosterRow } from './api';

/**
 * Phase 1C guest journey pure helpers (unit-tested in src/tests/guest-journey.test.ts).
 * No DOM, no fetch — safe for vitest.
 */

/** Minimal guest roster row: names + status only (no contacts/history/recommendations). */
export interface GuestVisibleRow {
  id: string;
  studentId: string;
  name: string;
  elevateMeId?: string;
  reportStatus?: string;
  evaluationId?: string;
}

/**
 * Scope filtering: keep only rows in the invitation allow-list when present.
 * Empty/undefined allow-list => session scope is the gate (keep all).
 * Also strips any extra columns down to names + status (no contacts/history).
 */
export function filterGuestRoster(
  rows: GuestRosterRow[],
  assignedStudentIds?: string[] | null,
): GuestVisibleRow[] {
  const allow =
    assignedStudentIds == null ? null : new Set(assignedStudentIds.map(String));
  const out: GuestVisibleRow[] = [];
  for (const r of rows) {
    const studentId = String((r as { studentId?: string }).studentId ?? r.id);
    if (allow && allow.size > 0 && !allow.has(studentId)) continue;
    out.push({
      id: String(r.id),
      studentId,
      name: String(r.name ?? r.id),
      elevateMeId: r.elevateMeId,
      reportStatus: r.reportStatus,
      evaluationId: r.evaluationId,
    });
  }
  return out;
}

export type GuestSaveKind = 'save' | 'saving' | 'saved' | 'failed' | 'submitted';

/** Guest sheet save-state labels (save/saving/saved/failed/submitted). */
export function guestSaveLabel(state: GuestSaveKind): string {
  switch (state) {
    case 'save':
      return 'Save';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return 'Save failed — retry';
    case 'submitted':
      return 'Submitted';
  }
}

/**
 * Next-student must never discard unsaved work: Stay/Retry while dirty, saving,
 * or failed; proceed only when clean + saved/submitted.
 */
export function resolveGuestNext(opts: {
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
}): 'proceed' | 'stay' {
  if (opts.saving || opts.dirty || opts.saveFailed) return 'stay';
  return 'proceed';
}

/** Sheet route for a student (no DB evaluation id in the URL — resolved server-side). */
export function guestSheetPath(studentId: string): string {
  return `/evaluate/students/${encodeURIComponent(studentId)}`;
}

export function guestSessionPath(): string {
  return '/evaluate/session';
}
