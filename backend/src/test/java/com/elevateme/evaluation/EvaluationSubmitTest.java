package com.elevateme.evaluation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 3 evaluation submit tests (JUnit5 + Mockito, no DB).
 *
 * <p>Covers: draft allows incomplete (blank != zero); submit requires all 10 int 0-100
 * (101/negative/fractional/missing =&gt; 422); optimistic version mismatch =&gt; 409;
 * server recomputes total/10 and never trusts browser totals.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EvaluationSubmitTest {

  @Mock EvaluationRepository repo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock AuthContext auth;

  private ScoringService scoring;
  private IdempotencyService idempotency;
  private EvaluationService svc;

  private static Map<String, Object> draftEval(String id, int version) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("studentId", "student-1");
    m.put("sessionId", "sess-1");
    m.put("programId", "prog-1");
    m.put("rubricVersionId", "rubric-v2");
    m.put("state", "DRAFT");
    m.put("rowVersion", version);
    return m;
  }

  private static List<Object> ints(int... values) {
    List<Object> out = new ArrayList<>();
    for (int v : values) {
      out.add(v);
    }
    return out;
  }

  private static List<Object> ten(int v) {
    List<Object> out = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      out.add(v);
    }
    return out;
  }

  @BeforeEach
  void setUp() {
    scoring = new ScoringService();
    idempotency = new IdempotencyService();
    svc = new EvaluationService(auth, scoring, repo, guard, audit, outbox, idempotency);
  }

  private void stubRosterOk() {
    doNothing().when(guard).checkRosterAccess(any(), any(), any());
    when(guard.loadCaller(any())).thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
  }

  // ------------------------------------------------------------------
  // 1. Draft allows incomplete (blank != zero)
  // ------------------------------------------------------------------

  @Test
  void draftAllowsIncomplete_blankIsNotZero() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 1));
    when(repo.findLatestRevision("eval-1")).thenReturn(null);
    when(repo.nextRevisionNo("eval-1")).thenReturn(1);
    when(repo.insertRevision(eq("eval-1"), eq(1), any(), eq("DRAFT"), any(), isNull()))
        .thenReturn("rev-1");
    when(repo.updateEvaluationOptimistic(eq("eval-1"), eq(1), isNull())).thenReturn(1);

    // 5 scored, rest blank (absent from list = unscored, never coerced to 0).
    List<Object> partial = ints(80, 70, 60, 50, 40);
    Map<String, Object> out = svc.patchDraft("staff-sub", "eval-1", partial, null, 1, "req-draft");

    assertEquals("DRAFT", out.get("state"));
    assertEquals(5, out.get("scoredCount"));
    assertEquals(80 + 70 + 60 + 50 + 40, out.get("provisionalTotal"));
    // Only provided scores persisted (partial allowed).
    @SuppressWarnings("unchecked")
    ArgumentCaptor<Map<String, Integer>> scoresCap = ArgumentCaptor.forClass(Map.class);
    verify(repo).upsertScores(eq("rev-1"), scoresCap.capture());
    assertEquals(5, scoresCap.getValue().size());
    verify(repo, never()).transitionEvaluationState(any(), anyInt(), any(), any());
  }

  @Test
  void draftNullEntryIsBlank_allowed() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 1));
    when(repo.findLatestRevision("eval-1")).thenReturn(null);
    when(repo.nextRevisionNo("eval-1")).thenReturn(1);
    when(repo.insertRevision(eq("eval-1"), eq(1), any(), eq("DRAFT"), any(), isNull()))
        .thenReturn("rev-1");
    when(repo.updateEvaluationOptimistic(eq("eval-1"), eq(1), isNull())).thenReturn(1);

    List<Object> withBlank = new ArrayList<>(ten(50));
    withBlank.set(3, null); // blank != zero: allowed in draft
    Map<String, Object> out = svc.patchDraft("staff-sub", "eval-1", withBlank, null, 1, "req-draft");
    assertEquals(9, out.get("scoredCount"));
  }

  // ------------------------------------------------------------------
  // 2. Submit requires all 10 int 0-100 (422 paths)
  // ------------------------------------------------------------------

  @Test
  void submitTenValid_computesTotalServerSide() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 2));
    when(repo.findLatestRevision("eval-1")).thenReturn(null);
    when(repo.nextRevisionNo("eval-1")).thenReturn(1);
    when(repo.insertRevision(eq("eval-1"), eq(1), any(), eq("SUBMITTED"), any(), isNull()))
        .thenReturn("rev-2");
    when(repo.transitionEvaluationState("eval-1", 2, "DRAFT", "SUBMITTED")).thenReturn(1);

    Map<String, Object> out = svc.submit("staff-sub", "eval-1", ten(50), 2, "req-submit", "key-1");
    // Server recomputes total/10 (10x50=500, avg 50.0); browser totals never trusted
    // (no total field is accepted on the request path at all).
    assertEquals(500, out.get("total"));
    assertEquals(50.0, out.get("average"));
    assertEquals("SUBMITTED", out.get("state"));
    verify(repo).upsertScores(eq("rev-2"), argThat(m -> m.size() == 10));
    verify(audit).record(eq("staff-1"), eq("EVALUATION_SUBMITTED"), eq("evaluation"), eq("eval-1"), eq("req-submit"));
  }

  @Test
  void submitMissing_fails422() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 1));

    // 9 scores -> 422
    List<Object> nine = ints(50, 50, 50, 50, 50, 50, 50, 50, 50);
    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class,
            () -> svc.submit("staff-sub", "eval-1", nine, 1, "req-1"));
    assertNotNull(ex);

    GlobalExceptionHandler h = new GlobalExceptionHandler();
    var res = h.handleIllegalArg(ex, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());
  }

  @Test
  void submit101_negative_fractional_null_allFail422() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 1));

    // 101
    List<Object> with101 = new ArrayList<>(ten(50));
    with101.set(0, 101);
    assertThrows(IllegalArgumentException.class, () -> svc.submit("staff-sub", "eval-1", with101, 1, "req-101"));

    // -1
    List<Object> withNeg = new ArrayList<>(ten(50));
    withNeg.set(3, -1);
    assertThrows(IllegalArgumentException.class, () -> svc.submit("staff-sub", "eval-1", withNeg, 1, "req-neg"));

    // fractional (Double survives Jackson Object mapping -> rejected as non-integer)
    List<Object> withFraction = new ArrayList<>(ten(50));
    withFraction.set(5, 50.5);
    IllegalArgumentException frac =
        assertThrows(
            IllegalArgumentException.class,
            () -> svc.submit("staff-sub", "eval-1", withFraction, 1, "req-frac"));
    var res = new GlobalExceptionHandler().handleIllegalArg(frac, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());

    // blank (null) != zero -> 422 on submit
    List<Object> withNull = new ArrayList<>(ten(50));
    withNull.set(2, null);
    assertThrows(IllegalArgumentException.class, () -> svc.submit("staff-sub", "eval-1", withNull, 1, "req-null"));

    // null list -> 422
    assertThrows(IllegalArgumentException.class, () -> svc.submit("staff-sub", "eval-1", null, 1, "req-missing"));

    verify(repo, never()).transitionEvaluationState(any(), anyInt(), any(), any());
  }

  @Test
  void draftOutOfRangeAndFractional_fail422() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 1));

    assertThrows(
        IllegalArgumentException.class,
        () -> svc.patchDraft("staff-sub", "eval-1", ints(101), null, 1, "req-1"));
    assertThrows(
        IllegalArgumentException.class,
        () -> svc.patchDraft("staff-sub", "eval-1", ints(-1), null, 1, "req-2"));
    List<Object> frac = new ArrayList<>();
    frac.add(50.5);
    assertThrows(
        IllegalArgumentException.class,
        () -> svc.patchDraft("staff-sub", "eval-1", frac, null, 1, "req-3"));
  }

  // ------------------------------------------------------------------
  // 3. Optimistic version 409
  // ------------------------------------------------------------------

  @Test
  void patchStaleVersion_409() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 5));

    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () -> svc.patchDraft("staff-sub", "eval-1", ints(50), null, 4, "req-stale"));
    assertEquals("VERSION_CONFLICT", conflict.getCode());

    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
    assertEquals("VERSION_CONFLICT", res.getBody().code());
  }

  @Test
  void submitStaleVersion_409() {
    stubRosterOk();
    when(repo.lockEvaluation("eval-1")).thenReturn(draftEval("eval-1", 3));

    ConflictException conflict =
        assertThrows(
            ConflictException.class, () -> svc.submit("staff-sub", "eval-1", ten(60), 2, "req-stale"));
    assertEquals("VERSION_CONFLICT", conflict.getCode());
    verify(repo, never()).transitionEvaluationState(any(), anyInt(), any(), any());
  }

  @Test
  void submitNonDraft_409_invalidState() {
    stubRosterOk();
    Map<String, Object> submitted = draftEval("eval-1", 2);
    submitted.put("state", "SUBMITTED");
    when(repo.lockEvaluation("eval-1")).thenReturn(submitted);

    ConflictException conflict =
        assertThrows(
            ConflictException.class, () -> svc.submit("staff-sub", "eval-1", ten(60), 2, "req-1"));
    assertEquals("INVALID_STATE", conflict.getCode());
  }

  // ------------------------------------------------------------------
  // 4. Reopen staff-only with reason; correction creates NEW revision
  // ------------------------------------------------------------------

  @Test
  void reopenRequiresReason_422_andStaffOnly_403() {
    // Reason required.
    assertThrows(
        IllegalArgumentException.class, () -> svc.reopen("staff-sub", "eval-1", "  ", "req-1"));

    // Staff gate: pending/non-staff -> 403 (guard throws).
    doThrow(new AccessDeniedException("Staff only"))
        .when(guard)
        .requireStaffActive(eq("outsider-sub"), any());
    assertThrows(
        AccessDeniedException.class, () -> svc.reopen("outsider-sub", "eval-1", "mistake", "req-2"));
  }

  @Test
  void reopenSubmitted_reopensToDraft() {
    doNothing().when(guard).requireStaffActive(eq("staff-sub"), any());
    stubRosterOk();
    Map<String, Object> submitted = draftEval("eval-1", 2);
    submitted.put("state", "SUBMITTED");
    when(repo.lockEvaluation("eval-1")).thenReturn(submitted);
    when(repo.transitionEvaluationStateWithCorrection(
            eq("eval-1"), eq(2), eq("SUBMITTED"), eq("DRAFT"), any()))
        .thenReturn(1);

    Map<String, Object> out = svc.reopen("staff-sub", "eval-1", "evaluator error", "req-reopen");
    assertEquals("DRAFT", out.get("state"));
    verify(audit).record(eq("staff-1"), eq("EVALUATION_REOPENED"), eq("evaluation"), eq("eval-1"), eq("req-reopen"));
  }

  @Test
  void correctionCreatesNewRevision_atomicallyReplacesAndNotifies() {
    doNothing().when(guard).requireStaffActive(eq("staff-sub"), any());
    stubRosterOk();
    Map<String, Object> locked = draftEval("eval-1", 4);
    locked.put("state", "LOCKED");
    when(repo.lockEvaluation("eval-1")).thenReturn(locked);
    when(repo.nextRevisionNo("eval-1")).thenReturn(3);
    when(repo.insertRevision(eq("eval-1"), eq(3), any(), eq("SUBMITTED"), any(), eq("fix typo")))
        .thenReturn("rev-3");
    // Single-bump prod path: mock must report 1 updated row or the service throws 409.
    when(repo.pointReleasedWithCorrection(eq("eval-1"), eq(4), eq("rev-3"), any())).thenReturn(1);

    Map<String, Object> out =
        svc.correctReleased("staff-sub", "eval-1", ten(70), "fix typo", 4, "req-correct");

    assertEquals("LOCKED", out.get("state"));
    assertEquals("rev-3", out.get("revisionId"));
    assertEquals(700, out.get("total"));
    assertEquals(70.0, out.get("average"));
    // NEW revision (history preserved), atomic replace, correction notice.
    verify(repo).insertRevision(eq("eval-1"), eq(3), any(), eq("SUBMITTED"), any(), eq("fix typo"));
    verify(repo).pointReleasedWithCorrection(eq("eval-1"), eq(4), eq("rev-3"), any());
    verify(outbox)
        .emit(eq("evaluation"), eq("eval-1"), eq("EVALUATION_CORRECTED"), any(), contains("rev-3"));
    verify(audit)
        .record(eq("staff-1"), eq("EVALUATION_CORRECTED"), eq("evaluation"), eq("eval-1"), eq("req-correct"));
  }

  // ------------------------------------------------------------------
  // 5. Assignment UNIQUE + reassign bumps version + audit
  // ------------------------------------------------------------------

  @Test
  void assignCreates_firstThenReassignBumpsVersion() {
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
    when(repo.findActiveRubricVersionId()).thenReturn("rubric-v2");
    when(repo.findAssignment("student-1", "sess-1")).thenReturn(null);
    when(repo.insertAssignment(eq("student-1"), eq("sess-1"), eq("rubric-v2"), eq("staff-1")))
        .thenReturn("assign-1");
    when(repo.findProgramIdForSession("sess-1")).thenReturn("prog-1");

    Map<String, Object> first = svc.assign("staff-sub", "student-1", "sess-1", "eval-1", "req-1");
    assertEquals("assign-1", first.get("id"));
    assertEquals(1, first.get("version"));
    verify(audit).record(eq("staff-1"), eq("ASSIGNMENT_CREATED"), eq("evaluation_assignment"), eq("assign-1"), eq("req-1"));

    // Reassign: bumps version, audit, invalidates old rights (live row read every check).
    Map<String, Object> existing = new HashMap<>();
    existing.put("id", "assign-1");
    existing.put("rowVersion", 1);
    when(repo.findAssignment("student-1", "sess-1")).thenReturn(existing);
    when(repo.updateAssignmentReassign(eq("assign-1"), eq(1), eq("staff-1"))).thenReturn(1);

    Map<String, Object> second = svc.assign("staff-sub", "student-1", "sess-1", "eval-2", "req-2");
    assertEquals(2, second.get("version"));
    verify(audit).record(eq("staff-1"), eq("ASSIGNMENT_REASSIGNED"), eq("evaluation_assignment"), eq("assign-1"), eq("req-2"));
  }
}
