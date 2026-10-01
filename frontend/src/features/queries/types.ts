/**
 * Backend field names (QueryDtos.CreateQueryRequest):
 * {title, body, linkedProgram, linkedReport} + `Idempotency-Key` header.
 * programId/reportId are legacy UI aliases mapped at the boundary.
 */
export interface QueryCreate { title: string; body: string; idempotencyKey: string; linkedProgram?: string | null; linkedReport?: string | null; programId?: string | null; reportId?: string | null; }
export interface QueryThread {
  id: string;
  title: string;
  status: 'In review' | 'Replied' | 'Closed' | 'Open' | string;
  body?: string | null;
  query?: string | null;
  reply?: string | null;
  replyBody?: string | null;
  initiatedBy?: 'student' | 'parent' | 'di' | string | null;
  createdAt?: string | null;
  created_at?: string | null;
  programId?: string | null;
  reportId?: string | null;
}

export interface QueryComment { id: string; from: 'you' | 'di'; body: string; when: string; }

export const QUERY_LIMITS = { titleMax: 120, bodyMax: 5000 } as const;
export const QUERY_PAGE_SIZE = 10;
