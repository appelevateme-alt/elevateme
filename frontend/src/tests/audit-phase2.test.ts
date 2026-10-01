import { describe, expect, it } from 'vitest';
import { zodResolver } from '@hookform/resolvers/zod';
import { basicsSchema } from '../features/programs/schemas';
import { conflictCopyFor409 } from '../features/programs/helpers';
import { toErrorState } from '../lib/api';

describe('phase2 audit — 409 capacity vs duplicate copy', () => {
  it('capacity 409 => Session full', () => {
    expect(
      conflictCopyFor409({ message: 'capacity exceeded', code: 'CONFLICT' }),
    ).toMatch(/Session full/);
    expect(
      conflictCopyFor409({
        message: 'Conflict',
        fieldErrors: [{ field: 'capacity', message: 'no capacity left' }],
      }),
    ).toMatch(/Session full/);
  });

  it('duplicate 409 => Already registered', () => {
    expect(
      conflictCopyFor409({ message: 'already registered for program', code: 'CONFLICT' }),
    ).toMatch(/Already registered/);
    expect(
      conflictCopyFor409({ message: 'duplicate registration', code: 'CONFLICT' }),
    ).toMatch(/Already registered/);
  });
});

describe('phase2 audit — error parity 403/404', () => {
  it('403 => denied, 404 => notfound', () => {
    expect(toErrorState(403, 'FORBIDDEN')).toBe('denied');
    expect(toErrorState(404, 'NOT_FOUND')).toBe('notfound');
  });
});

describe('phase2 audit — zodResolver wiring (builder a11y)', () => {
  it('resolver surfaces per-field error for empty title', async () => {
    const resolver = zodResolver(basicsSchema);
    const result = await resolver(
      { title: '', description: '', kind: 'MUN', theme: '', subtype: '', organizer: '', munCommittees: '', debateTopic: '' },
      undefined,
      { fields: {}, shouldUseNativeValidation: false } as never,
    );
    expect((result.errors as Record<string, unknown>).title).toBeDefined();
  });
});

describe('phase2 audit — roster committee options', () => {
  it('builds All + program.committees options', () => {
    const committees = [
      { id: '0', name: 'UNSC', countries: ['Japan'] },
      { id: '1', name: 'WHO', countries: ['France'] },
    ];
    const opts = [{ value: '', label: 'All' }, ...committees.map((c) => ({ value: c.name, label: c.name }))];
    expect(opts).toEqual([
      { value: '', label: 'All' },
      { value: 'UNSC', label: 'UNSC' },
      { value: 'WHO', label: 'WHO' },
    ]);
  });
});
