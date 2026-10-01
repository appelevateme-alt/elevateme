/**
 * Backend priority vocab is HIGH|MED|LOW (RecommendationsService.normalizePriority).
 * 'MEDIUM' is a legacy UI alias — always normalized to 'MED' at the API boundary
 * via normalizePriorityForBackend(). Reads accept both.
 */
export type RecommendationPriority = 'HIGH' | 'MED' | 'LOW' | 'MEDIUM';
export type RecommendationStatus = 'Active' | 'Completed';

export interface Recommendation {
  id: string;
  author?: string | null;
  authorName?: string | null;
  title: string;
  action: string;
  reason: string;
  criterion?: string | null;
  criterionKey?: string | null;
  reportId?: string | null;
  priority: RecommendationPriority;
  dueDate?: string | null;
  due_date?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  status: RecommendationStatus | string;
  ownerId?: string | null;
  completedBy?: string | null;
  completedAt?: string | null;
  pinned?: boolean | null;
}
