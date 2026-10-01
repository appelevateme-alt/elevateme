package com.elevateme.recommendations;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/**
 * Phase 5 DTOs: targeted recommendations (spec §9 admin + §10 + §11).
 *
 * <ul>
 *   <li>Audience preview: explicit individual IDs and/or institution and/or a
 *       criterion rule over the LATEST RELEASED criterion score with an explicit
 *       comparator. Missing scores are NEVER coerced to zero — students without a
 *       released score for the criterion are excluded, never matched.</li>
 *   <li>Create: title/action/reason + skill area + priority HIGH|MED|LOW + optional
 *       due date + frozen audience snapshot + optional linked report. The audience
 *       is snapshotted at publish time: later-matching students do NOT receive the
 *       historical recommendation. IDs are deduplicated; at most 3 pinned per
 *       student (admin pin order).</li>
 *   <li>Patch (own only): completion/undo (+optional pin/note) on the caller's own
 *       recipient row. A linked parent may complete with shared attribution
 *       (completed_by = parent); the group message is unchanged for others.</li>
 * </ul>
 */
public final class RecommendationDtos {
  private RecommendationDtos() {}

  /** Criterion targeting rule: explicit comparator, never implicit. */
  public record CriterionRule(
      @NotBlank String criterion,
      @NotBlank String comparator,
      Integer threshold) {}

  public record AudiencePreviewRequest(
      @Size(max = 500) List<String> individualIds,
      String institutionId,
      CriterionRule criterionRule,
      @Size(max = 500) List<String> explicitBatch) {}

  public record CreateRecommendationsRequest(
      @NotBlank @Size(max = 200) String title,
      @NotBlank @Size(max = 2000) String action,
      @NotBlank @Size(max = 2000) String reason,
      @Size(max = 120) String skillArea,
      @NotBlank String priority,
      Instant dueDate,
      @Size(max = 500) List<String> individualIds,
      String institutionId,
      CriterionRule criterionRule,
      @Size(max = 500) List<String> explicitBatch,
      String linkedReportId,
      Boolean pinned) {}

  public record PatchRecommendationRequest(
      Boolean completed, Boolean pinned, @Size(max = 2000) String note) {}
}
