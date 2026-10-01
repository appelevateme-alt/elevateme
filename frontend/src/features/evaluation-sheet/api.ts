import { get, patch, post } from '../../lib/api';
import { CRITERIA_10 } from '../../lib/scoring';
import { parseScoresPayload, scoresToOrderedArray } from './helpers';
import type { EvaluationSheet, EvaluationState } from './types';

interface RawEvaluationResponse {
  id: string;
  studentId?: string;
  studentName?: string;
  elevateMeId?: string;
  sessionId?: string;
  sessionTitle?: string;
  programId?: string;
  state?: EvaluationState | string;
  rowVersion?: number;
  version?: number;
  scores?: unknown;
  answers?: unknown;
  notes?: string | null;
  remarks?: string | null;
  total?: number | null;
  provisionalTotal?: number | null;
  average?: number | null;
  scoredCount?: number | null;
  revisionId?: string;
}

function normalizeSheet(raw: RawEvaluationResponse): EvaluationSheet {
  const scores = parseScoresPayload(
    raw.scores !== undefined ? raw.scores : raw.answers !== undefined ? { answers: raw.answers } : raw,
  );
  const version = raw.version ?? raw.rowVersion ?? 1;
  const state = (String(raw.state ?? 'DRAFT').toUpperCase() === 'SUBMITTED'
    ? 'SUBMITTED'
    : String(raw.state ?? 'DRAFT').toUpperCase() === 'LOCKED'
      ? 'LOCKED'
      : 'DRAFT') as EvaluationState;
  const scored = Object.values(scores).filter((v): v is number => typeof v === 'number').length;
  return {
    id: raw.id,
    studentId: raw.studentId ?? '',
    studentName: raw.studentName,
    elevateMeId: raw.elevateMeId,
    sessionId: raw.sessionId ?? '',
    sessionTitle: raw.sessionTitle,
    programId: raw.programId,
    state,
    version,
    scores,
    notes: raw.notes ?? raw.remarks ?? '',
    provisionalTotal: raw.provisionalTotal ?? raw.total ?? null,
    average: raw.average ?? null,
    scoredCount: raw.scoredCount ?? scored,
    total: raw.total ?? raw.provisionalTotal ?? null,
    revisionId: raw.revisionId,
  };
}

export async function getEvaluationSheet(id: string): Promise<EvaluationSheet> {
  const raw = await get<RawEvaluationResponse>(`/evaluations/${encodeURIComponent(id)}`);
  return normalizeSheet(raw);
}

export async function getGuestEvaluationSheet(id: string): Promise<EvaluationSheet> {
  const raw = await get<RawEvaluationResponse>(`/guest/evaluations/${encodeURIComponent(id)}`);
  return normalizeSheet(raw);
}

/**
 * Phase 1C guest sheet by assigned student (no evaluation DB id from the client —
 * resolved server-side from invitation scope + student).
 */
export async function getGuestEvaluationByStudent(studentId: string): Promise<EvaluationSheet> {
  const raw = await get<RawEvaluationResponse>(
    `/guest/students/${encodeURIComponent(studentId)}/evaluation`,
  );
  return normalizeSheet(raw);
}

/** Guest draft PATCH: partial allowed (null = blank). Version required (409 on stale). */
export async function patchGuestDraft(
  id: string,
  scores: Record<string, number | null>,
  remarks: string,
  version: number,
): Promise<SaveDraftResult> {
  const ordered = scoresToOrderedArray(scores);
  const res = await patch<{ version: number; provisionalTotal: number; scoredCount: number; state: string }>(
    `/guest/evaluations/${encodeURIComponent(id)}`,
    { scores: ordered, remarks, version },
  );
  return res;
}

/** Guest submit: all 10 int 0-100 required (server 422 otherwise). */
export async function submitGuestEvaluation(
  id: string,
  scores: Record<string, number | null>,
  version: number,
): Promise<SubmitResult> {
  const ordered = scoresToOrderedArray(scores);
  const res = await post<SubmitResult>(
    `/guest/evaluations/${encodeURIComponent(id)}/submit`,
    { scores: ordered, version },
  );
  return res;
}

export interface SaveDraftResult {
  version: number;
  provisionalTotal: number;
  scoredCount: number;
  state: string;
}

/** PATCH draft: partial allowed (null = blank, never coerced to 0). Version required. */
export async function saveEvaluationDraft(
  id: string,
  scores: Record<string, number | null>,
  notes: string,
  version: number,
): Promise<SaveDraftResult> {
  const ordered = scoresToOrderedArray(scores);
  const res = await patch<{ version: number; provisionalTotal: number; scoredCount: number; state: string }>(
    `/evaluations/${encodeURIComponent(id)}`,
    { scores: ordered, notes, version },
  );
  return res;
}

export interface SubmitResult {
  version: number;
  total: number;
  average: number;
  state: string;
  revisionId?: string;
}

/** POST submit: all 10 int 0-100 required (server 422 otherwise). Idempotency-Key repeat-safe. */
export async function submitEvaluation(
  id: string,
  scores: Record<string, number | null>,
  version: number,
  idempotencyKey?: string,
): Promise<SubmitResult> {
  const ordered = scoresToOrderedArray(scores);
  const res = await post<SubmitResult>(
    `/evaluations/${encodeURIComponent(id)}/submit`,
    { scores: ordered, version },
    idempotencyKey ? { idempotencyKey } : {},
  );
  return res;
}

/** Build a stable idempotency key per evaluation+version (repeat-safe submits). */
export function submitIdempotencyKey(evaluationId: string, version: number): string {
  return `eval-submit:${evaluationId}:v${version}`;
}

export { CRITERIA_10 };
