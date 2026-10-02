package com.elevateme.programs;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/**
 * Phase 2 DTOs: programs lifecycle + sessions (spec §9 teacher workspace + §10 + §11).
 *
 * <p>Type vocab (request accepts both legacy camel + canonical upper forms, normalized
 * in service):
 * <ul>
 *   <li>type: SingleEvent|SINGLE_EVENT, Continuous|CONTINUOUS, Special|SPECIAL</li>
  *   <li>subtype: MUN|MODEL_UN, Debate|FRIENDLY_DEBATE, COMPETITION, SPECIAL</li>
 *   <li>themes: PublicSpeaking|Communication|Negotiation|Leadership (subset, may be empty)</li>
 *   <li>visibility: INTERNAL|PUBLIC|INVITE_ONLY</li>
 * </ul>
 * Dates are timestamptz (Instant). Validation of ranges (start&lt;end, registration
 * window inside program window) happens in service → 422 (IllegalArgumentException).
 */
public final class ProgramDtos {
  private ProgramDtos() {}

  /**
   * Phase 1E canonical discovery vocab (shared with frontend
   * {@code features/programs/types}: PROGRAM_THEMES / PROGRAM_TYPES /
   * PROGRAM_SUBTYPES). Exact values — unknown theme/type/subtype ⇒ 422.
   */
  public static final java.util.List<String> CANONICAL_THEMES =
      java.util.List.of("Public Speaking", "Communication", "Negotiation", "Leadership");
  public static final java.util.List<String> CANONICAL_TYPES =
      java.util.List.of("SingleEvent", "Continuous", "Special");
  public static final java.util.List<String> CANONICAL_SUBTYPES =
      java.util.List.of("MUN", "Debate", "Competition", "Special");

  /** Stable public pagination: 10 items per page (see ProgramsService.PAGE_SIZE). */
  public static final int PUBLIC_PAGE_SIZE = 10;

  public record ProgramResponse(String id, String title, String status, Instant startsAt) {}

  public record CreateProgramRequest(
      String type,
      String subtype,
      List<String> themes,
      @NotBlank @Size(max = 200) String title,
      @Size(max = 2000) String description,
      String visibility,
      Instant startsAt,
      Instant endsAt,
      Instant registrationOpensAt,
      Instant registrationDeadline,
      @Size(max = 500) String location,
      @Size(max = 500) String venue,
      @NotNull @Min(1) Integer capacity,
      @Size(max = 2000) String eligibility,
      String instituteId) {}

  public record PatchProgramRequest(
      String type,
      String subtype,
      List<String> themes,
      @Size(max = 200) String title,
      @Size(max = 2000) String description,
      String visibility,
      Instant startsAt,
      Instant endsAt,
      Instant registrationOpensAt,
      Instant registrationDeadline,
      @Size(max = 500) String location,
      @Size(max = 500) String venue,
      @Min(1) Integer capacity,
      @Size(max = 2000) String eligibility,
      @NotNull Integer version) {}

  public record ApproveRequest(
      @NotBlank String decision,
      @Size(max = 2000) String note) {}

  public record SessionCreateRequest(
      @NotBlank @Size(max = 200) String title,
      Instant startsAt,
      Instant endsAt,
      @Size(max = 200) String committee,
      @Size(max = 500) String topic,
      @Size(max = 500) String venue) {}
}
