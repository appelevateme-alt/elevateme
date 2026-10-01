import { del, get, post } from '../../lib/api';
import {
  createRecommendations as createRecsExact,
  previewAudience as previewAudienceExact,
  type AudienceInput,
  type CreateRecommendationsInput,
} from '../recommendations/api';
import { normalizePriorityForBackend } from '../recommendations/helpers';
import type { DevelopmentItem, PaymentRecord } from './types';

function normalize<T>(res: T[] | { items?: T[] }): T[] {
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

/** GET /me/development — assigned only. Falls back to empty. */
export async function listDevelopment(): Promise<DevelopmentItem[]> {
  try {
    const res = await get<DevelopmentItem[] | { items?: DevelopmentItem[] }>('/me/development');
    return normalize(res);
  } catch {
    return [];
  }
}

/**
 * GET /me/development/{id} — 404 unless assigned (or admin).
 * Backend truth (MeDevelopmentController.get).
 */
export async function getDevelopment(id: string): Promise<DevelopmentItem> {
  return get<DevelopmentItem>(`/me/development/${encodeURIComponent(id)}`);
}

/**
 * POST /me/development/{id}/register — FREE confirms subject to capacity;
 * PAID returns AWAITING_PAYMENT_VERIFICATION with the external link.
 * Backend truth (MeDevelopmentController.register). No /confirm endpoint exists.
 */
export async function registerDevelopment(id: string, idempotencyKey?: string): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>(
    `/me/development/${encodeURIComponent(id)}/register`,
    {},
    idempotencyKey ? { idempotencyKey } : {},
  );
}

/** @deprecated Use registerDevelopment() — kept for existing callers. */
export async function confirmFreeDevelopment(id: string): Promise<void> {
  await registerDevelopment(id);
}

