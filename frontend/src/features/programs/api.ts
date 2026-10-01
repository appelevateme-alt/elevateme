import { del, get, patch, post } from '../../lib/api';
import { buildProgramSearchParams, buildRosterParams } from './helpers';
import type { FullRosterRow, Program, Registration, RosterPage, RosterQuery } from './types';

/** Phase 2 program API. Phase 3 release via POST dryRun preview. */

export interface ProgramListParams {
  q?: string;
  theme?: string;
  type?: string;
  subtype?: string;
  date?: string;
  location?: string;
  availability?: string;
  page?: number;
  /** Lifecycle filter (e.g. PENDING_REVIEW). Sent as ?status= for forward-compat;
   *  backend ProgramsService.list has no lifecycle param yet so the pages below
   *  still filter client-side across all pages (see StaffProgramsPage). */
  status?: string;
}

export interface ProgramListResult {
  items: Program[];
  total: number;
  page: number;
  hasMore: boolean;
}

export async function listPublicPrograms(params: ProgramListParams): Promise<ProgramListResult> {
  const qs = buildProgramSearchParams(params);
  // Backend Phase 1E: {items, total, page, pageSize} (no hasMore). Anonymous:
  // no Authorization header (lib/api omits when signed out), cookies still sent.
  const res = await get<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    pageSize?: number;
    hasMore?: boolean;
  }>(`/programs${qs}`);
  const pageSize = res.pageSize ?? 10;
  const items = (res.items ?? []).map(normalizeProgramRow);
  const hasMore =
    typeof res.hasMore === 'boolean' ? res.hasMore : res.page * pageSize < (res.total ?? 0);
  return { items, total: res.total ?? items.length, page: res.page ?? 1, hasMore };
}

/**
 * Normalize backend canonical rows (type SingleEvent|Continuous|Special,
 * subtype MUN|Debate|Competition|Special, themes[]) to the frontend Program
 * shape (kind/theme/organizer/registeredCount/sessions/committees with safe
 * fallbacks so public discovery never crashes on sparse projections).
 */
function normalizeProgramRow(raw: Record<string, unknown>): Program {
  const themes = Array.isArray(raw['themes'])
    ? (raw['themes'] as unknown[]).map(String)
    : [];
  const theme =
    (raw['theme'] as string | undefined) ?? themes[0] ?? (raw['subtype'] as string | undefined) ?? '';
  const type = (raw['type'] as string | undefined) ?? '';
  const subtype = (raw['subtype'] as string | undefined) ?? '';
  // kind mirrors legacy MUN|DEBATE|CONTINUOUS for EventRow display.
  const upperSubtype = subtype.toUpperCase();
  const upperType = type.toUpperCase();
  let kind: Program['kind'] = 'MUN';
  if (upperSubtype === 'MUN' || upperSubtype === 'MODEL_UN') kind = 'MUN';
  else if (upperSubtype === 'DEBATE' || upperSubtype === 'FRIENDLY_DEBATE') kind = 'DEBATE';
  else if (upperType.includes('CONTINUOUS')) kind = 'CONTINUOUS';
  else if (upperSubtype === 'COMPETITION' || upperSubtype === 'SPECIAL') kind = 'MUN';
  return {
    id: String(raw['id'] ?? ''),
    title: String(raw['title'] ?? ''),
    description: String(raw['description'] ?? ''),
    kind,
    theme: String(theme ?? ''),
    themes,
    type,
    subtype,
    visibility: (raw['visibility'] as Program['visibility']) ?? 'PUBLIC',
    lifecycle: (raw['lifecycle'] as Program['lifecycle']) ?? 'PUBLISHED',
    startsAt: String(raw['startsAt'] ?? raw['starts_at'] ?? ''),
    endsAt: String(raw['endsAt'] ?? raw['ends_at'] ?? ''),
    location: String(raw['location'] ?? raw['venue'] ?? ''),
    capacity: Number(raw['capacity'] ?? 0),
    registeredCount: Number(raw['registeredCount'] ?? raw['registered_count'] ?? 0),
    organizer: String(raw['organizer'] ?? raw['ownerId'] ?? raw['owner_id'] ?? ''),
    eligibility: (raw['eligibility'] as string | undefined) ?? undefined,
    registrationDeadline: (raw['registrationDeadline'] as string | undefined) ?? undefined,
    sessions: Array.isArray(raw['sessions'])
      ? (raw['sessions'] as Program['sessions'])
      : [],
    committees: Array.isArray(raw['committees'])
      ? (raw['committees'] as Program['committees'])
      : [],
  };
}

export async function getProgram(id: string): Promise<Program> {
  // Public detail: anonymous allowed (no Authorization when signed out).
  const raw = await get<Record<string, unknown>>(`/programs/${encodeURIComponent(id)}`);
  return normalizeProgramRow(raw);
}

export interface CreateProgramPayload {
  title: string;
  description: string;
  kind: string;
  theme: string;
  subtype?: string;
  organizer?: string;
  startsAt: string;
  endsAt: string;
  location: string;
  registrationDeadline?: string;
  capacity: number;
  eligibility?: string;
  visibility: string;
  sessions: Array<{ title: string; startsAt: string; endsAt: string; location?: string; committee?: string; capacity?: number }>;
  committees: Array<{ name: string; countries: string[] }>;
}

export async function createProgram(payload: CreateProgramPayload): Promise<Program> {
  return post<Program>('/programs', payload);
}

export async function submitProgram(id: string): Promise<Program> {
  return post<Program>(`/programs/${encodeURIComponent(id)}/submit`);
}

export async function saveProgramDraft(id: string, payload: Partial<CreateProgramPayload>): Promise<Program> {
  return patch<Program>(`/programs/${encodeURIComponent(id)}`, payload);
}

