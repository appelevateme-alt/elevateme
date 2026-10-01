import { get, post } from '../../lib/api';

/**
 * Guest invite: fragment (#t=...) -> POST /guest/exchange (HttpOnly cookie session).
 * The raw fragment is sent once in the POST body and never logged; the caller must
 * history.replaceState-clean the URL immediately after.
 */
export async function exchangeGuestToken(fragment: string): Promise<{ ok: boolean }> {
  return post<{ ok: boolean }>('/guest/exchange', { fragment });
}

export interface GuestRosterRow {
  id: string;
  studentId?: string;
  name?: string;
  elevateMeId?: string;
  reportStatus?: string;
  evaluationId?: string;
}

export interface GuestSessionScope {
  scope: string;
  sessionId: string | null;
  programId: string | null;
  invitationId: string;
}

/**
 * Scope-resolved session (no DB/session IDs from the client — resolved from the
 * invitation cookie). Frontend never asks the guest to type IDs.
 */
export async function getGuestSession(): Promise<GuestSessionScope> {
  return get<GuestSessionScope>('/guest/session');
}

export async function getGuestRosterScoped(params?: {
  sessionId?: string;
  q?: string;
  page?: number;
}): Promise<{ rows: GuestRosterRow[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.sessionId) qs.set('sessionId', params.sessionId);
  if (params?.q) qs.set('q', params.q);
  if (params?.page) qs.set('page', String(params.page));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await get<
    | { rows: GuestRosterRow[]; total: number }
    | { items: GuestRosterRow[]; total: number }
    | GuestRosterRow[]
  >(`/guest/roster${suffix}`);
  if (Array.isArray(res)) return { rows: res, total: res.length };
  if ('rows' in res) return { rows: res.rows, total: res.total ?? res.rows.length };
  return { rows: res.items, total: res.total ?? res.items.length };
}
