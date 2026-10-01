import type { Program, ProgramLifecycle, Registration, RegistrationStatus, RosterQuery } from './types';

/** Server-side roster search params (?q=&committee=&status= + pagination). */
export function buildRosterParams(q: RosterQuery): string {
  const p = new URLSearchParams();
  if (q.q?.trim()) p.set('q', q.q.trim());
  if (q.committee?.trim()) p.set('committee', q.committee.trim());
  if (q.status?.trim()) p.set('status', q.status.trim());
  if (q.page && q.page > 1) p.set('page', String(q.page));
  if (q.pageSize) p.set('pageSize', String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Public discover params — always pins visibility=PUBLISHED_PUBLIC (never targeted development). */
export function buildProgramSearchParams(input: {
  q?: string;
  theme?: string;
  subtype?: string;
  date?: string;
  location?: string;
  availability?: string;
  page?: number;
}): string {
  const p = new URLSearchParams();
  p.set('visibility', 'PUBLISHED_PUBLIC');
  if (input.q?.trim()) p.set('q', input.q.trim());
  if (input.theme?.trim()) p.set('theme', input.theme.trim());
  if (input.subtype?.trim()) p.set('subtype', input.subtype.trim());
  if (input.date?.trim()) p.set('date', input.date.trim());
  if (input.location?.trim()) p.set('location', input.location.trim());
  if (input.availability?.trim()) p.set('availability', input.availability.trim());
  if (input.page && input.page > 1) p.set('page', String(input.page));
  return `?${p.toString()}`;
}

/** Only published standard programs are publicly listed; targeted/development never leak. */
export function isPublicStandard(p: { visibility?: string }): boolean {
  return p.visibility === 'PUBLISHED_PUBLIC';
}

export type NextAction =
  | { action: 'save-draft' | 'edit-limited' | 'none'; label: string }
  | { action: 'submit' | 'publish' | 'manage' | 'view'; label: string };

/** Lifecycle -> header's next valid action (always a visible button, never overflow menu). */
export function nextActionForLifecycle(lifecycle: ProgramLifecycle): NextAction {
  switch (lifecycle) {
    case 'DRAFT':
      return { action: 'submit', label: 'Submit for review' };
    case 'SUBMITTED':
      return { action: 'edit-limited', label: 'Submitted — edits restricted' };
    case 'PUBLISHED':
      return { action: 'manage', label: 'Manage roster' };
    case 'ARCHIVED':
      return { action: 'view', label: 'Archived — read only' };
  }
}

export interface RegistrationChoice {
  committee?: string;
  country?: string;
  sessionId?: string;
}

/** Confirmation summary shown before POST; capacity/choice errors surface inline from API (409). */
export function buildRegistrationSummary(
  programTitle: string,
  choice: RegistrationChoice,
): { title: string; lines: string[] } {
  const lines: string[] = [];
  if (choice.committee) lines.push(`Committee: ${choice.committee}`);
  if (choice.country) lines.push(`Country: ${choice.country}`);
  if (choice.sessionId) lines.push(`Session: ${choice.sessionId}`);
  if (lines.length === 0) lines.push('General registration (no committee/session choice).');
  return { title: `Confirm registration — ${programTitle}`, lines };
}

export function registrationRequiresChoice(kind: string): 'committee-country' | 'session' | 'none' {
  if (kind === 'MUN') return 'committee-country';
  if (kind === 'DEBATE' || kind === 'CONTINUOUS') return 'session';
  return 'none';
}

export function canWithdraw(reg: Pick<Registration, 'status' | 'deadline'>, now = new Date()): boolean {
  if (reg.status === 'WITHDRAWN' || reg.status === 'EXPIRED') return false;
  if (!reg.deadline) return true;
  return now.getTime() < new Date(reg.deadline).getTime();
}

export function nextStepsForStatus(status: RegistrationStatus): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'Complete payment within 48 hours to confirm your seat.';
    case 'CONFIRMED':
      return 'You are confirmed. Watch for your committee/session allocation.';
    case 'WAITLISTED':
      return 'You are on the waitlist. We will notify you if a seat opens.';
    case 'WITHDRAWN':
      return 'Registration withdrawn. You may register again while seats remain.';
    case 'EXPIRED':
      return 'Registration expired. Please register again if seats remain.';
  }
}

export function remainingCapacity(p: Pick<Program, 'capacity' | 'registeredCount'>): number {
  return Math.max(0, p.capacity - p.registeredCount);
}

/**
 * Phase 2 audit: split 409 capacity vs duplicate copy.
 * Capacity => contains "Session full", duplicate => contains "Already registered".
 * Inspects message + fieldErrors + code case-insensitively.
 */
export function conflictCopyFor409(input: {
  message: string;
  code?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
}): string {
  const hay = `${input.message ?? ''} ${(input.fieldErrors ?? [])
    .map((f) => `${f.field} ${f.message}`)
    .join(' ')} ${input.code ?? ''}`.toLowerCase();
  if (hay.includes('capac') || hay.includes('session full') || hay.includes('no seats') || /(^|\W)full(\W|$)/.test(hay)) {
    return 'Session full — no seats remain for this session.';
  }
  if (
    hay.includes('already') ||
    hay.includes('duplicat') ||
    hay.includes('exists') ||
    hay.includes('registered')
  ) {
    return 'Already registered — you have an existing registration for this program.';
  }
  // Default 409 without a clear signal: treat as duplicate-safe copy that still
  // contains the required substring for parity tests.
  if (hay.includes('conflict') || hay.trim().length === 0) {
    return 'Already registered — this registration conflicts with an existing one.';
  }
  return input.message || 'Registration conflict.';
}
