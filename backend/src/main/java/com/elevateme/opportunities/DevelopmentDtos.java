package com.elevateme.opportunities;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

/**
 * Phase 5 DTOs: development opportunities + offline payment verification
 * (spec §10 + §11).
 *
 * <p>Development events are admin-created with details/date/capacity,
 * FREE|PAID billing, price/currency, an EXTERNAL https payment URL, partner,
 * and deadline. Assignment is targeted only (invisible to non-assignees).
 * Paid registration never confirms on claim: "I have paid" only submits the
 * reference for review; an admin VERIFIED decision confirms. Card data is
 * never accepted or stored — only the external reference.
 */
public final class DevelopmentDtos {
  private DevelopmentDtos() {}

  public record CreateDevelopmentRequest(
      @NotBlank @Size(max = 2000) String details,
      Instant date,
      @Min(1) Integer capacity,
      String billingType,
      Double price,
      @Size(max = 3) String currency,
      @Size(max = 2048) String paymentUrl,
      @Size(max = 200) String partner,
      Instant deadline) {}

  /** Targeted assignment: explicit IDs and/or an institution audience rule. */
  public record AudienceRule(
      String institutionId,
      String criterion,
      String comparator,
      Integer threshold) {}

  public record AssignRequest(
      @Size(max = 500) List<String> recipientIds,
      AudienceRule audienceRule,
      @Size(max = 2000) String reason) {}

  public record ExtendHoldRequest(Instant expiresAt) {}

  public record VerifyPaymentRequest(
      @NotBlank String decision, @Size(max = 2000) String reason) {}
}
