/** Phase 2 program domain types (frontend view of /api/v1). Phase 1E canonical discovery vocab. */

export const PROGRAM_THEMES = ['Public Speaking', 'Communication', 'Negotiation', 'Leadership'] as const;
export type ProgramTheme = (typeof PROGRAM_THEMES)[number];

export const PROGRAM_TYPES = ['SingleEvent', 'Continuous', 'Special'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_SUBTYPES = ['MUN', 'Debate', 'Competition', 'Special'] as const;
export type ProgramSubtype = (typeof PROGRAM_SUBTYPES)[number];

/** Stable public pagination: 10 items per page (backend ProgramsService.PAGE_SIZE). */
export const PROGRAM_PAGE_SIZE = 10;

export type ProgramKind = 'MUN' | 'DEBATE' | 'CONTINUOUS';
export type ProgramVisibility =
  | 'PUBLISHED_PUBLIC'
  | 'PUBLISHED_TARGETED'
  | 'DRAFT'
  | 'PUBLIC'
  | 'PRIVATE'
  | 'INTERNAL'
  | 'INVITE_ONLY'
  | 'ASSIGNED';
export type ProgramLifecycle =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface ProgramSession {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  /** MUN committee / debate topic / continuous slot label. */
  committee?: string;
  capacity?: number;
}

export interface ProgramCommittee {
  id: string;
  name: string;
  /** MUN only. */
  countries: string[];
}

export interface Program {
  id: string;
  title: string;
  description: string;
  kind: ProgramKind;
  theme: string;
  /** Backend canonical: themes array (first entry mirrors `theme` for compat). */
  themes?: string[];
  /** Backend canonical display type (SingleEvent|Continuous|Special). Mirrored from `type`. */
  type?: string;
  subtype?: string;
  visibility: ProgramVisibility;
  lifecycle: ProgramLifecycle;
  startsAt: string;
  endsAt: string;
  location: string;
  capacity: number;
  registeredCount: number;
  organizer: string;
  eligibility?: string;
  registrationDeadline?: string;
  sessions: ProgramSession[];
  committees: ProgramCommittee[];
}

export type RegistrationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'WAITLISTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

export interface Registration {
  id: string;
  programId: string;
  programTitle: string;
  status: RegistrationStatus;
  committee?: string;
  country?: string;
  sessionId?: string;
  allocation?: string;
  createdAt: string;
  deadline?: string;
  paymentReference?: string;
}

export type AttendanceMark = 'attended' | 'absent' | 'unmarked';
export type ReportStatus = 'draft' | 'submitted' | 'released';

export interface FullRosterRow {
  id: string;
  name: string;
  photoUrl?: string;
  elevateMeId: string;
  /** Committee/country or session allocation label. */
  allocation: string;
  attendance: AttendanceMark;
  assignedEvaluator?: string;
  reportStatus: ReportStatus;
}

export interface RosterPage {
  rows: FullRosterRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RosterQuery {
  q?: string;
  committee?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}
