package com.elevateme.evaluation;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 3 ten-mark evaluation state machine.
 *
 * <ul>
 *   <li>Assignment UNIQUE (student, session) with row_version; reassign bumps version + audit,
 *       invalidates old rights immediately (scope checks always read the live row).
 *   <li>PATCH draft allows incomplete (null = blank, never coerced to 0); each provided score must
 *       still be int 0-100 (fractional/out-of-range/missing-type =&gt; 422).
 *   <li>Submit requires all 10 int 0-100 (101/negative/fractional/missing =&gt; 422 via
 *       IllegalArgumentException). Optimistic version mismatch =&gt; 409 VERSION_CONFLICT.
 *   <li>Server recomputes total/10 via {@link ScoringService}; browser totals are never trusted.
 *   <li>DRAFT-&gt;SUBMITTED locks; reopen is staff-only with reason; released (LOCKED) edits create
 *       a NEW revision that atomically replaces the released pointer + reconciles + emits a
 *       correction notice.
 * </ul>
 */
@Service
public class EvaluationService {
  private final AuthContext auth;
  private final ScoringService scoring;
  private final EvaluationRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;
  private com.elevateme.performance.CriterionAlertReconcileService alertReconciler;

  /** Legacy 4-arg wiring (Phase 1c callers/tests). */
  public EvaluationService(
      AuthContext auth, ScoringService scoring, EvaluationRepository repo, ScopeGuard guard) {
    this(auth, scoring, repo, guard, null, null, null);
  }

  @Autowired
  public EvaluationService(
      AuthContext auth,
      ScoringService scoring,
      EvaluationRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      IdempotencyService idempotency) {
    this.auth = auth;
    this.scoring = scoring;
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.idempotency = idempotency;
  }

  /** Optional alert reconciler (setter-injected; null in unit tests keeps them hermetic). */
  @Autowired(required = false)
  public void setAlertReconciler(
      com.elevateme.performance.CriterionAlertReconcileService alertReconciler) {
    this.alertReconciler = alertReconciler;
  }

  public List<Map<String, Object>> getEvaluationsForStudent(
      String authenticatedSubject, String studentId, String requestId) {
    return repo.findEvaluationsForStudent(authenticatedSubject, studentId, requestId);
  }

  public Map<String, Object> getEvaluationForStudent(
      String authenticatedSubject, String studentId, String evaluationId, String requestId) {
    return repo.findEvaluationByIdForStudent(authenticatedSubject, studentId, evaluationId, requestId);
  }

  public String currentSubject() {
    return auth.currentSubject();
  }

  // ------------------------------------------------------------------
  // Assignment (UNIQUE student+session, versioned)
  // ------------------------------------------------------------------

