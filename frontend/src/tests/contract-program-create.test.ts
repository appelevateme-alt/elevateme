import { describe, expect, it } from 'vitest';
import { toBackendCreate, toBackendTheme, toBackendVisibility } from '../features/programs/api';

const base = {
  title: 'Colombo MUN 2026',
  description: 'Inter-school Model UN',
  theme: 'Communication',
  organizer: 'Royal College',
  startsAt: '2026-11-01T09:00:00Z',
  endsAt: '2026-11-02T17:00:00Z',
  location: 'Colombo',
  capacity: 60,
  sessions: [{ title: 'Opening', startsAt: '2026-11-01T09:00:00Z', endsAt: '2026-11-01T12:00:00Z' }],
  committees: [{ name: 'UNSC', countries: ['USA'] }],
};

describe('program create wire contract (UI kinds -> backend DTO)', () => {
  it('MUN maps to SingleEvent/MUN with canonical theme + PUBLIC', () => {
    const dto = toBackendCreate({ ...base, kind: 'MUN', subtype: '', visibility: 'PUBLISHED_PUBLIC' });
    expect(dto).toMatchObject({
      type: 'SingleEvent',
      subtype: 'MUN',
      themes: ['Communication'],
      visibility: 'PUBLIC',
      title: 'Colombo MUN 2026',
      capacity: 60,
    });
  });

  it('DEBATE maps to SingleEvent/Debate, targeted maps to INVITE_ONLY', () => {
    const dto = toBackendCreate({ ...base, kind: 'DEBATE', subtype: '', visibility: 'PUBLISHED_TARGETED' });
    expect(dto).toMatchObject({ type: 'SingleEvent', subtype: 'Debate', visibility: 'INVITE_ONLY' });
  });

  it('CONTINUOUS maps to Continuous; non-backend subtypes fail plainly', () => {
    const dto = toBackendCreate({ ...base, kind: 'CONTINUOUS', subtype: '', visibility: 'PUBLISHED_PUBLIC' });
    expect(dto).toMatchObject({ type: 'Continuous' });
    expect(dto).not.toHaveProperty('subtype');
    expect(() =>
      toBackendCreate({ ...base, kind: 'CONTINUOUS', subtype: 'Workshop', visibility: 'PUBLISHED_PUBLIC' }),
    ).toThrow(/MUN, Debate, Competition or Special/);
  });

  it('drops UI-only sessions/committees/organizer (no silent 422 surface)', () => {
    const dto = toBackendCreate({ ...base, kind: 'MUN', subtype: '', visibility: 'PUBLISHED_PUBLIC' });
    expect(dto).not.toHaveProperty('sessions');
    expect(dto).not.toHaveProperty('committees');
    expect(dto).not.toHaveProperty('kind');
    expect(dto).not.toHaveProperty('organizer');
  });

  it('unknown theme fails with plain guidance, not a server 422', () => {
    expect(() => toBackendTheme('Diplomacy')).toThrow(/Public Speaking, Communication, Negotiation or Leadership/);
    expect(toBackendTheme('  communication ')).toBe('Communication');
  });

  it('unknown visibility fails plainly', () => {
    expect(() => toBackendVisibility('EVERYWHERE')).toThrow(/public or targeted/i);
  });
});
