import { get } from '../../lib/api';

export interface ReportMark {
  criterionKey: string;
  label: string;
  score: number | null;
}

export interface ReportListItem {
  id: string;
  evaluationId?: string;
  sessionId?: string | null;
  sessionName?: string | null;
  programName?: string | null;
  programId?: string | null;
  startsAt?: string | null;
  starts_at?: string | null;
  total?: number;
  normalized?: number;
  evaluatorName?: string | null;
  releasedAt?: string | null;
}

export interface ReportDetail extends ReportListItem {
  marks: ReportMark[];
  scores?: Record<string, number>;
  total: number;
  normalized: number;
  remarks?: string;
  correctionReason?: string;
  correctionVersion?: number;
  revisionNo?: number;
  corrected?: boolean;
  evaluatorId?: string | null;
  printFriendly?: boolean;
}

/** GET /me/reports — released only. */
export async function listReports(): Promise<ReportListItem[]> {
  const res = await get<ReportListItem[] | { items?: ReportListItem[] }>('/me/reports');
  if (Array.isArray(res)) return res;
  return res.items ?? [];
}

/** GET /me/reports/:id — released only (?print=true adds print-friendly flag). */
export async function getReport(id: string, print = false): Promise<ReportDetail> {
  const qs = print ? '?print=true' : '';
  return get<ReportDetail>(`/me/reports/${encodeURIComponent(id)}${qs}`);
}
