import { CRITERIA_10 } from '../../lib/scoring';

/**
 * Phase 3 evaluation-sheet pure helpers (unit-tested in src/tests/evaluation.test.ts).
 * No DOM, no fetch — safe for vitest.
 */

/** Autosave stale-ignore: only apply a save response when its request id is the latest. */
export function shouldApplyAutosaveResult(latestRequestId: number, responseRequestId: number): boolean {
  return responseRequestId >= latestRequestId;
}

export function isStaleAutosaveResult(latestRequestId: number, responseRequestId: number): boolean {
  return responseRequestId < latestRequestId;
}

/**
 * Next-student navigation must never discard unsaved work:
 * - when a save is in flight or the draft is dirty, the caller must Stay/Retry,
 *   never silently discard.
 * - returns 'proceed' only when clean + saved, else 'stay'.
 */
export function resolveNextNavigation(opts: { dirty: boolean; saving: boolean; saveError: boolean }): 'proceed' | 'stay' {
  if (opts.saving || opts.dirty || opts.saveError) return 'stay';
  return 'proceed';
}

/** Preserve draft across Next: carry scores + notes forward keyed by evaluation id. */
export function preserveDraftForNext(
  drafts: Record<string, { scores: Record<string, number | null>; notes: string }>,
  evaluationId: string,
  scores: Record<string, number | null>,
  notes: string,
): Record<string, { scores: Record<string, number | null>; notes: string }> {
  return { ...drafts, [evaluationId]: { scores: { ...scores }, notes } };
}

/** Ordered criterion keys for the sheet (mirrors CRITERIA_10). */
export function orderedCriteria(): string[] {
  return [...CRITERIA_10];
}

/** Map a Record of scores to the backend's ordered 10-slot array (null = blank, never 0). */
export function scoresToOrderedArray(scores: Record<string, number | null>): Array<number | null> {
  return CRITERIA_10.map((k) => scores[k] ?? null);
}

/** Parse a backend evaluation payload into a Record (supports array or object shapes). */
export function parseScoresPayload(raw: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of CRITERIA_10) out[k] = null;
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => {
      const key = CRITERIA_10[i];
      if (!key) return;
      if (v === null || v === undefined || v === '') out[key] = null;
      else if (typeof v === 'number') out[key] = v;
      else if (typeof v === 'object' && v !== null && 'score' in (v as Record<string, unknown>)) {
        const s = (v as Record<string, unknown>).score;
        out[key] = typeof s === 'number' ? s : null;
      }
    });
    return out;
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    // Object keyed by criterion key, or {answers:[{score}]}.
    if (Array.isArray(rec.answers)) return parseScoresPayload(rec.answers);
    for (const k of CRITERIA_10) {
      const v = rec[k];
      if (v === null || v === undefined || v === '') out[k] = null;
      else if (typeof v === 'number') out[k] = v;
      else out[k] = null;
    }
  }
  return out;
}

/** Client-side provisional total (sum) — display only; server recomputes authoritatively. */
export function provisionalTotalOf(scores: Record<string, number | null>): number {
  let sum = 0;
  for (const k of CRITERIA_10) {
    const v = scores[k];
    if (typeof v === 'number' && Number.isInteger(v)) sum += v;
  }
  return sum;
}

/** Normalized total/10 (server authoritative; client mirrors for live feedback). */
export function normalizedOf(scores: Record<string, number | null>): number {
  return provisionalTotalOf(scores) / 10;
}
