package com.elevateme.performance;

import java.util.List;
import java.util.Map;

/**
 * Phase 4 DTOs for /me/performance + /me/insights + /me/reports.
 *
 * <p>Rules encoded (see services for enforcement):
 * <ul>
 *   <li>strict alert iff score &lt; 30 (29 flags, 30 does not)</li>
 *   <li>delta = latest - previous; DECLINE iff delta &lt;= -7; IMPROVEMENT iff delta &gt;= +16;
 *       else MATCHED (tie/stable)</li>
 *   <li>insights ordering: low, decline, best, improvement, strengths (then stable/baseline)</li>
 *   <li>released-only + scope/sample; chronological starts_at + evaluation ID</li>
 * </ul>
 */
public final class PerformanceDtos {
  private PerformanceDtos() {}

  public record ReportResponse(String id, String title, boolean released) {}

  public record ReleasePreviewResponse(int eligibleCount, int alreadyReleasedCount, int toReleaseCount) {}

  public record ReleaseRequest(boolean dryRun) {}

  public record InsightsResponse(List<String> insights) {}

  /** /me/performance row: released evaluation + 10 scores + total/1000 + normalized/100. */
  public record PerformanceRow(
      String evaluationId,
      String sessionId,
      String sessionName,
      String programName,
      String startsAt,
      Map<String, Integer> scores,
      int total,
      double normalized) {}

  public record PerformanceResponse(List<Map<String, Object>> rows, Map<String, Object> scope) {}

  public record InsightsItemResponse(
      String type,
      String criterionKey,
      String criterionLabel,
      String message,
      String basedOn,
      Map<String, Object> evidence,
      boolean inTop5) {}

  public record InsightsListResponse(
      List<InsightsItemResponse> insights,
      List<InsightsItemResponse> top5,
      int total,
      boolean hasMore,
      String scopeLabel,
      String evidenceWindow,
      int sampleSize) {}
}
