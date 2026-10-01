package com.elevateme.queries;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Phase 5 DTOs: parent/student &lt;-&gt; DI query exchange (spec §10 + §11).
 *
 * <p>Request/reply model, never real-time chat: no bubbles, typing indicators,
 * presence, or reactions. Bodies are sanitized plain text (HTML stripped).
 * Official DI replies are versioned — edits insert a new version row so staff
 * always see history; a reply is never silently rewritten.
 */
public final class QueryDtos {
  private QueryDtos() {}

  public record CreateQueryRequest(
      @NotBlank @Size(max = 120) String title,
      @NotBlank @Size(max = 5000) String body,
      @Size(max = 64) String linkedProgram,
      @Size(max = 64) String linkedReport,
      @Size(max = 128) String idempotencyKey) {}

  /** DI-initiated thread (starts in AWAITING_STUDENT_RESPONSE). */
  public record CreateDiQueryRequest(
      @NotBlank String studentId,
      @NotBlank @Size(max = 120) String title,
      @NotBlank @Size(max = 5000) String body) {}

  public record CommentRequest(@NotBlank @Size(max = 5000) String body) {}

  public record ReplyRequest(@NotBlank @Size(max = 5000) String body) {}

  /** Versioned edit of an official reply (new version row, history kept). */
  public record EditReplyRequest(
      @NotBlank @Size(max = 5000) String body, Integer expectedVersion) {}
}
