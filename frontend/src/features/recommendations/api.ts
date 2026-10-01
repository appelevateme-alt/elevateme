import { get, patch, post } from '../../lib/api';
import { normalizePriorityForBackend } from './helpers';
import type { Recommendation } from './types';

function normalize(items: Recommendation[] | { items?: Recommendation[] }): Recommendation[] {
  if (Array.isArray(items)) return items;
  return items.items ?? [];
}

/** GET /me/recommendations — flat records. Falls back to empty (never breaks page). */
export async function listRecommendations(): Promise<Recommendation[]> {
  const attempts = ['/me/recommendations?limit=100', '/me/recommendations'];
  for (const path of attempts) {
    try {
      const res = await get<Recommendation[] | { items?: Recommendation[] }>(path);
      return normalize(res);
    } catch {
      continue;
    }
  }
  return [];
}

export interface PatchRecommendationInput {
  completed?: boolean;
  pinned?: boolean;
  note?: string | null;
}

/**
 * PATCH /me/recommendations/{recipientId} {completed,pinned,note} — own row only.
 * Backend truth (RecommendationsController.patchMine).
 */
export async function patchRecommendation(
  recipientId: string,
  body: PatchRecommendationInput,
): Promise<Recommendation> {
  return patch<Recommendation>(`/me/recommendations/${encodeURIComponent(recipientId)}`, body);
}

/** Mark own recommendation complete: PATCH .../{recipientId} {completed:true}. */
export async function completeRecommendation(id: string): Promise<Recommendation> {
  return patchRecommendation(id, { completed: true });
}

/** Undo own completion: PATCH .../{recipientId} {completed:false}. */
export async function undoRecommendation(id: string): Promise<Recommendation> {
  return patchRecommendation(id, { completed: false });
}

/** Pin/unpin own row (optional backend field). */
export async function setRecommendationPinned(id: string, pinned: boolean): Promise<Recommendation> {
  return patchRecommendation(id, { pinned });
}

// ------------------------------------------------------------------
// Admin: POST /admin/audiences/preview + POST /admin/recommendations
// Backend truth (RecommendationsController + RecommendationDtos).
// ------------------------------------------------------------------

export interface CriterionRule {
  criterion: string;
  comparator: string;
  threshold?: number | null;
}

export interface AudienceInput {
  individualIds?: string[] | null;
  institutionId?: string | null;
  criterionRule?: CriterionRule | null;
  explicitBatch?: string[] | null;
}

export interface CreateRecommendationsInput extends AudienceInput {
  title: string;
  action: string;
  reason: string;
  skillArea?: string | null;
  /** UI may pass MEDIUM; normalized to MED at the boundary. */
  priority: string;
  dueDate?: string | null;
  linkedReportId?: string | null;
  pinned?: boolean | null;
}

function toAudienceBody(a: AudienceInput): Record<string, unknown> {
  return {
    individualIds: a.individualIds ?? null,
    institutionId: a.institutionId ?? null,
    criterionRule: a.criterionRule ?? null,
    explicitBatch: a.explicitBatch ?? null,
  };
}

/** POST /admin/audiences/preview — counts + IDs, persists nothing. */
export async function previewAudience(
  audience: AudienceInput,
): Promise<{ recipientIds: string[]; count: number }> {
  const res = await post<{ recipientIds?: string[]; count?: number }>(
    '/admin/audiences/preview',
    toAudienceBody(audience),
  );
  return { recipientIds: res.recipientIds ?? [], count: res.count ?? (res.recipientIds ?? []).length };
}

/** POST /admin/recommendations — freezes the audience snapshot at publish time. */
export async function createRecommendations(
  input: CreateRecommendationsInput,
): Promise<{ id?: string } & Record<string, unknown>> {
  return post('/admin/recommendations', {
    title: input.title,
    action: input.action,
    reason: input.reason,
    skillArea: input.skillArea ?? null,
    priority: normalizePriorityForBackend(input.priority),
    dueDate: input.dueDate ?? null,
    individualIds: input.individualIds ?? null,
    institutionId: input.institutionId ?? null,
    criterionRule: input.criterionRule ?? null,
    explicitBatch: input.explicitBatch ?? null,
    linkedReportId: input.linkedReportId ?? null,
    pinned: input.pinned ?? null,
  });
}
