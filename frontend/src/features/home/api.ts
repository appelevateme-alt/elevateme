import { get, patch } from '../../lib/api';

export interface MeProfile {
  id: string;
  elevateMeId?: string | null;
  email?: string | null;
  displayName?: string | null;
  roles?: string[];
  status?: string | null;
  instituteId?: string | null;
  photoKey?: string | null;
}

export interface HomeSummary {
  programsAttended: number;
  personalBest: number | null;
  pointsGained: number | null;
  baseline: number | null;
  message?: string | null;
  photo?: string | null;
  elevateMeId?: string | null;
  institute?: string | null;
  baselineLabel?: string | null;
  corrected?: boolean | null;
  sampleSize?: number | null;
}

export interface PinnedRecommendation {
  id: string;
  title: string;
  body?: string;
  date?: string;
  status?: string;
}

export interface HomeNotification {
  id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  read?: boolean | null;
  read_at?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export async function getMe(): Promise<MeProfile> {
  return get<MeProfile>('/me');
}

export async function getHomeSummary(): Promise<HomeSummary> {
  return get<HomeSummary>('/me/summary');
}

export async function listHomeNotifications(limit = 50): Promise<HomeNotification[]> {
  try {
    const res = await get<HomeNotification[] | { items?: HomeNotification[] }>(
      `/notifications?limit=${Math.max(1, Math.min(limit, 100))}`,
    );
    if (Array.isArray(res)) return res;
    return res.items ?? [];
  } catch {
    return [];
  }
}

/**
 * Up to 3 admin-pinned active recommendations.
 * Backend has no student GET for recommendations yet, so try the scoped
 * endpoint and fall back to empty (never break Home).
 */
export async function listPinnedRecommendations(): Promise<PinnedRecommendation[]> {
  const attempts = ['/me/recommendations?pinned=true&limit=3', '/me/recommendations?limit=3'];
  for (const path of attempts) {
    try {
      const res = await get<PinnedRecommendation[] | { items?: PinnedRecommendation[] }>(path);
      const items = Array.isArray(res) ? res : (res.items ?? []);
      return items.filter((r) => (r.status ?? 'active').toLowerCase() !== 'archived').slice(0, 3);
    } catch {
      continue;
    }
  }
  return [];
}

export function isUnread(n: HomeNotification): boolean {
  if (typeof n.read === 'boolean') return !n.read;
  return !n.read_at;
}

/** Mark own notification read (PATCH /notifications/{id}/read; idempotent re-read). */
export async function markRead(id: string): Promise<void> {
  await patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}

export function notificationKind(n: HomeNotification): 'report' | 'reply' | 'other' {
  const hay = `${n.type ?? ''} ${n.entityType ?? ''} ${n.title ?? ''}`.toLowerCase();
  if (hay.includes('report') || hay.includes('release') || hay.includes('correction') || hay.includes('evaluat')) {
    return 'report';
  }
  if (hay.includes('repl') || hay.includes('quer') || hay.includes('message')) return 'reply';
  return 'other';
}
