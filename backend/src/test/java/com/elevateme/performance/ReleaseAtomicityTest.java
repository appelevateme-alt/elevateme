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
 * Release atomicity + repeat-safety (JUnit5 + Mockito, no DB).
 *
 * <ol>
 *   <li>Preview exposes submitted/expected/excluded (absent excluded with reason).
 *   <li>POST with Idempotency-Key K -&gt; 200 + counts; repeat same POST with Key K -&gt; SAME
 *       response, no duplicate release rows.
 *   <li>Mid-transaction fault -&gt; zero partial releases (atomic rollback: no outbox/audit).
 *   <li>Outbox rows are written in the same transaction as releases (per recipient).
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

  // ------------------------------------------------------------------
  // 1. Preview counts
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

    Map<String, Object> preview = svc.preview("staff-sub", "sess-1", "req-preview");

    assertEquals(8, preview.get("submitted"));
    assertEquals(10, preview.get("expected"));
    assertEquals(2, preview.get("excluded"));
    assertEquals(2, preview.get("alreadyReleased"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> reasons =
        (List<Map<String, Object>>) preview.get("excludedReasons");
    assertEquals(2, reasons.size());
  }

  // ------------------------------------------------------------------
  // 2. Repeat-safe: same key -> SAME response, no duplicate rows
  // ------------------------------------------------------------------

  @Test
  void releaseIsAtomicAndRepeatSafe() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(5);
    when(repo.countExpected("sess-1")).thenReturn(6);
    when(repo.countReleased("sess-1")).thenReturn(0).thenReturn(3);
    when(repo.findExcludedWithReason("sess-1"))
        .thenReturn(List.of(Map.of("studentId", "s-absent", "status", "ABSENT", "reason", "sick")));
    List<Map<String, Object>> eligible = List.of(eval("e1"), eval("e2"), eval("e3"));
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(eligible);
    when(repo.insertRelease(eq("SESSION"), isNull(), eq("sess-1"), eq("staff-1"), eq("K")))
        .thenReturn("rel-1");
    when(repo.releaseEvaluations("sess-1")).thenReturn(3);

    Map<String, Object> first = svc.release("staff-sub", "sess-1", "K", "req-1", false);
    assertEquals("rel-1", first.get("releaseId"));
    assertEquals(3, first.get("released"));
    assertEquals(5, first.get("submitted"));
    // Outbox per recipient, same transaction as the release rows.
    verify(outbox, times(3)).emit(eq("report"), any(), eq("REPORT_RELEASED"), any(), any());
    verify(audit)
        .record(eq("staff-1"), eq("REPORTS_RELEASED"), eq("session"), eq("sess-1"), eq("req-1"));

    // Repeat same POST with Key K -> SAME response, no duplicate release rows.
    Map<String, Object> replay = svc.release("staff-sub", "sess-1", "K", "req-2", false);
    assertEquals(first, replay, "idempotent replay must return the stored response");
    verify(repo, times(1)).insertRelease(any(), any(), any(), any(), any());
    verify(repo, times(1)).releaseEvaluations(any());
    verify(outbox, times(3)).emit(eq("report"), any(), eq("REPORT_RELEASED"), any(), any());
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
  // 3. Atomic rollback: fault mid-transaction -> zero partial releases
  // ------------------------------------------------------------------

  @Test
  void faultMidTransaction_noPartialReleases() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(4);
    when(repo.countExpected("sess-1")).thenReturn(4);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.lockEligibleEvaluations("sess-1")).thenThrow(new RuntimeException("lock timeout"));

    assertThrows(
        RuntimeException.class, () -> svc.release("staff-sub", "sess-1", "K-fault", "req-1", false));

    // Atomic: no release row, no evaluation flips, no outbox, no audit on failure.
    verify(repo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(repo, never()).releaseEvaluations(any());
    verify(outbox, never()).emit(any(), any(), any(), any(), any());
    verify(audit, never()).record(eq("staff-1"), eq("REPORTS_RELEASED"), eq("session"), eq("sess-1"), any());
  }

  @Test
  void outboxFailure_abortsRelease_noSilentPartial() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(2);
    when(repo.countExpected("sess-1")).thenReturn(2);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2")));
    when(repo.insertRelease(any(), any(), any(), any(), any())).thenReturn("rel-9");
    when(repo.releaseEvaluations("sess-1")).thenReturn(2);
    doThrow(new RuntimeException("outbox down"))
        .when(outbox)
        .emit(eq("report"), eq("e1"), eq("REPORT_RELEASED"), any(), any());

    // Outbox is same-transaction: a failure aborts the whole release (no silent partial).
    assertThrows(
        RuntimeException.class, () -> svc.release("staff-sub", "sess-1", "K-outbox", "req-1", false));
  }

  // ------------------------------------------------------------------
  // 4. Absent excluded with reason (never released as zero)
  // ------------------------------------------------------------------

  @Test
  void absentExcludedWithReason_neverReleasedAsZero() {
    stubStaffOk();
    when(repo.countSubmitted("sess-1")).thenReturn(4);
    when(repo.countExpected("sess-1")).thenReturn(5);
    when(repo.countReleased("sess-1")).thenReturn(2);
    when(repo.findExcludedWithReason("sess-1"))
        .thenReturn(List.of(Map.of("studentId", "s-1", "status", "ABSENT", "reason", "sick")));
    // Eligible already excludes absent (repo SQL filters attendance); only 3 flip.
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(eval("e1"), eval("e2"), eval("e3")));
    when(repo.insertRelease(any(), any(), any(), any(), any())).thenReturn("rel-2");
    when(repo.releaseEvaluations("sess-1")).thenReturn(3);

    Map<String, Object> out = svc.release("staff-sub", "sess-1", "K-absent", "req-1", false);
    assertEquals(3, out.get("released"));
    assertEquals(1, out.get("excluded"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> reasons = (List<Map<String, Object>>) out.get("excludedReasons");
    assertEquals("sick", reasons.get(0).get("reason"));
    // Absence never becomes a zero score: release path never touches evaluation_scores
    // (only state flips + outbox; scores are written solely by the evaluation submit path).
  }
}
