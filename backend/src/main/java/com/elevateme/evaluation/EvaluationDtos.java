package com.elevateme.evaluation;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Domain rules (TODO enforced in ScoringService + validation annotations):
 * - scores INT 0-100; all 10 required on submit; blank != zero (null fails);
 * - total/10 math (avg = total/10.0); chronological starts_at+ID ordering for baseline/best/gain;
 * - fractional values fail 422 (Jackson/validation rejects non-integers).
 */
public final class EvaluationDtos {
  private EvaluationDtos() {}

  public static final List<String> CRITERION_KEYS =
      List.of(
          "preparation",
          "clarity",
          "confidence",
          "focus",
          "critical_analysis",
          "sound",
          "audience_addressing",
          "counter_arguments",
          "wit",
          "overall_performance");

  public record ScoreAnswer(
      @NotNull(message = "score is required (blank != zero)") @Min(value = 0, message = "min 0")
          @Max(value = 100, message = "max 100")
          Integer score) {}

  public record SubmitRequest(
      @NotNull @Size(min = 10, max = 10, message = "exactly 10 scores required")
          List<@NotNull ScoreAnswer> answers) {}

  public record PatchRequest(
      // Draft patch may be partial; submit requires all 10 (see ScoringService.validateForSubmit).
      @Size(max = 10) List<@NotNull ScoreAnswer> answers,
      @Size(max = 2000) String notes) {}

  public record EvaluationResponse(String id, String status, Integer total, Double average) {}

  // ------------------------------------------------------------------
  // Phase 3: raw-score DTOs (fractional-safe).
  //
  // Jackson maps JSON ints to Integer and JSON decimals to Double when the
  // target is Object, so fractional values survive deserialization and can be
  // rejected as 422 via ScoringService.validateRaw (blank != zero). Typed
  // Integer DTOs would fail earlier as 400 (HttpMessageNotReadable), which
  // GlobalExceptionHandler also maps to 422 for this domain.
  // ------------------------------------------------------------------

  /** Staff assignment of a student sheet in a session. */
  public record AssignmentRequest(
      @NotBlank(message = "studentId is required") String studentId,
      @NotBlank(message = "sessionId is required") String sessionId,
      String evaluatorId) {}

  /** Draft patch: partial scores allowed (null = blank, never coerced to 0). */
  public record DraftPatchRequest(
      @Size(max = 10, message = "at most 10 scores") List<Object> scores,
      @Size(max = 2000, message = "notes max 2000") String notes,
      @NotNull(message = "version is required") Integer version) {}

  /** Submit: all 10 required; version for optimistic locking. */
  public record SubmitScoresRequest(
      @NotNull(message = "scores are required") List<Object> scores,
      @NotNull(message = "version is required") Integer version) {}

  public record ReopenRequest(
      @NotBlank(message = "reason is required") @Size(max = 2000) String reason) {}

  /** Correction of a LOCKED (released) sheet: new revision + reason. */
  public record CorrectionRequest(
      @NotNull(message = "scores are required") List<Object> scores,
      @NotBlank(message = "correction reason is required") @Size(max = 2000) String reason,
      @NotNull(message = "version is required") Integer version) {}

  public record CommentBankCreateRequest(
      @NotBlank(message = "scope is required") String scope,
      String criterionKey,
      @NotBlank(message = "text is required") @Size(min = 1, max = 2000) String text) {}
}
