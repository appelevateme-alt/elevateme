package com.elevateme.performance;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 3 atomic release.
 *
 * <p>POST /sessions/{id}/release-reports is atomic (single transaction: preview counts -&gt; lock
 * eligible -&gt; insert release -&gt; flip evaluations -&gt; outbox per recipient) + idempotent
 * (Idempotency-Key actor+operation; concurrent repeats return the same result without
 * double-insert). Preview exposes submitted/expected/excluded; absent/excluded attendance is
 * excluded with reason (never released as zero). Guests can NEVER release (403).
 */
@Service
public class ReleaseService {

  private final ReleaseRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;
  private final AuthContext auth;
  private CriterionAlertReconcileService alertReconciler;

  @Autowired
  public ReleaseService(
      ReleaseRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      IdempotencyService idempotency,
      AuthContext auth) {
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.idempotency = idempotency;
    this.auth = auth;
  }

  /** Legacy 0-arg-style wiring for skeleton tests (repo only). */
  public ReleaseService(ReleaseRepository repo) {
    this(repo, null, null, null, null, null);
  }

  /** Optional alert reconciler (setter-injected; null in unit tests keeps them hermetic). */
  @Autowired(required = false)
  public void setAlertReconciler(CriterionAlertReconcileService alertReconciler) {
    this.alertReconciler = alertReconciler;
  }

  /** Preview counts without writing (submitted / expected / excluded + reasons). */
  public Map<String, Object> preview(String authenticatedSubject, String sessionId, String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    int submitted = repo.countSubmitted(sessionId);
    int expected = repo.countExpected(sessionId);
    List<Map<String, Object>> excluded = repo.findExcludedWithReason(sessionId);
    Map<String, Object> out = new HashMap<>();
    out.put("sessionId", sessionId);
    out.put("submitted", submitted);
    out.put("expected", expected);
    out.put("alreadyReleased", repo.countReleased(sessionId));
    out.put("toRelease", Math.max(0, submitted - excluded.size()));
    out.put("excluded", excluded.size());
    out.put("excludedReasons", excluded);
    return out;
  }

  /**
   * Atomic release with idempotency. {@code isGuest} must be true for ROLE_GUEST callers (403).
   * Kept as an explicit param so unit tests can exercise the gate without SecurityContext.
   */
  @Transactional
  public Map<String, Object> release(
      String authenticatedSubject,
      String sessionId,
      String idempotencyKey,
      String requestId,
      boolean isGuest) {
    if (isGuest) {
      if (audit != null) {
        audit.record(authenticatedSubject, "ACCESS_DENIED", "report_release", sessionId, requestId);
      }
      throw new AccessDeniedException("Guests cannot release reports");
    }
    // Skeleton entrypoint used by early wiring (no guard/audit) — fail closed.
    if (guard == null) {
      throw new UnsupportedOperationException("Release not implemented (skeleton)");
    }
    guard.requireStaffActive(authenticatedSubject, requestId);
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();

    String operation = "POST /api/v1/sessions/{id}/release-reports";
    String payloadHash = IdempotencyService.hashPayload("release:" + sessionId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
      // DB-level repeat-safety: same (actor, key) already released -> same response.
      // Note: Mockito default for Map-returning mocks is an empty map (not null);
      // treat empty/missing id as "no prior" so normal releases don't false-positive.
      Map<String, Object> prior = repo.findReleaseByActorAndKey(actorId, idempotencyKey);
      if (prior != null && prior.get("id") != null) {
        Map<String, Object> priorResponse = buildResponse(sessionId, prior, true);
        idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, priorResponse);
        return priorResponse;
      }
    }

    int submitted = repo.countSubmitted(sessionId);
    int expected = repo.countExpected(sessionId);
    List<Map<String, Object>> excluded = repo.findExcludedWithReason(sessionId);

    // Lock eligible rows first (atomicity: concurrent releases serialize here).
    List<Map<String, Object>> eligible = repo.lockEligibleEvaluations(sessionId);

    String keyForInsert =
        (idempotencyKey == null || idempotencyKey.isBlank())
            ? "auto:" + requestId
            : idempotencyKey;
    String releaseId = repo.insertRelease("SESSION", null, sessionId, actorId, keyForInsert);
    int released = repo.releaseEvaluations(sessionId);

    // Outbox per recipient, same transaction as the release rows.
    if (outbox != null) {
      for (Map<String, Object> e : eligible) {
        String evalId = String.valueOf(e.get("id"));
        outbox.emit(
            "report",
            evalId,
            "REPORT_RELEASED",
            "{\"sessionId\":\"" + sessionId + "\",\"releaseId\":\"" + releaseId + "\"}",
            "REPORT_RELEASED:" + evalId + ":" + releaseId);
      }
    }
    // Criterion-alert reconcile from scratch per released student, same transaction.
    // Backdated-safe (pure Decision ignores earlier starts_at); updates never re-email.
    if (alertReconciler != null) {
      java.util.Set<String> students = new java.util.HashSet<>();
      for (Map<String, Object> e : eligible) {
        Object s = e.get("studentId");
        if (s != null && !"null".equals(String.valueOf(s))) {
          students.add(String.valueOf(s));
        }
      }
      for (String studentId : students) {
        try {
          alertReconciler.reconcileAll(studentId);
        } catch (Exception ignored) {
          // Best-effort: alert store issues never abort the atomic release.
        }
      }
    }
    if (audit != null) {
      audit.record(actorId, "REPORTS_RELEASED", "session", sessionId, requestId);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("releaseId", releaseId);
    out.put("sessionId", sessionId);
    out.put("submitted", submitted);
    out.put("expected", expected);
    out.put("excluded", excluded.size());
    out.put("excludedReasons", excluded);
    out.put("released", released);
    out.put("toRelease", released);
    out.put("alreadyReleased", repo.countReleased(sessionId) - released);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, out);
    }
    return out;
  }

  private Map<String, Object> buildResponse(
      String sessionId, Map<String, Object> prior, boolean repeated) {
    Map<String, Object> out = new HashMap<>();
    out.put("releaseId", String.valueOf(prior.get("id")));
    out.put("sessionId", sessionId);
    out.put("repeated", repeated);
    out.put("submitted", repo.countSubmitted(sessionId));
    out.put("expected", repo.countExpected(sessionId));
    out.put("alreadyReleased", repo.countReleased(sessionId));
    return out;
  }
}
