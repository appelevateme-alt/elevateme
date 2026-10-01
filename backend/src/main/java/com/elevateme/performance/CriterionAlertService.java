package com.elevateme.performance;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * Phase 4 pure criterion-alert reconcile (no DB, unit-testable).
 *
 * <p>Rules:
 * <ul>
 *   <li>Exactly one ACTIVE row per (student, criterion): partial UNIQUE WHERE resolved_at IS NULL.</li>
 *   <li>On release: latest chronological released score {@code < 30} creates/updates an alert
 *       (evidence = revision, no dup email on update — update evidence only).
 *       Strict: 30 does NOT alert, 29 does (spec §6).</li>
 *   <li>Later chronological score {@code >= 30} (spec §6 resolve threshold: 30+ resolves)
 *       resolves the active alert (resolved_at + note, never delete history).</li>
 *   <li>Backdated release (earlier starts_at than current evidence) does NOT override,
 *       resolve, or reopen current active/resolved state; chronological recalc keeps
 *       current-state semantics.</li>
 *   <li>Dismiss sets acknowledged_at (seen) — NOT resolved. Resolved requires a qualifying
 *       later score or explicit resolve with note.</li>
 *   <li>Correction/void reconciles from scratch (accuracy over history): same rules applied
 *       to the corrected chronological history; correction of the latest updates evidence,
 *       correction of backdated history is ignored for current state.</li>
 *   <li>Report email includes alert info; updates never send a duplicate email.</li>
 * </ul>
 */
public final class CriterionAlertService {
  public static final int ALERT_BELOW = 30;
  /** Spec §6 resolve threshold: 30+ resolves (30 resolves, 29 stays active). */
  public static final int RESOLVE_AT_OR_ABOVE = 30;

  private CriterionAlertService() {}

  /** Chronological score point (released only, sorted starts_at + evaluationId). */
  public record ScorePoint(
      String evaluationId,
      String revisionId,
      String sessionId,
      Instant startsAt,
      int score) {}

  /** Active (or resolved) alert state projection. */
  public record AlertState(
      String studentId,
      String criterionKey,
      int score,
      String evidenceRevisionId,
      String evidenceEvaluationId,
      Instant evidenceStartsAt,
      Instant acknowledgedAt,
      Instant resolvedAt) {
    public boolean isActive() {
      return resolvedAt() == null;
    }

    public boolean isDismissed() {
      return acknowledgedAt() != null && resolvedAt() == null;
    }
  }

  public enum Action {
    CREATE,
    UPDATE_EVIDENCE,
    RESOLVE,
    REOPEN_CREATE,
    NOOP,
    IGNORE_BACKDATED
  }

  public record Decision(Action action, String reason) {}

  /** Latest chronological point, or null when history is empty. */
  public static ScorePoint latest(List<ScorePoint> chronological) {
    if (chronological == null || chronological.isEmpty()) {
      return null;
    }
    return chronological.stream()
        .filter(p -> p != null)
        .max(Comparator.comparing(ScorePoint::startsAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ScorePoint::evaluationId, Comparator.nullsLast(String::compareTo)))
        .orElse(null);
  }

  /** True when candidate is strictly earlier than evidence (backdated, must not override). */
  public static boolean isBackdated(ScorePoint candidate, AlertState active) {
    if (candidate == null || active == null || active.evidenceStartsAt() == null) {
      return false;
    }
    Instant c = candidate.startsAt();
    Instant e = active.evidenceStartsAt();
    if (c == null || e == null) {
      return false;
    }
    int cmp = c.compareTo(e);
    if (cmp < 0) {
      return true;
    }
    if (cmp > 0) {
      return false;
    }
    // Same starts_at: tie-break by evaluation ID (chronological order).
    String cid = candidate.evaluationId();
    String eid = active.evidenceEvaluationId();
    if (cid == null || eid == null) {
      // Same instant but unknown IDs: only a different revision for the SAME evaluation
      // is a correction-update (not backdated); otherwise be conservative and ignore.
      return candidate.revisionId() == null
          || !candidate.revisionId().equals(active.evidenceRevisionId());
    }
    int idCmp = cid.compareTo(eid);
    if (idCmp < 0) {
      return true;
    }
    if (idCmp > 0) {
      return false;
    }
    // Same evaluation: different revision = correction of the same sheet (not backdated).
    return false;
  }

  public static boolean isLow(int score) {
    return score < ALERT_BELOW;
  }

  public static boolean isResolveScore(int score) {
    return score >= RESOLVE_AT_OR_ABOVE;
  }

  /**
   * Reconcile a single (student, criterion) from its full chronological released history
   * plus the current alert row (active or resolved, or null).
   */
  public static Decision reconcile(List<ScorePoint> chronologicalHistory, AlertState current) {
    ScorePoint latestPoint = latest(chronologicalHistory);
    if (latestPoint == null) {
      return new Decision(Action.NOOP, "empty history");
    }

    if (current == null) {
      if (isLow(latestPoint.score())) {
        return new Decision(Action.CREATE, "latest " + latestPoint.score() + " < 30 creates");
      }
      return new Decision(Action.NOOP, "latest " + latestPoint.score() + " needs no alert");
    }

    if (!current.isActive()) {
      // Resolved: backdated low must NOT reopen.
      if (isBackdated(latestPoint, current)) {
        return new Decision(Action.IGNORE_BACKDATED, "backdated low does not reopen resolved");
      }
      if (isLow(latestPoint.score())) {
        // Newer low after resolve -> fresh alert (reopen as new row).
        boolean sameEvidence =
            latestPoint.revisionId() != null
                && latestPoint.revisionId().equals(current.evidenceRevisionId());
        if (sameEvidence) {
          return new Decision(Action.NOOP, "same evidence as resolved, stay resolved");
        }
        return new Decision(Action.REOPEN_CREATE, "newer low after resolve creates fresh alert");
      }
      return new Decision(Action.NOOP, "stay resolved");
    }

    // Active (including dismissed/acknowledged — still active, still dedupes).
    if (isBackdated(latestPoint, current)) {
      return new Decision(Action.IGNORE_BACKDATED, "backdated does not override active evidence");
    }
    boolean sameRevision =
        latestPoint.revisionId() != null
            && latestPoint.revisionId().equals(current.evidenceRevisionId());
    if (isLow(latestPoint.score())) {
      if (sameRevision) {
        return new Decision(Action.NOOP, "same evidence, no dup email");
      }
      return new Decision(Action.UPDATE_EVIDENCE, "newer low updates evidence only, no dup email");
    }
    if (isResolveScore(latestPoint.score())) {
      return new Decision(Action.RESOLVE, "later " + latestPoint.score() + " >= 30 resolves");
    }
    // No hysteresis band: <30 alerts, >=30 resolves (spec §6). Unreachable in
    // practice since isLow/isResolve partition all ints, but keep a safe fallback.
    if (sameRevision) {
      return new Decision(Action.NOOP, "same evidence, stay active");
    }
    return new Decision(Action.UPDATE_EVIDENCE, "refresh evidence, stay active");
  }

  /** Dismiss = acknowledged (seen), NOT resolved (still active, still dedupes). */
  public static boolean isDismiss(AlertState after) {
    return after != null && after.acknowledgedAt() != null && after.resolvedAt() == null;
  }
}
