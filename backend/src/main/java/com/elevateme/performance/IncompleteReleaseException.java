package com.elevateme.performance;

import com.elevateme.common.security.ConflictException;
import java.util.List;
import java.util.Map;

/**
 * Phase 1D release-readiness gate: incomplete sessions MUST block with 409 INCOMPLETE.
 *
 * <p>Carries the outstanding set so the API can list {@code [{studentId, name, reason}]}
 * where reason is NOT_STARTED | DRAFT_INCOMPLETE | UNSUBMITTED, plus the counts
 * submitted / expected / outstanding / excluded for the confirm dialog.
 */
public class IncompleteReleaseException extends ConflictException {
  private final List<Map<String, Object>> outstanding;
  private final int submitted;
  private final int expected;
  private final int excluded;

  public IncompleteReleaseException(
      String message,
      List<Map<String, Object>> outstanding,
      int submitted,
      int expected,
      int excluded) {
    super("INCOMPLETE", message);
    this.outstanding = outstanding == null ? List.of() : List.copyOf(outstanding);
    this.submitted = submitted;
    this.expected = expected;
    this.excluded = excluded;
  }

  public List<Map<String, Object>> getOutstanding() {
    return outstanding;
  }

  public int getSubmitted() {
    return submitted;
  }

  public int getExpected() {
    return expected;
  }

  public int getExcluded() {
    return excluded;
  }

  public int getOutstandingCount() {
    return outstanding.size();
  }
}