export function registerIdempotencyKey(id: string): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `dev-register:${id}:${(crypto as { randomUUID(): string }).randomUUID()}`;
    }
  } catch { /* noop */ }
  return `dev-register:${id}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
}

/**
 * POST /registrations/{id}/payment-reference {reference} — "I have paid" submits
 * the reference for review; it does NOT confirm (admin verify decision confirms).
 * Backend truth (RegistrationController.paymentReference). `id` is the
 * REGISTRATION id, not the development id.
 */
export async function submitPaidReference(
  registrationId: string,
  reference: string,
): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>(
    `/registrations/${encodeURIComponent(registrationId)}/payment-reference`,
    { reference },
  );
}

/** Admin: builder + assign are separate steps (two calls, never combined). */
export async function adminCreateDevelopment(payload: {
  details: string;
  date?: string | null;
  capacity?: number | null;
  billingType?: string | null;
  price?: number | null;
  currency?: string | null;
  paymentUrl?: string | null;
  partner?: string | null;
  deadline?: string | null;
}): Promise<DevelopmentItem> {
  return post<DevelopmentItem>('/admin/development', payload);
}

export async function adminAssignDevelopment(
  id: string,
  payload: { recipientIds?: string[] | null; audienceRule?: Record<string, unknown> | null; reason?: string | null },
): Promise<{ assigned: number } & Record<string, unknown>> {
  return post<{ assigned: number } & Record<string, unknown>>(
    `/admin/development/${encodeURIComponent(id)}/assign`,
    payload,
  );
}

/**
 * Removal blocks new registration but never silently cancels a confirmed registration.
 */
export async function removeAssignee(developmentId: string, studentId: string): Promise<Record<string, unknown>> {
  return del<Record<string, unknown>>(
    `/admin/development/${encodeURIComponent(developmentId)}/assignees/${encodeURIComponent(studentId)}`,
  );
}

export async function listAdminPayments(state = 'PENDING'): Promise<PaymentRecord[]> {
  try {
    const qs = state ? `?state=${encodeURIComponent(state)}` : '';
    const res = await get<PaymentRecord[] | { items?: PaymentRecord[] }>(`/admin/payments${qs}`);
    return normalize(res);
  } catch {
    return [];
  }
}

/**
 * POST /admin/payments/{id}/verify {decision:VERIFIED|REJECTED,reason}.
 * VERIFIED confirms + records admin+time; REJECTED needs a reason.
 * Backend truth (PaymentAdminController.verify). No PATCH verify|reject endpoints.
 */
export async function verifyPaymentRecord(
  id: string,
  body: { decision: 'VERIFIED' | 'REJECTED'; reason?: string | null },
): Promise<PaymentRecord> {
  return post<PaymentRecord>(`/admin/payments/${encodeURIComponent(id)}/verify`, body);
}

/** VERIFIED decision — confirms the registration. */
export async function verifyPayment(id: string): Promise<void> {
  await verifyPaymentRecord(id, { decision: 'VERIFIED' });
}

/** REJECTED decision — reason is required by the backend. */
export async function rejectPayment(id: string, note?: string): Promise<void> {
  await verifyPaymentRecord(id, { decision: 'REJECTED', reason: note ?? '' });
}

/** POST /admin/payments/expire — sweep PENDING past expiry -> EXPIRED. */
export async function expirePaymentHolds(): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/admin/payments/expire', {});
}

// No hold-extend route exists: PaymentAdminController exposes list / verify /
// expire only (DevelopmentService.extendHold is service-only with no mapping).
// Holds expire automatically via the expiry sweep above — no client write.

// ------------------------------------------------------------------
// Recommendations composer — exact backend paths/payloads.
// Canonical implementations live in features/recommendations/api.ts;
// these wrappers keep the old import site working.
// ------------------------------------------------------------------

export interface RecommendationComposerPayload {
  title: string;
  action: string;
  reason: string;
  skillArea?: string | null;
  /** Backend vocab HIGH|MED|LOW — MEDIUM accepted and normalized to MED. */
  priority: 'HIGH' | 'MED' | 'LOW' | 'MEDIUM';
  dueDate?: string | null;
  linkedReportId?: string | null;
  pinned?: boolean | null;
  target: { studentIds?: string[]; instituteId?: string | null; rule?: string | null };
  // Exact-shape passthrough (preferred):
  individualIds?: string[] | null;
  institutionId?: string | null;
  criterionRule?: AudienceInput['criterionRule'];
  explicitBatch?: string[] | null;
}

function toExactInput(payload: RecommendationComposerPayload): CreateRecommendationsInput {
  return {
    title: payload.title,
    action: payload.action,
    reason: payload.reason,
    skillArea: (payload as { skillArea?: string | null }).skillArea ?? null,
    priority: normalizePriorityForBackend(payload.priority),
    dueDate: payload.dueDate ?? null,
    individualIds: payload.individualIds ?? payload.target.studentIds ?? null,
    institutionId: payload.institutionId ?? payload.target.instituteId ?? null,
    criterionRule: payload.criterionRule ?? null,
    explicitBatch: payload.explicitBatch ?? null,
    linkedReportId: payload.linkedReportId ?? null,
    pinned: payload.pinned ?? null,
  };
}

function toAudience(payloadTarget: RecommendationComposerPayload['target']): AudienceInput {
  return {
    individualIds: payloadTarget.studentIds ?? null,
    institutionId: payloadTarget.instituteId ?? null,
    criterionRule: null,
    explicitBatch: null,
  };
}

/** POST /admin/audiences/preview — counts + IDs, persists nothing. */
export async function previewRecommendationAudience(
  target: RecommendationComposerPayload['target'],
): Promise<{ count: number; recipientIds?: string[] }> {
  const out = await previewAudienceExact(toAudience(target));
  return { count: out.count, recipientIds: out.recipientIds };
}

/** POST /admin/recommendations — freezes the audience snapshot at publish time. */
export async function publishRecommendation(payload: RecommendationComposerPayload): Promise<void> {
  await createRecsExact(toExactInput(payload));
}
