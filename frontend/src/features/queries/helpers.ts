import { QUERY_LIMITS, QUERY_PAGE_SIZE, type QueryThread } from './types';

/** Title max 120, body max 5000. Both required. */
export function validateQueryInput(input: { title: string; body: string }): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const title = (input.title ?? '').trim();
  const body = (input.body ?? '').trim();
  if (!title) errors.push('Title is required.');
  else if (title.length > QUERY_LIMITS.titleMax) errors.push(`Title must be ${QUERY_LIMITS.titleMax} characters or fewer.`);
  if (!body) errors.push('Details are required.');
  else if (body.length > QUERY_LIMITS.bodyMax) errors.push(`Details must be ${QUERY_LIMITS.bodyMax} characters or fewer.`);
  return { ok: errors.length === 0, errors };
}

export function queryIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `query:${(crypto as { randomUUID(): string }).randomUUID()}`;
    }
  } catch { /* noop */ }
  return `query:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
}

export function buildQueryListParams(input: { page?: number; q?: string; status?: string }): string {
  // Backend truth: GET /queries?q,status,page (10/page server-side). No pageSize param.
  const p = new URLSearchParams();
  const page = Math.max(1, input.page ?? 1);
  if (page > 1) p.set('page', String(page));
  if (input.q?.trim()) p.set('q', input.q.trim());
  if (input.status && input.status !== 'all') p.set('status', input.status);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 10/page client-side slice (server is source of truth when available). */
export function paginateQueries<T>(items: T[], page: number, pageSize = QUERY_PAGE_SIZE): { pageItems: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(1, page), totalPages);
  const start = (safe - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), totalPages };
}

export function filterQueryThreads(items: QueryThread[], q: string, status: string): QueryThread[] {
  const needle = q.trim().toLowerCase();
  return items.filter((t) => {
    if (status && status !== 'all') {
      if (String(t.status).toLowerCase() !== status.toLowerCase()) return false;
    }
    if (!needle) return true;
    const hay = `${t.title ?? ''} ${t.body ?? t.query ?? ''} ${t.reply ?? t.replyBody ?? ''}`.toLowerCase();
    return hay.includes(needle);
  });
}

/** DI-initiated threads swap headers: Your response / DI message. */
export function isDiInitiated(t: Pick<QueryThread, 'initiatedBy'>): boolean {
  return String(t.initiatedBy ?? '').toLowerCase() === 'di';
}

export function threadBody(t: QueryThread): string {
  return String(t.body ?? t.query ?? '');
}

export function threadReply(t: QueryThread): string | null {
  const r = t.reply ?? t.replyBody ?? null;
  if (r == null || String(r).trim() === '') return null;
  return String(r);
}
