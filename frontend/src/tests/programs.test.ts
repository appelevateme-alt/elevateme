import { describe, expect, it } from 'vitest';
import {
  basicsSchema, datesLocationSchema, rulesSchema, sessionsSchema, validateBuilderFull,
} from '../features/programs/schemas';
import {
  buildRegistrationSummary, buildRosterParams, canWithdraw, nextActionForLifecycle,
  nextStepsForStatus, registrationRequiresChoice, isPublicStandard, remainingCapacity,
} from '../features/programs/helpers';

describe('programs Phase 2 — builder Zod schemas', () => {
  it('title required', () => {
    const r = basicsSchema.safeParse({ title: '', description: '', kind: 'MUN', theme: 'Diplomacy' });
    expect(r.success).toBe(false);
  });

  it('dates require start<end', () => {
    const bad = datesLocationSchema.safeParse({ startsAt: '2026-05-02T10:00', endsAt: '2026-05-01T10:00', location: 'Hall A' });
    expect(bad.success).toBe(false);
    const ok = datesLocationSchema.safeParse({ startsAt: '2026-05-01T10:00', endsAt: '2026-05-02T10:00', location: 'Hall A' });
    expect(ok.success).toBe(true);
  });

  it('capacity int >= 1', () => {
    expect(rulesSchema.safeParse({ capacity: 0, visibility: 'PUBLISHED_PUBLIC' }).success).toBe(false);
    expect(rulesSchema.safeParse({ capacity: 1.5, visibility: 'PUBLISHED_PUBLIC' }).success).toBe(false);
    expect(rulesSchema.safeParse({ capacity: 30, visibility: 'PUBLISHED_PUBLIC' }).success).toBe(true);
  });

  it('sessions >= 1', () => {
    expect(sessionsSchema.safeParse({ sessions: [], committees: [] }).success).toBe(false);
    expect(sessionsSchema.safeParse({
      sessions: [{ title: 'S1', startsAt: '2026-05-01T10:00', endsAt: '2026-05-01T12:00' }],
      committees: [],
    }).success).toBe(true);
  });

  it('full builder gate combines title/dates/capacity/sessions', () => {
    expect(validateBuilderFull({ title: '', startsAt: '2026-05-01T10:00', endsAt: '2026-05-02T10:00', capacity: 10, sessions: [{ title: 'S1' }] }).ok).toBe(false);
    expect(validateBuilderFull({ title: 'MUN 2026', startsAt: '2026-05-02T10:00', endsAt: '2026-05-01T10:00', capacity: 10, sessions: [{ title: 'S1' }] }).ok).toBe(false);
    expect(validateBuilderFull({ title: 'MUN 2026', startsAt: '2026-05-01T10:00', endsAt: '2026-05-02T10:00', capacity: 0, sessions: [{ title: 'S1' }] }).ok).toBe(false);
    expect(validateBuilderFull({ title: 'MUN 2026', startsAt: '2026-05-01T10:00', endsAt: '2026-05-02T10:00', capacity: 10, sessions: [] }).ok).toBe(false);
  });
});

describe('programs Phase 2 — registration confirmation logic', () => {
  it('summary lists committee/country/session choices', () => {
    const s = buildRegistrationSummary('MUN 2026', { committee: 'UNSC', country: 'Japan', sessionId: 's1' });
    expect(s.lines.join(' ')).toContain('UNSC');
    expect(s.lines.join(' ')).toContain('Japan');
  });

  it('choice requirement varies per program type', () => {
    expect(registrationRequiresChoice('MUN')).toBe('committee-country');
    expect(registrationRequiresChoice('DEBATE')).toBe('session');
    expect(registrationRequiresChoice('CONTINUOUS')).toBe('session');
  });

  it('status maps to exact next steps; never implies attendance', () => {
    expect(nextStepsForStatus('PENDING_PAYMENT')).toContain('48 hours');
    expect(nextStepsForStatus('CONFIRMED')).not.toMatch(/attend/i);
    expect(nextStepsForStatus('WAITLISTED')).toContain('waitlist');
  });

  it('withdraw allowed only before deadline and non-terminal status', () => {
    expect(canWithdraw({ status: 'CONFIRMED' }, new Date('2026-01-01'))).toBe(true);
    expect(canWithdraw({ status: 'WITHDRAWN' }, new Date('2026-01-01'))).toBe(false);
    expect(canWithdraw({ status: 'CONFIRMED', deadline: '2026-01-02T00:00:00Z' }, new Date('2026-02-01'))).toBe(false);
    expect(canWithdraw({ status: 'CONFIRMED', deadline: '2026-03-01T00:00:00Z' }, new Date('2026-02-01'))).toBe(true);
  });

  it('public listing never includes targeted development', () => {
    expect(isPublicStandard({ visibility: 'PUBLISHED_PUBLIC' })).toBe(true);
    expect(isPublicStandard({ visibility: 'PUBLISHED_TARGETED' })).toBe(false);
    expect(isPublicStandard({ visibility: 'DRAFT' })).toBe(false);
  });

  it('remaining capacity floors at zero', () => {
    expect(remainingCapacity({ capacity: 30, registeredCount: 12 })).toBe(18);
    expect(remainingCapacity({ capacity: 10, registeredCount: 14 })).toBe(0);
  });
});

describe('programs Phase 2 — roster search param builder', () => {
  it('builds ?q=&committee=&status= server-side params', () => {
    expect(buildRosterParams({ q: 'Amara', committee: 'UNSC', status: 'submitted' })).toBe('?q=Amara&committee=UNSC&status=submitted');
    expect(buildRosterParams({})).toBe('');
    expect(buildRosterParams({ q: '  ' })).toBe('');
  });
});

describe('programs Phase 2 — status -> next-action mapping', () => {
  it('DRAFT submits, SUBMITTED restricts, PUBLISHED manages, ARCHIVED reads', () => {
    expect(nextActionForLifecycle('DRAFT')).toEqual({ action: 'submit', label: 'Submit for review' });
    expect(nextActionForLifecycle('SUBMITTED').action).toBe('edit-limited');
    expect(nextActionForLifecycle('PUBLISHED').action).toBe('manage');
    expect(nextActionForLifecycle('ARCHIVED').action).toBe('view');
  });
});
