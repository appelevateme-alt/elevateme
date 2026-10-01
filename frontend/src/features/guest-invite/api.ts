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
  name?: string;
  elevateMeId?: string;
  reportStatus?: string;
  evaluationId?: string;
}

export async function getGuestRoster(sessionId: string): Promise<{ rows: GuestRosterRow[]; total: number }> {
  const res = await get<{ rows: GuestRosterRow[]; total: number } | { items: GuestRosterRow[]; total: number } | GuestRosterRow[]>(
    `/sessions/${encodeURIComponent(sessionId)}/roster`,
  );
  if (Array.isArray(res)) return { rows: res, total: res.length };
  if ('rows' in res) return { rows: res.rows, total: res.total ?? res.rows.length };
  return { rows: res.items, total: res.total ?? res.items.length };
}
