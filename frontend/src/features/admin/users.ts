import { get, post } from '../../lib/api';

export type AccountReviewStatus = 'PendingReview' | 'Approved' | 'ChangesRequested' | 'Rejected' | 'Suspended';

export interface AdminUserRow {
  id: string;
  email?: string | null;
  displayName?: string | null;
  elevateMeId?: string | null;
  roles?: string[];
  role?: string;
  status?: string | null;
  instituteId?: string | null;
  createdAt?: string | null;
}

export interface AdminUserListResult {
  items: AdminUserRow[];
  backendAvailable: boolean;
  message?: string;
}

/**
 * Account review queue.
 *
 * Backend truth: no dedicated GET /admin/users list route exists yet
 * (IdentityController exposes only photo flows; MeController exposes /me).
 * Until the backend adds an admin users list + decide endpoint, this returns
 * backendAvailable:false so the page shows an explicit "waiting on backend"
 * empty state. It never fakes approvals.
 */
export async function listReviewAccounts(_status: string = 'PendingReview'): Promise<AdminUserListResult> {
  const attempts = ['/admin/users?status=PendingReview', '/admin/users'];
  for (const path of attempts) {
    try {
      const res = await get<AdminUserRow[] | { items?: AdminUserRow[] }>(path);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return { items, backendAvailable: true };
    } catch {
      continue;
    }
  }
  return {
    items: [],
    backendAvailable: false,
    message: 'Account review needs a backend list endpoint (GET /admin/users) before approvals can run here.',
  };
}

export type AccountDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

/**
 * Decide an account. Throws an explicit TODO error when the backend route is
 * missing — callers surface it as "waiting on backend", never fake success.
 */
export async function decideAccount(_id: string, _decision: AccountDecision, _note?: string): Promise<never> {
  try {
    await post(`/admin/users/${encodeURIComponent(_id)}/decision`, {
      decision: _decision,
      note: _note ?? null,
    });
    throw new Error('Unexpected success shape — refresh the queue.');
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Unexpected success')) throw e;
    throw new Error(
      'Account decisions need a backend endpoint (POST /admin/users/{id}/decision) — nothing was changed.',
    );
  }
}
