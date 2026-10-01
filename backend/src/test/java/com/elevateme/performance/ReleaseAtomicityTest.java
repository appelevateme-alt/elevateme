package com.elevateme.performance;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Release atomicity + readiness enforcement + repeat-safety (JUnit5 + Mockito, no DB).
 *
 * <ol>
 *   <li>Preview exposes submitted/expected/outstanding + details/excluded (absent excluded with reason).
 *   <li>Incomplete blocks with 409 INCOMPLETE + outstanding details (never silently released).
 *   <li>POST with Idempotency-Key K -&gt; 200 + counts; repeat same POST with Key K -&gt; SAME
 *       response, no duplicate release rows.
 *   <li>Concurrent duplicate (same actor+key wins) -&gt; single release, no dupes.
 *   <li>Mid-transaction fault -&gt; zero partial releases (atomic rollback: no outbox/audit).
 *   <li>Outbox rows are written in the same transaction as releases (per recipient, strict).
 *   <li>Excluded absent never blocks and never becomes a zero score.
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReleaseAtomicityTest {

  @Mock ReleaseRepository repo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock AuthContext auth;

  private IdempotencyService idempotency;
  private ReleaseService svc;

  @BeforeEach
  void setUp() {
    idempotency = new IdempotencyService();
    svc = new ReleaseService(repo, guard, audit, outbox, idempotency, auth);
  }

  private void stubStaffOk() {
    doNothing().when(guard).requireStaffActive(eq("staff-sub"), any());
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
  }

  private static Map<String, Object> eval(String id) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("studentId", "student-" + id);
    m.put("latestRevisionId", "rev-" + id);
    return m;
  }

  private static Map<String, Object> outstanding(String studentId, String name, String reason) {
    Map<String, Object> m = new HashMap<>();
    m.put("studentId", studentId);
    m.put("name", name);
    m.put("reason", reason);
    return m;
  }

  // ------------------------------------------------------------------
  // 1. Preview counts + outstanding details
  // ------------------------------------------------------------------

  @Test
  void previewExposesSubmittedExpectedExcluded() {
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(repo.countSubmitted("sess-1")).thenReturn(8);
    when(repo.countExpected("sess-1")).thenReturn(10);
    when(repo.countReleased("sess-1")).thenReturn(2);
    when(repo.findExcludedWithReason("sess-1"))
        .thenReturn(
            List.of(
                Map.of("studentId", "s-absent", "status", "ABSENT", "reason", "sick"),
                Map.of("studentId", "s-excl", "status", "EXCLUDED", "reason", "misconduct")));
    when(repo.findOutstandingWithReason("sess-1")).thenReturn(List.of());

    Map<String, Object> preview = svc.preview("staff-sub", "sess-1", "req-preview");

    assertEquals(8, preview.get("submitted"));
    assertEquals(10, preview.get("expected"));
    assertEquals(2, preview.get("excluded"));
    assertEquals(2, preview.get("alreadyReleased"));
    assertEquals(0, preview.get("outstandingCount"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> reasons =
        (List<Map<String, Object>>) preview.get("excludedReasons");
    assertEquals(2, reasons.size());
  }

  @Test
  void previewListsOutstandingWithReasons() {
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(repo.countSubmitted("sess-1")).thenReturn(2);
    when(repo.countExpected("sess-1")).thenReturn(5);
    when(repo.countReleased("sess-1")).thenReturn(0);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.findOutstandingWithReason("sess-1"))
        .thenReturn(
            List.of(
                outstanding("s-1", "Asha", "NOT_STARTED"),
                outstanding("s-2", "Bala", "DRAFT_INCOMPLETE"),
                outstanding("s-3", "Chen", "UNSUBMITTED")));

    Map<String, Object> preview = svc.preview("staff-sub", "sess-1", "req-p");

    assertEquals(2, preview.get("submitted"));
    assertEquals(5, preview.get("expected"));
    assertEquals(3, preview.get("outstandingCount"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> out = (List<Map<String, Object>>) preview.get("outstanding");
    assertEquals(3, out.size());
    assertEquals("NOT_STARTED", out.get(0).get("reason"));
    assertEquals("DRAFT_INCOMPLETE", out.get(1).get("reason"));
    assertEquals("UNSUBMITTED", out.get(2).get("reason"));
    assertTrue(out.stream().allMatch(m -> m.get("studentId") != null && m.get("name") != null));
  }

  // ------------------------------------------------------------------
  // 2. Incomplete blocks 409 INCOMPLETE (not generic)
  // ------------------------------------------------------------------

  @Test
  void incompleteBlocks409WithOutstandingDetails() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(2);
    when(repo.countExpected("sess-1")).thenReturn(5);
    when(repo.countReleased("sess-1")).thenReturn(0);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.findOutstandingWithReason("sess-1"))
        .thenReturn(
            List.of(
                outstanding("s-1", "Asha", "NOT_STARTED"),
                outstanding("s-2", "Bala", "DRAFT_INCOMPLETE")));
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2")));
    doNothing().when(repo).lockSessionRoster("sess-1");

    IncompleteReleaseException blocked =
        assertThrows(
            IncompleteReleaseException.class,
            () -> svc.release("staff-sub", "sess-1", "K-block", "req-1", false));
    assertEquals("INCOMPLETE", blocked.getCode());
    assertEquals(2, blocked.getOutstandingCount());
    assertEquals(2, blocked.getOutstanding().size());

    // 409 INCOMPLETE (not generic): handler renders outstanding + requestId.
    var res =
        new GlobalExceptionHandler().handleIncomplete(blocked, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
    assertEquals("INCOMPLETE", res.getBody().get("code"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> bodyOutstanding =
        (List<Map<String, Object>>) res.getBody().get("outstanding");
    assertEquals(2, bodyOutstanding.size());

    // Blocked: no release row, no flips, no outbox.
    verify(repo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(repo, never()).releaseEvaluationsByIds(any());
    verify(repo, never()).releaseEvaluations(any());
    verify(outbox, never()).emitStrict(any(), any(), any(), any(), any());
  }

  // ------------------------------------------------------------------
  // 3. Repeat-safe: same key -> SAME response, no duplicate rows
  // ------------------------------------------------------------------

  @Test
  void releaseIsAtomicAndRepeatSafe() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(5);
    when(repo.countExpected("sess-1")).thenReturn(6);
    when(repo.countReleased("sess-1")).thenReturn(0).thenReturn(3).thenReturn(3);
    when(repo.findExcludedWithReason("sess-1"))
        .thenReturn(List.of(Map.of("studentId", "s-absent", "status", "ABSENT", "reason", "sick")));
    when(repo.findOutstandingWithReason("sess-1")).thenReturn(List.of());
    List<Map<String, Object>> eligible = List.of(eval("e1"), eval("e2"), eval("e3"));
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(eligible);
    doNothing().when(repo).lockSessionRoster("sess-1");
    when(repo.insertRelease(eq("SESSION"), isNull(), eq("sess-1"), eq("staff-1"), eq("K")))
        .thenReturn("rel-1");
    when(repo.releaseEvaluationsByIds(any())).thenReturn(3);

    Map<String, Object> first = svc.release("staff-sub", "sess-1", "K", "req-1", false);
    assertEquals("rel-1", first.get("releaseId"));
    assertEquals(3, first.get("released"));
    assertEquals(5, first.get("submitted"));
    // Outbox per recipient, same transaction as the release rows (strict: rollback on failure).
    verify(outbox, times(3)).emitStrict(eq("report"), any(), eq("REPORT_RELEASED"), any(), any());
    verify(audit)
        .record(eq("staff-1"), eq("REPORTS_RELEASED"), eq("session"), eq("sess-1"), eq("req-1"));

    // Repeat same POST with Key K -> SAME response, no duplicate release rows.
    Map<String, Object> replay = svc.release("staff-sub", "sess-1", "K", "req-2", false);
    assertEquals(first, replay, "idempotent replay must return the stored response");
    verify(repo, times(1)).insertRelease(any(), any(), any(), any(), any());
    verify(repo, times(1)).releaseEvaluationsByIds(any());
    verify(outbox, times(3)).emitStrict(eq("report"), any(), eq("REPORT_RELEASED"), any(), any());
  }

  @Test
  void concurrentDuplicateSameKey_noDupes_singleRelease() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(2);
    when(repo.countExpected("sess-1")).thenReturn(2);
    when(repo.countReleased("sess-1")).thenReturn(2);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.findOutstandingWithReason("sess-1")).thenReturn(List.of());
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2")));
    doNothing().when(repo).lockSessionRoster("sess-1");
    // Race: pre-lock idempotency lookup sees nothing (empty = no prior), the
    // concurrent winner's row appears by the post-insert check. insertRelease
    // itself maps UNIQUE(actor,key) -> prior id (repo handles DuplicateKey).
    when(repo.findReleaseByActorAndKey(eq("staff-1"), eq("K-conc")))
        .thenReturn(Map.of())
        .thenReturn(Map.of("id", "rel-winner", "sessionId", "sess-1"));
    when(repo.insertRelease(any(), any(), any(), any(), eq("K-conc"))).thenReturn("rel-winner");
    when(repo.releaseEvaluationsByIds(any())).thenReturn(2);

    Map<String, Object> out = svc.release("staff-sub", "sess-1", "K-conc", "req-1", false);
    assertEquals("rel-winner", out.get("releaseId"));
    // Single flip + single outbox fan-out (dedupe_key keeps relay safe on true races).
    verify(repo, times(1)).insertRelease(any(), any(), any(), any(), any());
    verify(outbox, times(2)).emitStrict(eq("report"), any(), eq("REPORT_RELEASED"), any(), any());
  }

  @Test
  void differingPayloadSameKey_409() {
    // Idempotency scope is actor+operation: same key with a different session payload -> 409.
    String op = "POST /api/v1/sessions/{id}/release-reports";
    Map<String, Object> first = Map.of("releaseId", "rel-1");
    idempotency.store("staff-sub", op, "K", IdempotencyService.hashPayload("release:sess-1"), first);
    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () ->
                idempotency.checkReplay(
                    "staff-sub", op, "K", IdempotencyService.hashPayload("release:sess-OTHER")));
    assertEquals("IDEMPOTENCY_CONFLICT", conflict.getCode());
    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // 4. Atomic rollback: fault mid-transaction -> zero partial releases
  // ------------------------------------------------------------------

  @Test
  void faultMidTransaction_noPartialReleases() {
    stubStaffOk();
    when(repo.lockEligibleEvaluations("sess-1")).thenThrow(new RuntimeException("lock timeout"));

    assertThrows(
        RuntimeException.class, () -> svc.release("staff-sub", "sess-1", "K-fault", "req-1", false));

    // Atomic: no release row, no evaluation flips, no outbox, no success audit on failure.
    verify(repo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(repo, never()).releaseEvaluationsByIds(any());
    verify(repo, never()).releaseEvaluations(any());
    verify(outbox, never()).emitStrict(any(), any(), any(), any(), any());
    verify(outbox, never()).emit(any(), any(), any(), any(), any());
    verify(audit, never()).record(eq("staff-1"), eq("REPORTS_RELEASED"), eq("session"), eq("sess-1"), any());
  }

  @Test
  void dbFailure_neverSwallowedAsZero_propagatesWithRequestId() {
    stubStaffOk();
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1")));
    doNothing().when(repo).lockSessionRoster("sess-1");
    when(repo.countSubmitted("sess-1"))
        .thenThrow(new org.springframework.dao.TransientDataAccessResourceException("db down"));

    RuntimeException err =
        assertThrows(
            RuntimeException.class, () -> svc.release("staff-sub", "sess-1", "K-db", "req-77", false));
    assertTrue(err.getMessage().contains("req-77"), "failure must propagate with requestId");
    verify(repo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(outbox, never()).emitStrict(any(), any(), any(), any(), any());
  }

  @Test
  void outboxFailure_abortsRelease_noSilentPartial() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(2);
    when(repo.countExpected("sess-1")).thenReturn(2);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.findOutstandingWithReason("sess-1")).thenReturn(List.of());
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2")));
    doNothing().when(repo).lockSessionRoster("sess-1");
    when(repo.insertRelease(any(), any(), any(), any(), any())).thenReturn("rel-9");
    when(repo.releaseEvaluationsByIds(any())).thenReturn(2);
    doThrow(new RuntimeException("outbox down"))
        .when(outbox)
        .emitStrict(eq("report"), eq("e1"), eq("REPORT_RELEASED"), any(), any());

    // Outbox is same-transaction (strict): a failure aborts the whole release (no silent partial).
    assertThrows(
        RuntimeException.class, () -> svc.release("staff-sub", "sess-1", "K-outbox", "req-1", false));
  }

  // ------------------------------------------------------------------
  // 5. Absent excluded with reason (never released as zero, never blocks)
  // ------------------------------------------------------------------

  @Test
  void absentExcludedWithReason_neverReleasedAsZero() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(4);
    when(repo.countExpected("sess-1")).thenReturn(4);
    when(repo.countReleased("sess-1")).thenReturn(0).thenReturn(3);
    when(repo.findExcludedWithReason("sess-1"))
        .thenReturn(List.of(Map.of("studentId", "s-1", "status", "ABSENT", "reason", "sick")));
    when(repo.findOutstandingWithReason("sess-1")).thenReturn(List.of());
    // Eligible already excludes absent (repo SQL filters attendance); only 3 flip.
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2"), eval("e3")));
    doNothing().when(repo).lockSessionRoster("sess-1");
    when(repo.insertRelease(any(), any(), any(), any(), any())).thenReturn("rel-2");
    when(repo.releaseEvaluationsByIds(any())).thenReturn(3);

    Map<String, Object> out = svc.release("staff-sub", "sess-1", "K-absent", "req-1", false);
    assertEquals(3, out.get("released"));
    assertEquals(1, out.get("excluded"));
    assertEquals(0, out.get("outstandingCount"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> reasons = (List<Map<String, Object>>) out.get("excludedReasons");
    assertEquals("sick", reasons.get(0).get("reason"));
    // Absence never becomes a zero score: release path never touches evaluation_scores
    // (only state flips + outbox; scores are written solely by the evaluation submit path).
  }
}
