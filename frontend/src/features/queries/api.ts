import { get, post } from '../../lib/api';
import { buildQueryListParams } from './helpers';
import type { QueryCreate, QueryThread } from './types';

function normalize(res: QueryThread[] | { items?: QueryThread[] }): QueryThread[] {
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

/**
 * GET /queries?q,status,page — own threads, 10/page, stable updated_at sort.
 * Backend truth (QueriesController.list).
 */
export async function listQueries(page = 1, q = '', status = 'all'): Promise<{ items: QueryThread[]; total: number }> {
  const qs = buildQueryListParams({ page, q, status });
  try {
    const res = await get<QueryThread[] | { items?: QueryThread[]; total?: number }>(`/queries${qs}`);
    if (Array.isArray(res)) return { items: res, total: res.length };
    return { items: res.items ?? [], total: res.total ?? (res.items ?? []).length };
  } catch {
    return { items: [], total: 0 };
  }
}

/** GET /queries/{id} — single thread + chronological messages. */
export async function getQuery(id: string): Promise<QueryThread | null> {
  try {
    return await get<QueryThread>(`/queries/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}

/**
 * POST /queries {title,body,linkedProgram,linkedReport} + `Idempotency-Key` header.
 * Backend truth (QueriesController.create). programId/reportId are legacy
 * UI aliases mapped to linkedProgram/linkedReport here.
 */
export async function createQuery(payload: QueryCreate): Promise<QueryThread> {
  return post<QueryThread>('/queries', {
    title: payload.title,
    body: payload.body,
    linkedProgram: payload.linkedProgram ?? payload.programId ?? null,
    linkedReport: payload.linkedReport ?? payload.reportId ?? null,
  }, { idempotencyKey: payload.idempotencyKey });
}

/** POST /queries/{id}/comments {body} — timestamped follow-up (both sides). */
export async function addQueryComment(id: string, body: string, idempotencyKey: string): Promise<void> {
  await post(`/queries/${encodeURIComponent(id)}/comments`, { body }, { idempotencyKey });
}

/**
 * POST /queries/{id}/reply {body} — admin official reply
 * (first reply: IN_REVIEW -> ANSWERED). Backend truth (QueriesController.reply).
 */
export async function addQueryReply(id: string, body: string): Promise<void> {
  await post(`/queries/${encodeURIComponent(id)}/reply`, { body });
}

/**
 * POST /queries/{id}/close + POST /queries/{id}/reopen.
 * Backend truth (QueriesController.close/reopen). No PATCH route exists.
 */
export async function setQueryStatus(id: string, action: 'close' | 'reopen'): Promise<void> {
  await post(`/queries/${encodeURIComponent(id)}/${action}`, {});
}

/**
 * Admin queue — backend has no separate GET /admin/queries list route;
 * staff use the same GET /queries (role-scoped server-side).
 */
export async function listAdminQueries(status = 'all'): Promise<QueryThread[]> {
  try {
    const qs = status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await get<QueryThread[] | { items?: QueryThread[] }>(`/queries${qs}`);
    return normalize(res);
  } catch {
    return [];
  }
}

/** POST /queries/{id}/reply {body} — admin official reply. */
export async function adminReplyQuery(id: string, body: string): Promise<void> {
  await addQueryReply(id, body);
}

/** POST /queries/{id}/close|reopen — admin close/reopen. */
export async function adminSetQueryStatus(id: string, action: 'close' | 'reopen'): Promise<void> {
  await setQueryStatus(id, action);
}

/**
 * POST /admin/queries {studentId,title,body} — DI-initiated thread.
 * Backend truth (QueriesController.createDiInitiated + QueryDtos.CreateDiQueryRequest):
 * starts in AWAITING_STUDENT_RESPONSE with initiator DI.
 */
export async function createDiQuery(payload: { studentId: string; title: string; body: string }): Promise<QueryThread> {
  return post<QueryThread>('/admin/queries', {
    studentId: payload.studentId,
    title: payload.title,
    body: payload.body,
  });
}
