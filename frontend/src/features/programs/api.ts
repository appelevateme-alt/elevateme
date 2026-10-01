import { del, get, patch, post } from '../../lib/api';
import { buildProgramSearchParams, buildRosterParams } from './helpers';
import type { FullRosterRow, Program, Registration, RosterPage, RosterQuery } from './types';

/** Phase 2 program API. Phase 3 release via POST dryRun preview. */

export interface ProgramListParams {
  q?: string;
  theme?: string;
  subtype?: string;
  date?: string;
  location?: string;
  availability?: string;
  page?: number;
}

export interface ProgramListResult {
  items: Program[];
  total: number;
  page: number;
  hasMore: boolean;
}

export async function listPublicPrograms(params: ProgramListParams): Promise<ProgramListResult> {
  const qs = buildProgramSearchParams(params);
  const res = await get<{ items: Program[]; total: number; page: number; hasMore: boolean }>(`/programs${qs}`);
  return res;
}

export async function getProgram(id: string): Promise<Program> {
  return get<Program>(`/programs/${encodeURIComponent(id)}`);
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
  const { patch: patchFn } = await import('../../lib/api');
  return patchFn<Program>(`/programs/${encodeURIComponent(id)}`, payload);
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

export interface ReleasePreview {
  sessionId: string;
  submitted: number;
  expected: number;
  alreadyReleased: number;
  toRelease: number;
  excluded: number;
  excludedReasons: Array<Record<string, unknown>>;
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
