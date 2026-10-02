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
    version: typeof raw['version'] === 'number' ? (raw['version'] as number) : undefined,
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
  const raw = await post<Record<string, unknown>>('/programs', toBackendCreate(payload));
  return normalizeProgramRow(raw);
}

/**
 * Backend contract mapper (spec §9 + ProgramDtos vocab).
 * The builder speaks UI kinds (MUN|DEBATE|CONTINUOUS), free-picked themes and
 * PUBLISHED_* visibility; the Java API accepts only:
 * type SingleEvent|Continuous|Special, subtype MUN|Debate|Competition|Special,
 * themes ⊆ {Public Speaking, Communication, Negotiation, Leadership},
 * visibility INTERNAL|PUBLIC|INVITE_ONLY.
 * Throws a plain-language Error (shown inline) instead of letting the
 * server answer 422.
 */
export function toBackendCreate(p: CreateProgramPayload): Record<string, unknown> {
  const { type, subtype } = toBackendType(p.kind, p.subtype);
  return {
    title: p.title,
    description: p.description,
    type,
    ...(subtype ? { subtype } : {}),
    themes: [toBackendTheme(p.theme)],
    visibility: toBackendVisibility(p.visibility),
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    ...(p.registrationDeadline ? { registrationDeadline: p.registrationDeadline } : {}),
    location: p.location,
    venue: p.location,
    capacity: p.capacity,
    ...(p.eligibility ? { eligibility: p.eligibility } : {}),
    // NOTE: sessions/committees/organizer are UI-side only — the create DTO
    // has no such fields (unknown props are ignored server-side). Sessions
    // are persisted separately via createSession() after create.
  };
}

function toBackendType(kind: string, subtype?: string): { type: string; subtype?: string } {
  const k = (kind || '').trim().toUpperCase();
  const s = (subtype || '').trim();
  if (k === 'MUN') return { type: 'SingleEvent', subtype: s || 'MUN' };
  if (k === 'DEBATE') return { type: 'SingleEvent', subtype: s || 'Debate' };
  if (k === 'CONTINUOUS') return { type: 'Continuous', ...(s ? { subtype: canonicalSubtype(s) } : {}) };
  throw new Error(`Choose a program kind: MUN, Debate or Continuous (got "${kind}").`);
}

function canonicalSubtype(s: string): string {
  const u = s.trim().toUpperCase();
  if (u === 'MUN' || u === 'MODEL_UN') return 'MUN';
  if (u === 'DEBATE' || u === 'FRIENDLY_DEBATE') return 'Debate';
  if (u === 'COMPETITION') return 'Competition';
  if (u === 'SPECIAL') return 'Special';
  throw new Error(`Unknown subtype "${s}". Use MUN, Debate, Competition or Special.`);
}

export function toBackendTheme(theme: string): string {
  const canon = ['Public Speaking', 'Communication', 'Negotiation', 'Leadership'];
  const low = (theme || '').trim().toLowerCase().replace(/\s+/g, '');
  const hit = canon.find((c) => c.toLowerCase().replace(/\s+/g, '') === low);
  if (!hit) throw new Error('Choose a theme: Public Speaking, Communication, Negotiation or Leadership.');
  return hit;
}

export function toBackendVisibility(v: string): string {
  const u = (v || '').trim().toUpperCase();
  if (u === 'PUBLISHED_PUBLIC' || u === 'PUBLIC') return 'PUBLIC';
  if (u === 'PUBLISHED_TARGETED' || u === 'INVITE_ONLY' || u === 'ASSIGNED' || u === 'PRIVATE') return 'INVITE_ONLY';
  if (u === 'INTERNAL' || u === 'DRAFT') return 'INTERNAL';
  throw new Error('Choose visibility: public or targeted.');
}

/** POST /programs/{id}/sessions — persists one builder session (owner/admin, DRAFT). */
export async function createSession(
  programId: string,
  s: { title: string; startsAt: string; endsAt: string; location?: string; committee?: string },
): Promise<void> {
  await post(`/programs/${encodeURIComponent(programId)}/sessions`, {
    title: s.title,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    ...(s.committee ? { committee: s.committee, topic: s.committee } : {}),
    ...(s.location ? { venue: s.location } : {}),
  });
}

export async function submitProgram(id: string): Promise<Program> {
  return post<Program>(`/programs/${encodeURIComponent(id)}/submit`);
}

export async function saveProgramDraft(
  id: string,
  payload: Partial<CreateProgramPayload>,
  version?: number,
): Promise<Program> {
  if (version == null) throw new Error('Draft version is missing — reload the program and try again.');
  const body: Record<string, unknown> = { version };
  if (payload.title !== undefined) body['title'] = payload.title;
  if (payload.description !== undefined) body['description'] = payload.description;
  if (payload.kind !== undefined || payload.subtype !== undefined) {
    const { type, subtype } = toBackendType(payload.kind ?? '', payload.subtype);
    body['type'] = type;
    if (subtype) body['subtype'] = subtype;
  }
  if (payload.theme !== undefined) body['themes'] = [toBackendTheme(payload.theme)];
  if (payload.visibility !== undefined) body['visibility'] = toBackendVisibility(payload.visibility);
  if (payload.startsAt !== undefined) body['startsAt'] = payload.startsAt;
  if (payload.endsAt !== undefined) body['endsAt'] = payload.endsAt;
  if (payload.registrationDeadline !== undefined) body['registrationDeadline'] = payload.registrationDeadline;
  if (payload.location !== undefined) { body['location'] = payload.location; body['venue'] = payload.location; }
  if (payload.capacity !== undefined) body['capacity'] = payload.capacity;
  if (payload.eligibility !== undefined) body['eligibility'] = payload.eligibility;
  const raw = await patch<Record<string, unknown>>(`/programs/${encodeURIComponent(id)}`, body);
  return normalizeProgramRow(raw);
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
