export type EvaluationState = 'DRAFT' | 'SUBMITTED' | 'LOCKED';

export interface EvaluationDraft { evaluationId: string; scores: Record<string, number | null>; provisionalTotal: number; locked: boolean; }

export interface EvaluationSheet {
  id: string;
  studentId: string;
  studentName?: string;
  elevateMeId?: string;
  sessionId: string;
  sessionTitle?: string;
  programId?: string;
  state: EvaluationState;
  /** Optimistic-lock row version (server increments on every save). */
  version: number;
  scores: Record<string, number | null>;
  notes: string;
  /** Server-authoritative provisional total (sum) + normalized average (total/10). */
  provisionalTotal: number | null;
  average: number | null;
  scoredCount: number;
  total: number | null;
  revisionId?: string;
}
