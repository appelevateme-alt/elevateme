import { get } from '../../lib/api';

export type OutboxState = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface OutboxRow {
  id: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  eventType?: string | null;
  state?: string | null;
  retryCount?: number | null;
  nextRetryAt?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
}

function normalize(res: OutboxRow[] | { items?: OutboxRow[] }): OutboxRow[] {
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

/**
 * GET /admin/outbox?state=FAILED (default FAILED).
 * Admin-only list. No per-row retry endpoint exists — the worker retries
 * automatically; failed rows stay as history (see docs/OUTBOX.md).
 */
export async function listOutbox(state: OutboxState = 'FAILED'): Promise<OutboxRow[]> {
  const res = await get<OutboxRow[] | { items?: OutboxRow[] }>(
    `/admin/outbox?state=${encodeURIComponent(state)}`,
  );
  return normalize(res);
}