export type ProgramDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

/**
 * POST /programs/{id}/approve {decision, note} — admin only (server checks
 * admin role + audits). Note required for CHANGES_REQUESTED / REJECTED.
 */
export async function decideProgram(
  id: string,
  decision: ProgramDecision,
  note?: string,
  idempotencyKey?: string,
): Promise<Program> {
  return post<Program>(
    `/programs/${encodeURIComponent(id)}/approve`,
    { decision, note: note ?? null },
    idempotencyKey ? { idempotencyKey } : {},
  );
}

/** POST /programs/{id}/publish — admin only (APPROVED -> PUBLISHED). */
export async function publishProgram(id: string, idempotencyKey?: string): Promise<Program> {
  return post<Program>(
    `/programs/${encodeURIComponent(id)}/publish`,
    {},
    idempotencyKey ? { idempotencyKey } : {},
  );
}

export function programDecisionKey(id: string, decision: string): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `decide:${id}:${decision}:${(crypto as { randomUUID(): string }).randomUUID()}`;
    }
  } catch { /* noop */ }
  return `decide:${id}:${decision}:${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Staff program list: same GET /programs list endpoint (server scopes rows to
 * the caller — owners see own drafts, evaluators see assigned, admins see all
 * for review). Client keeps every row (no public-only filter here) and marks
 * ownership from the organizer field when present.
 */
export async function listStaffPrograms(params: ProgramListParams): Promise<ProgramListResult> {
  const qs = buildProgramSearchParams(params);
  const res = await get<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    pageSize?: number;
    hasMore?: boolean;
  }>(`/programs${qs}`);
  const pageSize = res.pageSize ?? 10;
  const items = (res.items ?? []).map(normalizeProgramRow);
  const hasMore =
    typeof res.hasMore === 'boolean' ? res.hasMore : res.page * pageSize < (res.total ?? 0);
  return { items, total: res.total ?? items.length, page: res.page ?? 1, hasMore };
}

export interface RegisterPayload {
  committee?: string;
  country?: string;
  sessionId?: string;
}

export async function registerForProgram(programId: string, payload: RegisterPayload): Promise<Registration> {
  return post<Registration>(`/programs/${encodeURIComponent(programId)}/registrations`, payload, {
    idempotencyKey: `${programId}:${payload.committee ?? ''}:${payload.country ?? ''}:${payload.sessionId ?? ''}:${Date.now()}`,
  });
}

export async function withdrawRegistration(registrationId: string): Promise<Registration> {
  return post<Registration>(`/registrations/${encodeURIComponent(registrationId)}/withdraw`);
}

export async function listMyRegistrations(): Promise<Registration[]> {
  const res = await get<{ items: Registration[] } | Registration[]>('/registrations/mine');
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function getSessionRoster(sessionId: string, q: RosterQuery): Promise<RosterPage> {
  const qs = buildRosterParams(q);
  const res = await get<{ items: FullRosterRow[]; total: number; page: number; pageSize: number } | FullRosterRow[]>(
    `/sessions/${encodeURIComponent(sessionId)}/roster${qs}`,
  );
  if (Array.isArray(res)) {
    return { rows: res, total: res.length, page: q.page ?? 1, pageSize: (q.pageSize ?? res.length) || 20 };
  }
  return { rows: res.items, total: res.total, page: res.page, pageSize: res.pageSize };
}

export async function patchAttendance(sessionId: string, presentUserIds: string[]): Promise<void> {
  await patch(`/sessions/${encodeURIComponent(sessionId)}/attendance`, { presentUserIds });
}

export interface ReleaseState {
  released: boolean;
  submitted: number;
  expected: number;
  unavailable: boolean;
}

export interface OutstandingEntry {
  studentId: string;
  name?: string;
  reason: 'NOT_STARTED' | 'DRAFT_INCOMPLETE' | 'UNSUBMITTED' | string;
}

export interface ReleasePreview {
  sessionId: string;
  submitted: number;
  expected: number;
  alreadyReleased: number;
  toRelease: number;
  excluded: number;
  excludedReasons: Array<Record<string, unknown>>;
  /** Phase 1D readiness: required but not releasable. Empty => releasable. */
  outstanding?: OutstandingEntry[];
  outstandingReasons?: OutstandingEntry[];
  outstandingCount?: number;
}

export async function previewReleaseReports(sessionId: string): Promise<ReleasePreview | null> {
  try {
    const res = await post<ReleasePreview>(
      `/sessions/${encodeURIComponent(sessionId)}/release-reports?dryRun=true`,
      {},
    );
    return res;
  } catch {
    return null;
  }
}

export async function getReleaseState(sessionId: string, expected: number): Promise<ReleaseState> {
  const preview = await previewReleaseReports(sessionId);
  if (!preview) return { released: false, submitted: 0, expected, unavailable: true };
  return {
    released: (preview.alreadyReleased ?? 0) > 0,
    submitted: preview.submitted ?? 0,
    expected: preview.expected ?? expected,
    unavailable: false,
  };
}

export interface ReleaseResult extends ReleasePreview {
  releaseId: string;
  released: number;
  repeated?: boolean;
}

export async function releaseReports(sessionId: string, idempotencyKey: string): Promise<ReleaseResult> {
  return post<ReleaseResult>(
    `/sessions/${encodeURIComponent(sessionId)}/release-reports`,
    {},
    { idempotencyKey },
  );
}

export function releaseIdempotencyKey(sessionId: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as { randomUUID(): string }).randomUUID()
      : `${Date.now()}:${Math.floor(Math.random() * 1e9)}`;
  return `release:${sessionId}:${rnd}`;
}

export async function deleteRegistration(registrationId: string): Promise<void> {
  await del(`/registrations/${encodeURIComponent(registrationId)}`);
}
