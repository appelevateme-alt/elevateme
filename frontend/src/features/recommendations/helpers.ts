import type { Recommendation, RecommendationPriority } from './types';

export const PIN_MAX = 3;

// Backend vocab: HIGH|MED|LOW. MEDIUM is a legacy UI alias (normalized to MED).
const WEIGHT: Record<string, number> = { HIGH: 0, MED: 1, MEDIUM: 1, LOW: 2 };

export function priorityWeight(p?: string | null): number {
  if (!p) return 1;
  return WEIGHT[String(p).toUpperCase()] ?? 1;
}

function dueTime(r: Recommendation): number | null {
  const raw = r.dueDate ?? r.due_date ?? null;
  if (!raw) return null;
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : t;
}

function createdTime(r: Recommendation): number {
  const raw = r.createdAt ?? r.created_at ?? null;
  if (!raw) return 0;
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Dashboard sort: HIGH -> due date (undated last) -> newest.
 * Priority first, then earliest due date (null last), then newest created.
 */
export function sortRecommendations<T extends Recommendation>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pw = priorityWeight(a.priority as string) - priorityWeight(b.priority as string);
    if (pw !== 0) return pw;
    const da = dueTime(a);
    const db = dueTime(b);
    if (da != null && db != null && da !== db) return da - db;
    if (da != null && db == null) return -1;
    if (da == null && db != null) return 1;
    return createdTime(b) - createdTime(a);
  });
}

/** Pinned top slice for dashboard: sorted active pinned, max 3. */
export function topPinned<T extends Recommendation>(items: T[], max = PIN_MAX): T[] {
  return sortRecommendations(items.filter((r) => r.pinned && String(r.status).toLowerCase() !== 'completed')).slice(0, max);
}

export function filterRecommendations<T extends Recommendation>(
  items: T[],
  opts: { status?: 'Active' | 'Completed' | 'All'; criterion?: string },
): T[] {
  return items.filter((r) => {
    const s = String(r.status).toLowerCase();
    const isCompleted = s === 'completed' || s === 'complete';
    if (opts.status === 'Active' && isCompleted) return false;
    if (opts.status === 'Completed' && !isCompleted) return false;
    if (opts.criterion && opts.criterion !== 'all') {
      const c = String(r.criterion ?? r.criterionKey ?? '').toLowerCase();
      if (c !== opts.criterion.toLowerCase()) return false;
    }
    return true;
  });
}

export function criterionOf(r: Recommendation): string {
  return String(r.criterion ?? r.criterionKey ?? '');
}

/** Own-only complete/undo. Parent view may complete with shared attribution note. */
export function canComplete(r: Recommendation, userId: string | null, view: 'student' | 'parent'): boolean {
  const active = String(r.status).toLowerCase() !== 'completed' && String(r.status).toLowerCase() !== 'complete';
  if (!active) return false;
  if (!userId) return false;
  if (r.ownerId && r.ownerId !== userId) {
    return view === 'parent';
  }
  return true;
}

export function canUndo(r: Recommendation, userId: string | null, view: 'student' | 'parent'): boolean {
  const done = String(r.status).toLowerCase() === 'completed' || String(r.status).toLowerCase() === 'complete';
  if (!done) return false;
  if (!userId) return false;
  if (r.completedBy && r.completedBy !== userId) {
    return view === 'parent';
  }
  if (r.ownerId && r.ownerId !== userId) {
    return view === 'parent';
  }
  return true;
}

export function sharedAttributionNote(view: 'student' | 'parent'): string | null {
  return view === 'parent'
    ? 'Parent view: completion is shared with the linked student record.'
    : null;
}

export function priorityLabel(p: RecommendationPriority | string): string {
  return normalizePriorityForBackend(p);
}

/**
 * Normalize a UI/server priority to the backend vocab HIGH|MED|LOW.
 * MEDIUM (legacy UI) -> MED. Case-insensitive. Throws on unknown.
 */
export function normalizePriorityForBackend(p: string): 'HIGH' | 'MED' | 'LOW' {
  const n = String(p ?? '').trim().toUpperCase();
  if (n === 'HIGH') return 'HIGH';
  if (n === 'MED' || n === 'MEDIUM') return 'MED';
  if (n === 'LOW') return 'LOW';
  throw new Error(`Unknown priority: ${p}`);
}

/** Accept both MED (backend) and MEDIUM (legacy UI) when reading. */
export function normalizePriorityFromBackend(p: string | null | undefined): string {
  const n = String(p ?? '').trim().toUpperCase();
  if (n === 'MED' || n === 'MEDIUM') return 'MED';
  if (n === 'HIGH' || n === 'LOW') return n;
  return n;
}
