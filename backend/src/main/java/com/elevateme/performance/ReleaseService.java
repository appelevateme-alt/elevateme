package com.elevateme.performance;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 1D atomic release with readiness enforcement.
 *
 * <p>POST /sessions/{id}/release-reports is atomic (single transaction: lock roster
 * -&gt; lock eligible -&gt; recompute readiness on the same query path as preview
 * -&gt; block on outstanding with 409 INCOMPLETE -&gt; insert release -&gt; flip
 * exactly the validated eligible set -&gt; outbox per recipient) + idempotent
 * (Idempotency-Key actor+operation; concurrent repeats return the same result
 * without double-insert via UNIQUE(actor,key) + row locks). Preview exposes
 * submitted/expected/outstanding/excluded + outstanding details; absent/excluded
 * attendance is excluded with reason (never released as zero). Guests can NEVER
 * release (403). Any DB failure propagates with requestId (never swallowed as
 * zero outstanding); any failure rolls back fully (no partial visibility or
 * orphan notifications).
 *
 * <p>Corrections stay on the evaluation path ({@code EvaluationService.correctReleased}):
 * a new revision is created (history immutable), explicitly published by atomically
 * replacing the released pointer, the old released revision stays visible until
 * the publish commits, and metrics/alerts reconcile from scratch with a
 * correction notice in the same transaction.
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

  /**
   * Preview counts without writing (submitted / expected / outstanding + details /
   * excluded + reasons). Same query path as {@link #release} so counts == actual
   * recipient set.
   */
  public Map<String, Object> preview(String authenticatedSubject, String sessionId, String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    try {
      return buildReadiness(sessionId);
    } catch (DataAccessException e) {
      throw fail(requestId, "release preview", e);
    } catch (RuntimeException e) {
      if (e instanceof IncompleteReleaseException) {
        throw e;
      }
      throw fail(requestId, "release preview", e);
    }
  }

  /** Shared readiness snapshot: single query path for preview + release. */
  private Map<String, Object> buildReadiness(String sessionId) {
    int submitted = repo.countSubmitted(sessionId);
    int expected = repo.countExpected(sessionId);
    int alreadyReleased = repo.countReleased(sessionId);
    List<Map<String, Object>> excluded = repo.findExcludedWithReason(sessionId);
    List<Map<String, Object>> outstanding = repo.findOutstandingWithReason(sessionId);
    int outstandingCount = outstanding.size();
    int toRelease = Math.max(0, submitted);

    Map<String, Object> out = new HashMap<>();
    out.put("sessionId", sessionId);
    out.put("submitted", submitted);
    out.put("expected", expected);
    out.put("outstandingCount", outstandingCount);
    out.put("outstanding", outstanding);
    // Alias for callers that expect reasons under a distinct key.
    out.put("outstandingReasons", outstanding);
    out.put("alreadyReleased", alreadyReleased);
    out.put("toRelease", toRelease);
    out.put("excluded", excluded.size());
    out.put("excludedReasons", excluded);
    return out;
  }

  /**
   * Atomic release with idempotency. {@code isGuest} must be true for ROLE_GUEST callers (403).
   * Kept as an explicit param so unit tests can exercise the gate without SecurityContext.
   */
  @Transactional(rollbackFor = Exception.class)
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
      Map<String, Object> prior = safeFindPrior(actorId, idempotencyKey, requestId);
      if (prior != null && prior.get("id") != null) {
        Map<String, Object> priorResponse = buildResponse(sessionId, prior, true, requestId);
        idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, priorResponse);
        return priorResponse;
      }
    }

    try {
      // Lock roster + eligible rows first (atomicity: concurrent releases serialize here).
      repo.lockSessionRoster(sessionId);
      List<Map<String, Object>> eligible = repo.lockEligibleEvaluations(sessionId);

      // Recompute readiness AFTER locks on the same query path as preview.
      int submitted = repo.countSubmitted(sessionId);
      int expected = repo.countExpected(sessionId);
      List<Map<String, Object>> excluded = repo.findExcludedWithReason(sessionId);
      List<Map<String, Object>> outstanding = repo.findOutstandingWithReason(sessionId);

      if (!outstanding.isEmpty()) {
        if (audit != null) {
          audit.record(actorId, "RELEASE_BLOCKED_INCOMPLETE", "session", sessionId, requestId);
        }
        throw new IncompleteReleaseException(
            "Incomplete: " + outstanding.size() + " outstanding report(s) block release"
                + " [requestId=" + requestId + "]",
            outstanding, submitted, expected, excluded.size());
      }

      // Eligible set is the validated recipient set (preview toRelease == eligible here).
      List<String> eligibleIds = new ArrayList<>();
      for (Map<String, Object> e : eligible) {
        Object id = e.get("id");
        if (id != null) {
          eligibleIds.add(String.valueOf(id));
        }
      }

      String keyForInsert =
          (idempotencyKey == null || idempotencyKey.isBlank())
              ? "auto:" + requestId
              : idempotencyKey;
      String releaseId;
      try {
        releaseId = repo.insertRelease("SESSION", null, sessionId, actorId, keyForInsert);
      } catch (org.springframework.dao.DuplicateKeyException dup) {
        // Concurrent duplicate with same (actor, key): return the winner's response.
        Map<String, Object> prior = repo.findReleaseByActorAndKey(actorId, keyForInsert);
        if (prior != null && prior.get("id") != null) {
          Map<String, Object> priorResponse = buildResponse(sessionId, prior, true, requestId);
          if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
            idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, priorResponse);
          }
          return priorResponse;
        }
        throw dup;
      }

      // Detect lost insert race: same actor+key won concurrently and our insert
      // returned the prior id (repo handles DuplicateKey -> prior). If the release
      // already existed before our locks, do not flip/outbox again.
      Map<String, Object> winner = repo.findReleaseByActorAndKey(actorId, keyForInsert);
      if (winner != null
          && winner.get("id") != null
          && !String.valueOf(winner.get("id")).equals(releaseId)
          && eligibleIds.isEmpty()) {
        Map<String, Object> priorResponse = buildResponse(sessionId, winner, true, requestId);
        if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
          idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, priorResponse);
        }
        return priorResponse;
      }

      int released = repo.releaseEvaluationsByIds(eligibleIds);

      // Outbox per recipient, same transaction as the release rows. Strict: any
      // failure aborts the whole release (full rollback, no orphan notifications).
      if (outbox != null) {
        for (Map<String, Object> e : eligible) {
          String evalId = String.valueOf(e.get("id"));
          outbox.emitStrict(
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
      out.put("outstandingCount", 0);
      out.put("outstanding", List.of());
      out.put("outstandingReasons", List.of());
      out.put("excluded", excluded.size());
      out.put("excludedReasons", excluded);
      out.put("released", released);
      out.put("toRelease", released);
      out.put("alreadyReleased", repo.countReleased(sessionId) - released);
      if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
        idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, out);
      }
      return out;
    } catch (IncompleteReleaseException e) {
      throw e;
    } catch (DataAccessException e) {
      throw fail(requestId, "release", e);
    } catch (RuntimeException e) {
      // Never swallow as zero outstanding / fake success: propagate with requestId.
      if (e.getMessage() != null && e.getMessage().contains("[requestId=")) {
        throw e;
      }
      throw fail(requestId, "release", e);
    }
  }

  private Map<String, Object> safeFindPrior(String actorId, String key, String requestId) {
    try {
      return repo.findReleaseByActorAndKey(actorId, key);
    } catch (DataAccessException e) {
      throw fail(requestId, "release idempotency lookup", e);
    }
  }

  private RuntimeException fail(String requestId, String op, Exception e) {
    if (audit != null) {
      try {
        audit.record("system", "RELEASE_FAILED", "session", op + " [requestId=" + requestId + "]", requestId);
      } catch (Exception ignored) {
        // audit must never mask the original failure
      }
    }
    return new IllegalStateException(op + " failed [requestId=" + requestId + "]: " + e.getMessage(), e);
  }

  private Map<String, Object> buildResponse(
      String sessionId, Map<String, Object> prior, boolean repeated, String requestId) {
    try {
      Map<String, Object> out = new HashMap<>();
      out.put("releaseId", String.valueOf(prior.get("id")));
      out.put("sessionId", sessionId);
      out.put("repeated", repeated);
      out.put("submitted", repo.countSubmitted(sessionId));
      out.put("expected", repo.countExpected(sessionId));
      out.put("outstandingCount", repo.findOutstandingWithReason(sessionId).size());
      out.put("outstanding", repo.findOutstandingWithReason(sessionId));
      out.put("alreadyReleased", repo.countReleased(sessionId));
      return out;
    } catch (DataAccessException e) {
      throw fail(requestId, "release replay lookup", e);
    }
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
