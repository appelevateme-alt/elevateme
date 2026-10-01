import type { PeriodKey } from '../../lib/time';

export interface PerformanceQuery {
  criterion: string; // one of CRITERIA_10 | 'Overall Points'
  period: PeriodKey;
  customStart?: string;
  customEnd?: string;
  programId?: string;
  subtype?: string;
  sessionId?: string;
  mode: 'bar' | 'line';
}
