import type { PhotoUploadState } from '../../lib/photo';

export interface StudentSummary {
  photoUrl?: string;
  elevateMeId: string;
  institute: string;
  programsAttended: number;
  personalBest: number | null;
  pointsGained: number | null;
  baselineLabel: string;
}

/** Phase 1b: private photo upload state for student-home. */
export interface StudentPhotoState {
  status: PhotoUploadState;
  /** Local preview (object URL) — revoked on replace/unmount. Never persisted. */
  previewUrl: string | null;
  /** Inline field error (422-mapped) or retryable failure copy. */
  error: string | null;
  /** Short-lived signed read URL (300s) returned by POST /complete. Never a public URL. */
  photoUrl: string | null;
}

export const STUDENT_HOME_QUERY_KEYS = {
  me: ['me'],
  summary: ['student-home', 'summary'],
} as const;
