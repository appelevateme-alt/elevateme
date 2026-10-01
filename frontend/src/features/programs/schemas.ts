import { z } from 'zod';

/**
 * Phase 2 builder schemas — one Zod schema per wizard step.
 * Full-program rule: title required, start<end, capacity int >=1, sessions >=1.
 */

export const PROGRAM_KINDS = ['MUN', 'DEBATE', 'CONTINUOUS'] as const;

export const basicsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000).default(''),
  kind: z.enum(PROGRAM_KINDS),
  theme: z.string().trim().min(1, 'Theme is required').max(120),
  subtype: z.string().trim().max(120).optional().default(''),
  organizer: z.string().trim().max(200).optional().default(''),
  // Type-specific (optional at schema level; step UI requires per kind):
  // MUN committee/country seeds, debate topic/session seed.
  munCommittees: z.string().trim().max(2000).optional().default(''),
  debateTopic: z.string().trim().max(500).optional().default(''),
});
export type BasicsInput = z.infer<typeof basicsSchema>;

export const datesLocationSchema = z
  .object({
    startsAt: z.string().min(1, 'Start date is required'),
    endsAt: z.string().min(1, 'End date is required'),
    location: z.string().trim().min(1, 'Location is required').max(300),
    registrationDeadline: z.string().optional().default(''),
  })
  .refine((v) => new Date(v.startsAt).getTime() < new Date(v.endsAt).getTime(), {
    message: 'Start must be before end',
    path: ['endsAt'],
  });
export type DatesLocationInput = z.infer<typeof datesLocationSchema>;

export const sessionInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Session title is required').max(200),
    startsAt: z.string().min(1, 'Session start is required'),
    endsAt: z.string().min(1, 'Session end is required'),
    location: z.string().trim().max(300).optional().default(''),
    committee: z.string().trim().max(200).optional().default(''),
    capacity: z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be >= 1').optional(),
  })
  .refine((v) => new Date(v.startsAt).getTime() < new Date(v.endsAt).getTime(), {
    message: 'Session start must be before end',
    path: ['endsAt'],
  });
export type SessionInput = z.infer<typeof sessionInputSchema>;

export const sessionsSchema = z.object({
  // CONTINUOUS programs require explicit recurring sessions (no implied cadence).
  sessions: z.array(sessionInputSchema).min(1, 'At least one session is required'),
  committees: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Committee name is required').max(200),
        countries: z.string().trim().max(2000).default(''),
      }),
    )
    .default([]),
});
export type SessionsInput = z.infer<typeof sessionsSchema>;

export const rulesSchema = z.object({
  capacity: z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be >= 1'),
  eligibility: z.string().trim().max(2000).optional().default(''),
  visibility: z.enum(['PUBLISHED_PUBLIC', 'PUBLISHED_TARGETED']).default('PUBLISHED_PUBLIC'),
});
export type RulesInput = z.infer<typeof rulesSchema>;

export const builderFullSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  startsAt: z.string().min(1, 'Start date is required'),
  endsAt: z.string().min(1, 'End date is required'),
  capacity: z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be >= 1'),
  sessions: z.array(z.unknown()).min(1, 'At least one session is required'),
});

export function validateBuilderFull(input: {
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  sessions: unknown[];
}): { ok: boolean; errors: string[] } {
  const r = builderFullSchema.safeParse(input);
  if (r.success) {
    if (new Date(input.startsAt).getTime() >= new Date(input.endsAt).getTime()) {
      return { ok: false, errors: ['Start must be before end'] };
    }
    return { ok: true, errors: [] };
  }
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`) };
}