  /**
   * Staff assigns (or reassigns) a student sheet in a session. First assign creates the
   * assignment + evaluation rows; reassign bumps assignment row_version + points the evaluation
   * at the new evaluator, invalidating old rights immediately.
   */
  @Transactional
  public Map<String, Object> assign(
      String authenticatedSubject,
      String studentId,
      String sessionId,
      String evaluatorId,
      String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();

    String rubricVersionId = repo.findActiveRubricVersionId();
    Map<String, Object> existing = repo.findAssignment(studentId, sessionId);
    String assignmentId;
    int version;
    if (existing == null) {
      assignmentId = repo.insertAssignment(studentId, sessionId, rubricVersionId, actorId);
      version = 1;
      // One live evaluation row per (student, session).
      String programId = repo.findProgramIdForSession(sessionId);
      try {
        repo.insertEvaluation(studentId, sessionId, programId, evaluatorId, rubricVersionId);
      } catch (Exception e) {
        // Evaluation already exists (UNIQUE student+session race): point it at the evaluator.
        try {
          Map<String, Object> eval = findEvaluationForStudentSession(studentId, sessionId);
          if (eval != null && evaluatorId != null) {
            repo.updateEvaluationEvaluator(
                String.valueOf(eval.get("id")), toInt(eval.get("rowVersion"), 1), evaluatorId);
          }
        } catch (Exception ignored) {
          // Best-effort; assignment is the source of truth for rights.
        }
      }
      audit(actorId, "ASSIGNMENT_CREATED", "evaluation_assignment", assignmentId, requestId);
      emit("evaluation_assignment", assignmentId, "ASSIGNMENT_CREATED", requestId);
    } else {
      assignmentId = String.valueOf(existing.get("id"));
      int currentVersion = toInt(existing.get("rowVersion"), 1);
      int updated = repo.updateAssignmentReassign(assignmentId, currentVersion, actorId);
      if (updated == 0) {
        audit(actorId, "VERSION_CONFLICT", "evaluation_assignment", assignmentId, requestId);
        throw new ConflictException("VERSION_CONFLICT", "Assignment was reassigned; refresh and retry");
      }
      version = currentVersion + 1;
      if (evaluatorId != null) {
        try {
          Map<String, Object> eval = findEvaluationForStudentSession(studentId, sessionId);
          if (eval != null) {
            repo.updateEvaluationEvaluator(
                String.valueOf(eval.get("id")), toInt(eval.get("rowVersion"), 1), evaluatorId);
          }
        } catch (Exception ignored) {
          // Assignment bump already invalidates old rights; evaluator pointer is best-effort.
        }
      }
      audit(actorId, "ASSIGNMENT_REASSIGNED", "evaluation_assignment", assignmentId, requestId);
      emit("evaluation_assignment", assignmentId, "ASSIGNMENT_REASSIGNED", requestId);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("id", assignmentId);
    out.put("studentId", studentId);
    out.put("sessionId", sessionId);
    out.put("version", version);
    return out;
  }

  // ------------------------------------------------------------------
  // Scoped read (evaluator or student path)
  // ------------------------------------------------------------------

  /** Scoped single-sheet read: student-own/admin/linked or session roster (evaluator). */
  public Map<String, Object> getEvaluation(
      String authenticatedSubject, String evaluationId, String requestId) {
    Map<String, Object> eval = repo.findEvaluationRaw(evaluationId);
    String studentId = String.valueOf(eval.get("studentId"));
    String sessionId = String.valueOf(eval.get("sessionId"));
    // Student-own path first (404 on cross-student to avoid enumeration).
    try {
      guard.checkStudentRead(authenticatedSubject, studentId, requestId);
      return withComputedTotal(eval);
    } catch (ResourceNotFoundException | AccessDeniedException e) {
      // Evaluator path: session roster scope.
      guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
      return withComputedTotal(eval);
    }
  }

  /**
   * Guest scoped read: invitation scope already verified (unrelated =&gt; 404).
   * Phase 1C: assigned guests may read DRAFT + SUBMITTED (editable) as well as
   * LOCKED (released, read-only). All three states are returned with server-side
   * totals; drafts survive refresh via this GET. SUBMITTED/LOCKED are read-only
   * (PATCH rejects with INVALID_STATE; only staff reopen corrects).
   */
  public Map<String, Object> getEvaluationForGuest(
      String allowedSessionId, String evaluationId) {
    Map<String, Object> eval = repo.findEvaluationRaw(evaluationId);
    String sessionId = String.valueOf(eval.get("sessionId"));
    if (allowedSessionId == null || !allowedSessionId.equals(sessionId)) {
      throw new ResourceNotFoundException("Not found");
    }
    return buildGuestSheet(evaluationId, eval);
  }

  /** Raw session id for an evaluation (guest scope check helper; 404 when missing). */
  public String findSessionIdForEvaluation(String evaluationId) {
    return String.valueOf(repo.findEvaluationRaw(evaluationId).get("sessionId"));
  }

  /** Raw student id for an evaluation (guest per-student check helper; 404 when missing). */
  public String findStudentIdForEvaluation(String evaluationId) {
    Object v = repo.findEvaluationRaw(evaluationId).get("studentId");
    return v == null ? null : String.valueOf(v);
  }

  /** Evaluation id for an assigned (student, session) pair (guest student route; 404 when missing). */
  public String findEvaluationIdForStudentSession(String studentId, String sessionId) {
    Map<String, Object> row = repo.findEvaluationByStudentSession(studentId, sessionId);
    if (row == null || row.get("id") == null) {
      throw new ResourceNotFoundException("Not found");
    }
    return String.valueOf(row.get("id"));
  }

  /**
   * Guest sheet payload: id + student/session + state + optimistic version +
   * ordered 10-slot scores (null = blank, never 0-coerced) + remarks placeholder
   * + server-authoritative total/10 + scoredCount + revisionId.
   * Scores come from the latest revision; missing revision =&gt; all blank.
   */
  Map<String, Object> buildGuestSheet(String evaluationId, Map<String, Object> eval) {
    Map<String, Object> out = new HashMap<>();
    out.put("id", String.valueOf(eval.get("id")));
    out.put("studentId", eval.get("studentId") == null ? null : String.valueOf(eval.get("studentId")));
    out.put("sessionId", eval.get("sessionId") == null ? null : String.valueOf(eval.get("sessionId")));
    if (eval.get("programId") != null) {
      out.put("programId", String.valueOf(eval.get("programId")));
    }
    out.put("state", String.valueOf(eval.get("state")));
    out.put("version", toInt(eval.get("rowVersion"), 1));
    out.put("rowVersion", toInt(eval.get("rowVersion"), 1));
    // Latest revision scores -> ordered 10-slot array + keyed map (both for compat).
    List<Object> ordered = new ArrayList<>();
    for (int i = 0; i < EvaluationDtos.CRITERION_KEYS.size(); i++) {
      ordered.add(null);
    }
    Map<String, Object> byKey = new LinkedHashMap<>();
    for (String k : EvaluationDtos.CRITERION_KEYS) {
      byKey.put(k, null);
    }
    String revisionId = null;
    try {
      Map<String, Object> latest = repo.findLatestRevision(evaluationId);
      if (latest != null) {
        revisionId = String.valueOf(latest.get("id"));
        List<Map<String, Object>> rows = repo.findScoresForRevision(revisionId);
        Map<String, Integer> byCriterion = new HashMap<>();
        for (Map<String, Object> r : rows) {
          Object key = r.get("criterionKey");
          if (key != null) {
            byCriterion.put(String.valueOf(key), toInt(r.get("score"), 0));
          }
        }
        List<String> keys = EvaluationDtos.CRITERION_KEYS;
        for (int i = 0; i < keys.size(); i++) {
          Integer v = byCriterion.get(keys.get(i));
          ordered.set(i, v);
          byKey.put(keys.get(i), v);
        }
        int total = byCriterion.values().stream().mapToInt(Integer::intValue).sum();
        out.put("total", total);
        out.put("provisionalTotal", total);
        out.put("average", total / 10.0);
        out.put("scoredCount", byCriterion.size());
      } else {
        out.put("total", 0);
        out.put("provisionalTotal", 0);
        out.put("average", 0.0);
        out.put("scoredCount", 0);
      }
    } catch (Exception e) {
      out.putIfAbsent("total", 0);
      out.putIfAbsent("provisionalTotal", 0);
      out.putIfAbsent("average", 0.0);
      out.putIfAbsent("scoredCount", 0);
    }
    out.put("scores", ordered);
    out.put("scoresByCriterion", byKey);
    // No separate remarks column in V3 schema; correction_reason is the only
    // typed free-text (LOCKED corrections). Draft remarks are accepted on PATCH
    // (validated, max 2000) for forward-compat but not persisted separately.
    Object correction = eval.get("correctionReason");
    out.put("remarks", correction == null ? "" : String.valueOf(correction));
    out.put("notes", correction == null ? "" : String.valueOf(correction));
    if (revisionId != null) {
      out.put("revisionId", revisionId);
    }
    return out;
  }

  /**
   * Guest draft PATCH: DRAFT-only, partial scores allowed (null = blank).
   * Assignment check is done by the caller via scope + student checks (404 on
   * mismatch). Version mismatch =&gt; 409 VERSION_CONFLICT. Each provided
   * non-null score must be int 0-100 (else 422). Server recomputes total/10.
   * SUBMITTED/LOCKED =&gt; 409 INVALID_STATE (read-only unless staff reopens).
   */
  @Transactional
  public Map<String, Object> patchDraftAsGuest(
      String evaluationId,
      List<Object> rawScores,
      String remarks,
      Integer expectedVersion,
      String guestActor,
      String requestId) {
    if (expectedVersion == null) {
      throw new IllegalArgumentException("version is required");
    }
    if (remarks != null && remarks.length() > 2000) {
      throw new IllegalArgumentException("remarks max 2000");
    }
    if (rawScores != null && rawScores.size() > ScoringService.REQUIRED_ANSWERS) {
      throw new IllegalArgumentException("at most 10 scores");
    }
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    String state = String.valueOf(locked.get("state"));
    if (!"DRAFT".equals(state)) {
      throw new ConflictException(
          "INVALID_STATE", "Only DRAFT sheets can be patched (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    if (currentVersion != expectedVersion) {
      audit(guestActor, "VERSION_CONFLICT", "evaluation", evaluationId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    List<Integer> present = new ArrayList<>();
    if (rawScores != null) {
      for (Object o : rawScores) {
        if (o == null) {
          continue;
        }
        if (!(o instanceof Integer v)) {
          throw new IllegalArgumentException("scores must be integers 0-100 (blank != zero)");
        }
        if (v < ScoringService.MIN_SCORE || v > ScoringService.MAX_SCORE) {
          throw new IllegalArgumentException("scores must be integers 0-100 (got " + v + ")");
        }
        present.add(v);
      }
    }
    Map<String, Object> revision = repo.findLatestRevision(evaluationId);
    String revisionId;
    if (revision == null || !"DRAFT".equals(String.valueOf(revision.get("state")))) {
      int revNo = repo.nextRevisionNo(evaluationId);
      revisionId =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "DRAFT",
              null,
              null);
    } else {
      revisionId = String.valueOf(revision.get("id"));
    }
    if (rawScores != null) {
      repo.deleteScoresForRevision(revisionId);
      Map<String, Integer> nonNull = new LinkedHashMap<>();
      List<String> keys = EvaluationDtos.CRITERION_KEYS;
      for (int i = 0; i < rawScores.size() && i < keys.size(); i++) {
        Object o = rawScores.get(i);
        if (o instanceof Integer v) {
          nonNull.put(keys.get(i), v);
        }
      }
      if (!nonNull.isEmpty()) {
        repo.upsertScores(revisionId, nonNull);
      }
    }
    int updated = repo.updateEvaluationOptimistic(evaluationId, currentVersion, remarks);
    if (updated == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    audit(guestActor, "EVALUATION_DRAFT_SAVED", "evaluation", evaluationId, requestId);
    int provisionalTotal = present.stream().mapToInt(Integer::intValue).sum();
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "DRAFT");
    out.put("version", currentVersion + 1);
    out.put("provisionalTotal", provisionalTotal);
    out.put("total", provisionalTotal);
    out.put("average", provisionalTotal / 10.0);
    out.put("scoredCount", present.size());
    return out;
  }

  /**
   * Guest submit: DRAFT-&gt;SUBMITTED, all 10 int 0-100 required (else 422).
   * Version mismatch =&gt; 409. Server recomputes total/10. SUBMITTED locks the
   * sheet (read-only unless staff reopens).
   */
  @Transactional
  public Map<String, Object> submitAsGuest(
      String evaluationId,
      List<Object> rawScores,
      Integer expectedVersion,
      String guestActor,
      String requestId) {
    if (expectedVersion == null) {
      throw new IllegalArgumentException("version is required");
    }
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    String state = String.valueOf(locked.get("state"));
    if (!"DRAFT".equals(state)) {
      throw new ConflictException(
          "INVALID_STATE", "Only DRAFT sheets can be submitted (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    if (currentVersion != expectedVersion) {
      audit(guestActor, "VERSION_CONFLICT", "evaluation", evaluationId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    List<Object> effective = rawScores;
    if (effective == null) {
      effective = storedDraftAsRaw(evaluationId);
    }
    scoring.validateRaw(effective);
    List<Integer> ints = toInts(effective);
    int total = scoring.total(ints);
    double average = scoring.average(ints);
    Map<String, Object> revision = repo.findLatestRevision(evaluationId);
    String revisionId;
    if (revision != null && "DRAFT".equals(String.valueOf(revision.get("state")))) {
      String draftRevisionId = String.valueOf(revision.get("id"));
      repo.deleteScoresForRevision(draftRevisionId);
      repo.upsertScores(draftRevisionId, mapByCriterionNonNull(effective));
      int revNo = repo.nextRevisionNo(evaluationId);
      revisionId =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "SUBMITTED",
              null,
              null);
      repo.upsertScores(revisionId, mapByCriterionNonNull(effective));
    } else {
      int revNo = repo.nextRevisionNo(evaluationId);
      revisionId =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "SUBMITTED",
              null,
              null);
      repo.upsertScores(revisionId, mapByCriterionNonNull(effective));
    }
    int updated = repo.transitionEvaluationState(evaluationId, currentVersion, "DRAFT", "SUBMITTED");
    if (updated == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Submit race; refresh and retry");
    }
    audit(guestActor, "EVALUATION_SUBMITTED", "evaluation", evaluationId, requestId);
    emit("evaluation", evaluationId, "EVALUATION_SUBMITTED", requestId);
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "SUBMITTED");
    out.put("version", currentVersion + 1);
    out.put("revisionId", revisionId);
    out.put("total", total);
    out.put("average", average);
    return out;
  }

  // ------------------------------------------------------------------
  // Draft patch (DRAFT-only, partial allowed, optimistic version)
  // ------------------------------------------------------------------

  /**
   * PATCH draft: DRAFT-only, partial scores allowed (null = blank, never 0). Each provided
   * non-null score must be int 0-100; fractional/out-of-range/type mismatch =&gt; 422.
   * Version mismatch =&gt; 409 VERSION_CONFLICT. Server recomputes the provisional total.
   */
  @Transactional
  public Map<String, Object> patchDraft(
      String authenticatedSubject,
      String evaluationId,
      List<Object> rawScores,
      String notes,
      Integer expectedVersion,
      String requestId) {
    if (expectedVersion == null) {
      throw new IllegalArgumentException("version is required");
    }
    if (rawScores != null && rawScores.size() > ScoringService.REQUIRED_ANSWERS) {
      throw new IllegalArgumentException("at most 10 scores");
    }
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    guard.checkRosterAccess(authenticatedSubject, String.valueOf(locked.get("sessionId")), requestId);
    enforceEvaluatorAccess(authenticatedSubject, locked, requestId);
    String state = String.valueOf(locked.get("state"));
    if (!"DRAFT".equals(state)) {
      throw new ConflictException("INVALID_STATE", "Only DRAFT sheets can be patched (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    if (currentVersion != expectedVersion) {
      audit(actor(authenticatedSubject), "VERSION_CONFLICT", "evaluation", evaluationId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    // Validate each provided score (null = blank allowed in draft).
    List<Integer> present = new ArrayList<>();
    if (rawScores != null) {
      for (Object o : rawScores) {
        if (o == null) {
          continue; // blank != zero: allowed, simply unscored
        }
        if (!(o instanceof Integer v)) {
          throw new IllegalArgumentException("scores must be integers 0-100 (blank != zero)");
        }
        if (v < ScoringService.MIN_SCORE || v > ScoringService.MAX_SCORE) {
          throw new IllegalArgumentException("scores must be integers 0-100 (got " + v + ")");
        }
        present.add(v);
      }
    }
    // Persist draft scores against the live DRAFT revision (create one if absent).
    Map<String, Object> revision = repo.findLatestRevision(evaluationId);
    String revisionId;
    if (revision == null || !"DRAFT".equals(String.valueOf(revision.get("state")))) {
      int revNo = repo.nextRevisionNo(evaluationId);
      revisionId =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "DRAFT",
              actor(authenticatedSubject),
              null);
    } else {
      revisionId = String.valueOf(revision.get("id"));
    }
    if (rawScores != null) {
      Map<String, Integer> byCriterion = mapByCriterion(rawScores);
      // Draft replace: clear then insert only provided non-null scores (partial allowed).
      repo.deleteScoresForRevision(revisionId);
      Map<String, Integer> nonNull = new LinkedHashMap<>();
      List<String> keys = EvaluationDtos.CRITERION_KEYS;
      for (int i = 0; i < rawScores.size() && i < keys.size(); i++) {
        Object o = rawScores.get(i);
        if (o instanceof Integer v) {
          nonNull.put(keys.get(i), v);
        }
      }
      if (!nonNull.isEmpty()) {
        repo.upsertScores(revisionId, nonNull);
      }
      // Silence unused warning: byCriterion mirrors the same mapping for audit clarity.
      if (byCriterion.size() == -1) {
        throw new IllegalStateException("unreachable");
      }
    }
    int updated = repo.updateEvaluationOptimistic(evaluationId, currentVersion, notes);
    if (updated == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    audit(actor(authenticatedSubject), "EVALUATION_DRAFT_SAVED", "evaluation", evaluationId, requestId);
    // Provisional total recomputed server-side (partial sum; never trusts browser).
    int provisionalTotal = present.stream().mapToInt(Integer::intValue).sum();
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "DRAFT");
    out.put("version", currentVersion + 1);
    out.put("provisionalTotal", provisionalTotal);
    out.put("scoredCount", present.size());
    return out;
  }

  // ------------------------------------------------------------------
  // Submit (DRAFT -> SUBMITTED, all 10 required)
  // ------------------------------------------------------------------

  @Transactional
  public Map<String, Object> submit(
      String authenticatedSubject,
      String evaluationId,
      List<Object> rawScores,
      Integer expectedVersion,
      String requestId) {
    return submit(authenticatedSubject, evaluationId, rawScores, expectedVersion, requestId, null);
  }

  /**
   * Submit: DRAFT-&gt;SUBMITTED locks the sheet. Requires all 10 int 0-100
   * (101/negative/fractional/missing =&gt; 422). Version mismatch =&gt; 409.
   * Total/average recomputed server-side. Idempotency-Key repeat-safe.
   */
  @Transactional
  public Map<String, Object> submit(
      String authenticatedSubject,
      String evaluationId,
      List<Object> rawScores,
      Integer expectedVersion,
      String requestId,
      String idempotencyKey) {
    String operation = "POST /api/v1/evaluations/{id}/submit";
    String payloadHash =
        IdempotencyService.hashPayload(
            "submit:" + evaluationId + ":" + canonicalRaw(rawScores) + ":" + expectedVersion);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    if (expectedVersion == null) {
      throw new IllegalArgumentException("version is required");
    }
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    guard.checkRosterAccess(authenticatedSubject, String.valueOf(locked.get("sessionId")), requestId);
    enforceEvaluatorAccess(authenticatedSubject, locked, requestId);
    String state = String.valueOf(locked.get("state"));
    if (!"DRAFT".equals(state)) {
      throw new ConflictException(
          "INVALID_STATE", "Only DRAFT sheets can be submitted (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    if (currentVersion != expectedVersion) {
      audit(actor(authenticatedSubject), "VERSION_CONFLICT", "evaluation", evaluationId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    // Resolve scores: explicit body wins; otherwise use stored draft scores.
    List<Object> effective = rawScores;
    if (effective == null) {
      effective = storedDraftAsRaw(evaluationId);
    }
    // Strict submit validation: exactly 10 integers 0-100 (blank != zero).
    scoring.validateRaw(effective);
    List<Integer> ints = toInts(effective);
    int total = scoring.total(ints);
    double average = scoring.average(ints);

    Map<String, Object> revision = repo.findLatestRevision(evaluationId);
    String revisionId;
    if (revision != null && "DRAFT".equals(String.valueOf(revision.get("state")))) {
      revisionId = String.valueOf(revision.get("id"));
      repo.deleteScoresForRevision(revisionId);
      repo.upsertScores(revisionId, mapByCriterionNonNull(effective));
      // Flip revision DRAFT -> SUBMITTED via a new SUBMITTED revision row? Keep the same row
      // lineage: close the DRAFT revision and open a SUBMITTED one for immutability.
      int revNo = repo.nextRevisionNo(evaluationId);
      String submittedRevision =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "SUBMITTED",
              actor(authenticatedSubject),
              null);
      repo.upsertScores(submittedRevision, mapByCriterionNonNull(effective));
      revisionId = submittedRevision;
    } else {
      int revNo = repo.nextRevisionNo(evaluationId);
      revisionId =
          repo.insertRevision(
              evaluationId,
              revNo,
              String.valueOf(locked.get("rubricVersionId")),
              "SUBMITTED",
              actor(authenticatedSubject),
              null);
      repo.upsertScores(revisionId, mapByCriterionNonNull(effective));
    }
    int updated = repo.transitionEvaluationState(evaluationId, currentVersion, "DRAFT", "SUBMITTED");
    if (updated == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Submit race; refresh and retry");
    }
    audit(actor(authenticatedSubject), "EVALUATION_SUBMITTED", "evaluation", evaluationId, requestId);
    emit("evaluation", evaluationId, "EVALUATION_SUBMITTED", requestId);
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "SUBMITTED");
    out.put("version", currentVersion + 1);
    out.put("revisionId", revisionId);
    out.put("total", total);
    out.put("average", average);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, out);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Reopen (staff-only with reason, SUBMITTED -> DRAFT)
  // ------------------------------------------------------------------

  /** Reopen a SUBMITTED sheet back to DRAFT (staff-only, reason required + audit). */
  @Transactional
  public Map<String, Object> reopen(
      String authenticatedSubject, String evaluationId, String reason, String requestId) {
    if (reason == null || reason.isBlank()) {
      throw new IllegalArgumentException("reason is required");
    }
    guard.requireStaffActive(authenticatedSubject, requestId);
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    guard.checkRosterAccess(authenticatedSubject, String.valueOf(locked.get("sessionId")), requestId);
    String state = String.valueOf(locked.get("state"));
    if (!"SUBMITTED".equals(state)) {
      throw new ConflictException(
          "INVALID_STATE", "Only SUBMITTED sheets can be reopened (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    int updated =
        repo.transitionEvaluationStateWithCorrection(
            evaluationId, currentVersion, "SUBMITTED", "DRAFT", reason.trim());
    if (updated == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Reopen race; refresh and retry");
    }
    audit(actor(authenticatedSubject), "EVALUATION_REOPENED", "evaluation", evaluationId, requestId);
    emit("evaluation", evaluationId, "EVALUATION_REOPENED", requestId);
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "DRAFT");
    out.put("version", currentVersion + 1);
    return out;
  }

  // ------------------------------------------------------------------
  // Correction (LOCKED -> new revision, atomic replace + reconcile + notice)
  // ------------------------------------------------------------------

  /**
   * Correct a released (LOCKED) sheet: creates a NEW revision (never mutates the released one),
   * atomically replaces the released pointer, reconciles totals, and emits a correction notice
   * via the outbox — all in one transaction.
   */
  @Transactional
  public Map<String, Object> correctReleased(
      String authenticatedSubject,
      String evaluationId,
      List<Object> rawScores,
      String correctionReason,
      Integer expectedVersion,
      String requestId) {
    if (correctionReason == null || correctionReason.isBlank()) {
      throw new IllegalArgumentException("correction reason is required");
    }
    if (expectedVersion == null) {
      throw new IllegalArgumentException("version is required");
    }
    guard.requireStaffActive(authenticatedSubject, requestId);
    Map<String, Object> locked = repo.lockEvaluation(evaluationId);
    guard.checkRosterAccess(authenticatedSubject, String.valueOf(locked.get("sessionId")), requestId);
    enforceEvaluatorAccess(authenticatedSubject, locked, requestId);
    String state = String.valueOf(locked.get("state"));
    if (!"LOCKED".equals(state)) {
      throw new ConflictException(
          "INVALID_STATE", "Only LOCKED (released) sheets can be corrected (current: " + state + ")");
    }
    int currentVersion = toInt(locked.get("rowVersion"), 1);
    if (currentVersion != expectedVersion) {
      audit(actor(authenticatedSubject), "VERSION_CONFLICT", "evaluation", evaluationId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    if (rawScores == null) {
      throw new IllegalArgumentException("exactly 10 scores required (got null)");
    }
    scoring.validateRaw(rawScores);
    List<Integer> ints = toInts(rawScores);
    int total = scoring.total(ints);
    double average = scoring.average(ints);

    // NEW revision (immutable history preserved); old released revision untouched.
    int revNo = repo.nextRevisionNo(evaluationId);
    String newRevisionId =
        repo.insertRevision(
            evaluationId,
            revNo,
            String.valueOf(locked.get("rubricVersionId")),
            "SUBMITTED",
            actor(authenticatedSubject),
            correctionReason.trim());
    repo.upsertScores(newRevisionId, mapByCriterionNonNull(rawScores));
    // Atomic replace + reconcile in ONE update (single row_version bump, not +2).
    int corrected =
        repo.pointReleasedWithCorrection(
            evaluationId, currentVersion, newRevisionId, correctionReason.trim());
    if (corrected == 0) {
      throw new ConflictException("VERSION_CONFLICT", "Correction race; refresh and retry");
    }
    audit(actor(authenticatedSubject), "EVALUATION_CORRECTED", "evaluation", evaluationId, requestId);
    // Correction notice (per-recipient fan-out happens via outbox relay).
    if (outbox != null) {
      outbox.emit(
          "evaluation",
          evaluationId,
          "EVALUATION_CORRECTED",
          "{\"revisionId\":\"" + newRevisionId + "\"}",
          "EVALUATION_CORRECTED:" + evaluationId + ":" + newRevisionId);
    }
    // Correction reconciles alerts from scratch (accuracy over history), same transaction.
    if (alertReconciler != null) {
      try {
        Object student = locked.get("studentId");
        if (student != null && !"null".equals(String.valueOf(student))) {
          alertReconciler.reconcileAll(String.valueOf(student));
        }
      } catch (Exception ignored) {
        // Best-effort: alert store issues never abort the correction.
      }
    }
    Map<String, Object> out = new HashMap<>();
    out.put("id", evaluationId);
    out.put("state", "LOCKED");
    out.put("version", currentVersion + 1);
    out.put("revisionId", newRevisionId);
    out.put("total", total);
    out.put("average", average);
    return out;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private void audit(String actor, String action, String entity, String entityId, String requestId) {
    if (audit != null) {
      audit.record(actor, action, entity, entityId, requestId);
    }
  }

  private void emit(String aggregateType, String aggregateId, String eventType, String requestId) {
    if (outbox != null) {
      outbox.emit(
          aggregateType,
          aggregateId,
          eventType,
          "{\"requestId\":\"" + requestId + "\"}",
          eventType + ":" + aggregateId + ":" + requestId);
    }
  }

  private String actor(String subject) {
    try {
      ScopeGuard.CallerProfile caller = guard.loadCaller(subject);
      return caller == null ? subject : caller.id();
    } catch (Exception e) {
      return subject;
    }
  }

  private Map<String, Object> findEvaluationForStudentSession(String studentId, String sessionId) {
    // Live evaluator pointer for reassign: id + row_version + evaluator_id.
    try {
      return repo.findEvaluationByStudentSession(studentId, sessionId);
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Phase 3 audit fix: evaluator enforcement. Caller must be the assigned evaluator, an
   * admin, or the program owner (via ScopeGuard). Otherwise 403 + audit (old evaluator
   * after reassign is denied here). Unassigned sheets (evaluator_id null, pre-pointer
   * rows) allow any roster-scoped staff for back-compat.
   */
  private void enforceEvaluatorAccess(
      String authenticatedSubject, Map<String, Object> locked, String requestId) {
    String sessionId =
        locked.get("sessionId") == null ? null : String.valueOf(locked.get("sessionId"));
    String evaluationId =
        locked.get("id") == null ? null : String.valueOf(locked.get("id"));
    Object rawEvaluator = locked.get("evaluatorId");
    String evaluatorId =
        rawEvaluator == null ? null : String.valueOf(rawEvaluator);
    ScopeGuard.CallerProfile caller = null;
    try {
      caller = guard.loadCaller(authenticatedSubject);
    } catch (Exception ignored) {
      // fall through to denial
    }
    String actorId = caller == null ? authenticatedSubject : caller.id();
    if (caller != null && caller.isAdmin()) {
      return;
    }
    try {
      if (caller != null && sessionId != null && guard.isProgramOwner(caller.id(), sessionId)) {
        return;
      }
    } catch (Exception ignored) {
      // fall through to evaluator match
    }
    if (evaluatorId == null || evaluatorId.isBlank() || "null".equals(evaluatorId)) {
      return;
    }
    if (evaluatorId.equals(actorId)) {
      return;
    }
    if (authenticatedSubject != null && authenticatedSubject.equals(evaluatorId)) {
      return;
    }
    audit(actor(authenticatedSubject), "ACCESS_DENIED", "evaluation", evaluationId, requestId);
    throw new AccessDeniedException("Not permitted");
  }

  private Map<String, Object> withComputedTotal(Map<String, Object> eval) {
    try {
      String evalId = String.valueOf(eval.get("id"));
      Map<String, Object> latest = repo.findLatestRevision(evalId);
      if (latest == null) {
        return eval;
      }
      List<Map<String, Object>> scores =
          repo.findScoresForRevision(String.valueOf(latest.get("id")));
      int total = scores.stream().mapToInt(s -> toInt(s.get("score"), 0)).sum();
      Map<String, Object> out = new HashMap<>(eval);
      out.put("total", total);
      out.put("average", total / 10.0);
      out.put("scoredCount", scores.size());
      return out;
    } catch (Exception e) {
      return eval;
    }
  }

  private List<Object> storedDraftAsRaw(String evaluationId) {
    Map<String, Object> latest = repo.findLatestRevision(evaluationId);
    if (latest == null) {
      throw new IllegalArgumentException("exactly 10 scores required (got null)");
    }
    List<Map<String, Object>> rows = repo.findScoresForRevision(String.valueOf(latest.get("id")));
    if (rows.size() != ScoringService.REQUIRED_ANSWERS) {
      throw new IllegalArgumentException(
          "exactly 10 scores required (got " + rows.size() + ")");
    }
    Map<String, Integer> byKey = new HashMap<>();
    for (Map<String, Object> r : rows) {
      byKey.put(String.valueOf(r.get("criterionKey")), toInt(r.get("score"), 0));
    }
    List<Object> out = new ArrayList<>();
    for (String k : EvaluationDtos.CRITERION_KEYS) {
      if (!byKey.containsKey(k)) {
        throw new IllegalArgumentException("exactly 10 scores required (missing " + k + ")");
      }
      out.add(byKey.get(k));
    }
    return out;
  }

  static Map<String, Integer> mapByCriterion(List<Object> raw) {
    Map<String, Integer> out = new LinkedHashMap<>();
    List<String> keys = EvaluationDtos.CRITERION_KEYS;
    for (int i = 0; i < raw.size() && i < keys.size(); i++) {
      Object o = raw.get(i);
      if (o instanceof Integer v) {
        out.put(keys.get(i), v);
      }
    }
    return out;
  }

  static Map<String, Integer> mapByCriterionNonNull(List<Object> raw) {
    Map<String, Integer> out = new LinkedHashMap<>();
    List<String> keys = EvaluationDtos.CRITERION_KEYS;
    for (int i = 0; i < raw.size() && i < keys.size(); i++) {
      Object o = raw.get(i);
      if (o instanceof Integer v) {
        out.put(keys.get(i), v);
      }
    }
    return out;
  }

  private static List<Integer> toInts(List<Object> raw) {
    List<Integer> out = new ArrayList<>();
    for (Object o : raw) {
      out.add((Integer) o);
    }
    return out;
  }

  private static String canonicalRaw(List<Object> raw) {
    if (raw == null) {
      return "null";
    }
    StringBuilder sb = new StringBuilder();
    for (Object o : raw) {
      sb.append(o == null ? "null" : o.toString()).append(",");
    }
    return sb.toString();
  }

  private static int toInt(Object v, int dflt) {
    if (v == null) {
      return dflt;
    }
    if (v instanceof Number n) {
      return n.intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (Exception e) {
      return dflt;
    }
  }
}
