package com.elevateme.participation;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Phase 2 DTOs: registrations + attendance + roster (spec §10 + §11).
 *
 * <p>Registration statuses (DB, V6 superset): canonical UPPER
 * PENDING|CONFIRMED|WAITLISTED|REJECTED|CANCELLED|WITHDRAWN plus legacy TitleCase
 * Pending|Confirmed|Waitlisted|Rejected|Cancelled. New writes use UPPER
 * (CONFIRMED on register, WITHDRAWN on withdraw); reads compare UPPER(status).
 * Attendance statuses (DB): ATTENDED|ABSENT|EXCLUDED. Absence is NOT a zero score —
 * attendance never writes evaluation_scores (see ParticipationService).
 */
public final class ParticipationDtos {
  private ParticipationDtos() {}

  public record RegisterRequest(
      String sessionId,
      @Size(max = 500) String allocation,
      @Size(max = 500) String note) {}

  public record AttendanceRecord(
      @NotBlank String studentId,
      @NotBlank String status,
      @Size(max = 1000) String reason) {}

  public record AttendancePatchRequest(
      @NotNull @Size(min = 1) List<AttendanceRecord> records) {}

  public record InvitationCreateRequest(
      @Size(max = 320) String email, @Size(max = 200) String displayName) {}

  public record GuestExchangeRequest(@NotBlank @Size(max = 2048) String fragment) {}

  public record AssignmentCreateRequest(
      @NotBlank(message = "studentId is required") String studentId, String evaluatorId) {}

  public record PaymentReferenceRequest(@NotBlank @Size(max = 128) String reference) {}
}
