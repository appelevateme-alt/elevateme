package com.elevateme.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AccountPendingException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.notifications.NotificationsService;
import com.elevateme.opportunities.DevelopmentDtos;
import com.elevateme.opportunities.DevelopmentRepository;
import com.elevateme.opportunities.DevelopmentService;
import com.elevateme.participation.GuestRepository;
import com.elevateme.participation.GuestService;
import com.elevateme.performance.CriterionAlertService;
import com.elevateme.performance.ReleaseRepository;
import com.elevateme.performance.ReleaseService;
import com.elevateme.programs.ProgramRepository;
import com.elevateme.programs.ProgramsService;
import com.elevateme.recommendations.RecommendationDtos;
import com.elevateme.recommendations.RecommendationsRepository;
import com.elevateme.recommendations.RecommendationsService;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 6 permission regression — 18 acceptance essentials (no DB).
 *
 * <ol>
 *   <li>A reads own (allowed).
 *   <li>B reads A's report → 404 (no enumeration).
 *   <li>Teacher (non-admin) cannot publish program → 403.
 *   <li>Teacher cannot preview/publish recommendation → 403.
 *   <li>Guest cannot release reports → 403 (no writes).
 *   <li>Guest scoped read: unrelated session → 404.
 *   <li>Guest revoked/unknown replay → 401 (immediate, no grace).
 *   <li>Admin-only audience preview: non-admin → 403.
 *   <li>Admin-only development assign: non-admin → 403.
 *   <li>Paid claim ("I have paid") does NOT confirm — stays PENDING.
 *   <li>Paid VERIFIED confirms (+ admin + time).
 *   <li>Paid REJECTED needs reason (422); double-verify → 409.
 *   <li>Release repeat-safe: same Idempotency-Key → same response, no dup rows.
 *   <li>Release atomic: mid-transaction fault → zero partial (no outbox/audit).
 *   <li>Alert: 29 creates, 30 does NOT (strict &lt;30).
 *   <li>Alert: later 30+ resolves active; 29 stays active.
 *   <li>Pending staff roster → 403 ACCOUNT_PENDING (no data).
 *   <li>Targeting invisibility: non-assignee development 404 + cross-student
 *       recommendation patch 404.
 * </ol>
 *
 * <p>Denials emit audit (actor, action, entity, requestId) with no PII message text.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PermissionRegressionTest {

  @Mock JdbcTemplate jdbc;
  @Mock AuditService audit;
  @Mock AuthContext auth;
  @Mock OutboxService outbox;
  @Mock NotificationsService notifications;

  private ScopeGuard realGuard() {
    return new ScopeGuard(jdbc, audit);
  }

  private void stubCaller(String subject, String profileId, String role, String status) {
    when(jdbc.queryForList(anyString(), eq(subject), eq(subject)))
        .thenReturn(List.of(Map.of("id", profileId, "role", role, "status", status)));
  }

  // 1. A reads own — allowed.
  @Test
  void acceptance01_studentAReadsOwn_allowed() {
    var self = new ScopeGuard.CallerProfile("profile-A", "student", "Approved");
    assertTrue(ScopeGuard.canReadStudent(self, "profile-A", false));
  }

  // 2. B reads A's report → 404 (same shape as unknown id).
  @Test
  void acceptance02_studentBCannotReadA_404() {
    stubCaller("subject-B", "profile-B", "student", "Approved");
    when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any()))
        .thenThrow(new EmptyResultDataAccessException(1));

    ResourceNotFoundException notFound = assertThrows(ResourceNotFoundException.class,
        () -> realGuard().checkStudentRead("subject-B", "profile-A", "req-B-A"));
    assertNotNull(notFound);
    var res = new GlobalExceptionHandler().handleNotFound(notFound, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
    assertEquals("NOT_FOUND", res.getBody().code());
    verify(audit).record(eq("profile-B"), eq("ACCESS_DENIED"), eq("student_read"), eq("profile-A"), eq("req-B-A"));
  }

  // 3. Teacher cannot publish → 403, no write.
  @Test
  void acceptance03_teacherCannotPublish_403() {
    stubCaller("teacher-sub", "teacher-1", "coordinator", "Approved");
    ProgramRepository repo = mock(ProgramRepository.class);
    ProgramsService svc = new ProgramsService(auth, repo, realGuard(), audit);

    AccessDeniedException denied = assertThrows(AccessDeniedException.class,
        () -> svc.publish("teacher-sub", "prog-1", "req-1"));
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("FORBIDDEN", res.getBody().code());
    verify(repo, never()).setLifecycle(any(), any(), any(), any(), any(), any());
  }

  // 4. Teacher cannot preview/publish recommendation → 403.
  @Test
  void acceptance04_teacherCannotRecommend_403() {
    ScopeGuard guard = mock(ScopeGuard.class);
    RecommendationsRepository repo = mock(RecommendationsRepository.class);
    RecommendationsService svc =
        new RecommendationsService(auth, repo, guard, audit, outbox, notifications);
    doThrow(new AccessDeniedException("Admin only")).when(guard).requireAdmin(eq("teacher-sub"), any());

    var previewReq = new RecommendationDtos.AudiencePreviewRequest(List.of("stu-1"), null, null, null);
    AccessDeniedException deniedPreview = assertThrows(AccessDeniedException.class,
        () -> svc.previewAudience("teacher-sub", previewReq, "req-1"));
    assertEquals(403,
        new GlobalExceptionHandler().handleDenied(deniedPreview, new MockHttpServletRequest()).getStatusCode().value());

    var createReq = new RecommendationDtos.CreateRecommendationsRequest(
        "T", "Do X", "Because Y", null, "MED", null, List.of("stu-1"), null, null, null, null, false);
    assertThrows(AccessDeniedException.class, () -> svc.create("teacher-sub", createReq, "req-2"));
    verify(repo, never()).insertRecommendation(any(), any(), any(), any(), any(), any(), any(), any(), any());
  }

  // 5. Guest can NEVER release → 403, no writes.
  @Test
  void acceptance05_guestCannotRelease_403() {
    ReleaseRepository releaseRepo = mock(ReleaseRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    ReleaseService releases =
        new ReleaseService(releaseRepo, guard, audit, outbox, new IdempotencyService(), auth);

    AccessDeniedException denied = assertThrows(AccessDeniedException.class,
        () -> releases.release("guest:inv-1", "sess-1", "k-1", "req-1", true));
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    verify(releaseRepo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(releaseRepo, never()).releaseEvaluations(any());
  }

  // 6. Guest scoped: unrelated session → 404.
  @Test
  void acceptance06_guestScopedUnrelated_404() {
    GuestRepository guestRepo = mock(GuestRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    GuestService guests = new GuestService(guestRepo, guard, audit, outbox);
    Map<String, Object> scope = new HashMap<>();
    scope.put("invitationId", "inv-1");
    scope.put("scope", "SESSION");
    scope.put("sessionId", "sess-S");
    scope.put("programId", "prog-1");

    guests.checkGuestScope(scope, "sess-S");
    ResourceNotFoundException notFound = assertThrows(ResourceNotFoundException.class,
        () -> guests.checkGuestScope(scope, "sess-OTHER"));
    assertEquals(404,
        new GlobalExceptionHandler().handleNotFound(notFound, new MockHttpServletRequest()).getStatusCode().value());
  }

  // 7. Guest revoked/unknown replay → 401 (immediate, no grace window).
  @Test
  void acceptance07_guestRevokedReplay_401() {
    GuestRepository guestRepo = mock(GuestRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    GuestService guests = new GuestService(guestRepo, guard, audit, outbox);

    when(guestRepo.findInvitationByHash(any())).thenReturn(null);
    assertThrows(IllegalStateException.class, () -> guests.exchange("bogus-fragment", "req-1"));

    Map<String, Object> revoked = new HashMap<>();
    revoked.put("invitationId", "inv-1");
    revoked.put("scope", "SESSION");
    revoked.put("sessionId", "sess-S");
    revoked.put("programId", "prog-1");
    revoked.put("sessionExpiresAt", Instant.now().plusSeconds(3600).toString());
    revoked.put("inviteExpiresAt", Instant.now().plusSeconds(3600).toString());
    revoked.put("revokedAt", Instant.now().toString());
    when(guestRepo.findLiveGuestSession(any())).thenReturn(revoked);
    IllegalStateException unauth =
        assertThrows(IllegalStateException.class, () -> guests.validateGuestSession("old-cookie"));
    assertEquals(401, new GlobalExceptionHandler()
        .handleUnauthenticated(unauth, new MockHttpServletRequest()).getStatusCode().value());

    // Unauthenticated (no subject) maps to 401 as well.
    var unauth2 = new GlobalExceptionHandler().handleUnauthenticated(
        new IllegalStateException("Unauthenticated"), new MockHttpServletRequest());
    assertEquals(401, unauth2.getStatusCode().value());
  }

  // 8. Admin-only audience preview: non-admin → 403.
  @Test
  void acceptance08_adminOnlyPreview_403() {
    ScopeGuard guard = mock(ScopeGuard.class);
    RecommendationsRepository repo = mock(RecommendationsRepository.class);
    RecommendationsService svc =
        new RecommendationsService(auth, repo, guard, audit, outbox, notifications);
    doThrow(new AccessDeniedException("Admin only")).when(guard).requireAdmin(eq("staff-sub"), any());

    var req = new RecommendationDtos.AudiencePreviewRequest(List.of("stu-1"), null, null, null);
    assertThrows(AccessDeniedException.class, () -> svc.previewAudience("staff-sub", req, "req-1"));
  }

  // 9. Admin-only development assign: non-admin → 403.
  @Test
  void acceptance09_adminOnlyAssign_403() {
    ScopeGuard guard = mock(ScopeGuard.class);
    DevelopmentRepository repo = mock(DevelopmentRepository.class);
    DevelopmentService svc =
        new DevelopmentService(auth, repo, guard, audit, outbox, new IdempotencyService(), notifications);
    doThrow(new AccessDeniedException("Admin only")).when(guard).requireAdmin(eq("teacher-sub"), any());

    var req = new DevelopmentDtos.AssignRequest(List.of("stu-1"), null, "reason");
    assertThrows(AccessDeniedException.class, () -> svc.assign("teacher-sub", "ev-1", req, "req-1"));
    verify(repo, never()).insertAssignmentDeduped(any(), any(), any(), any());
  }

  // 10. Paid claim does NOT confirm — stays PENDING.
  @Test
  void acceptance10_paidClaimDoesNotConfirm_pending() {
    DevelopmentRepository repo = mock(DevelopmentRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    DevelopmentService svc =
        new DevelopmentService(auth, repo, guard, audit, outbox, new IdempotencyService(), notifications);

    Map<String, Object> reg = new HashMap<>();
    reg.put("id", "reg-1");
    reg.put("studentId", "stu-1");
    reg.put("programId", "prog-1");
    when(repo.findRegistrationById("reg-1")).thenReturn(reg);
    Map<String, Object> caller = new HashMap<>();
    caller.put("id", "stu-1");
    caller.put("role", "student");
    caller.put("status", "Approved");
    when(repo.findCallerProfile("stu-sub")).thenReturn(caller);
    Map<String, Object> pending = new HashMap<>();
    pending.put("id", "pay-1");
    pending.put("registrationId", "reg-1");
    pending.put("studentId", "stu-1");
    pending.put("programId", "prog-1");
    pending.put("state", "PENDING");
    when(repo.findVerificationByRegistration("reg-1")).thenReturn(pending);
    when(repo.claimVerification("pay-1", "REF-1")).thenReturn(1);
    when(repo.findVerificationById("pay-1")).thenReturn(pending);
    when(repo.findAdminIds()).thenReturn(List.of("admin-1"));

    Map<String, Object> out = svc.submitPaymentReference("stu-sub", "reg-1", "REF-1", "req-1");
    assertEquals(false, out.get("confirmed"));
    assertEquals("PENDING", out.get("state"));
    verify(repo, never()).markRegistrationConfirmed(any());
    verify(repo, never()).verifyVerification(any(), any(), any(), any());
  }

  // 11. Paid VERIFIED confirms (+ admin + time).
  @Test
  void acceptance11_paidVerifiedConfirms_recordsAdmin() {
    DevelopmentRepository repo = mock(DevelopmentRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    DevelopmentService svc =
        new DevelopmentService(auth, repo, guard, audit, outbox, new IdempotencyService(), notifications);

    Map<String, Object> pending = verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING");
    Map<String, Object> decided = verification("pay-1", "reg-1", "stu-1", "prog-1", "VERIFIED");
    decided.put("verifiedBy", "admin-1");
    decided.put("verifiedAt", Instant.now().toString());
    when(repo.findVerificationById("pay-1")).thenReturn(pending, decided);
    when(repo.lockProgramRow("prog-1")).thenReturn(Map.of("id", "prog-1", "capacity", 10));
    when(repo.findEventByProgramId("prog-1")).thenReturn(Map.of("id", "ev-1", "capacity", 10));
    when(repo.countConfirmed("prog-1")).thenReturn(1);
    when(repo.countActiveHolds("prog-1")).thenReturn(1);
    when(repo.verifyVerification("pay-1", "VERIFIED", "admin-1", null)).thenReturn(1);
    when(repo.markRegistrationConfirmed("reg-1")).thenReturn(1);

    Map<String, Object> out = svc.verifyPayment("admin-sub", "pay-1",
        new DevelopmentDtos.VerifyPaymentRequest("VERIFIED", null), "req-1");
    assertEquals("VERIFIED", out.get("state"));
    assertEquals("admin-1", out.get("verifiedBy"));
    assertNotNull(out.get("verifiedAt"));
    verify(repo).markRegistrationConfirmed("reg-1");
  }

  // 12. Paid REJECTED needs reason (422); double-verify → 409.
  @Test
  void acceptance12_paidRejectedNeedsReason_doubleVerify409() {
    DevelopmentRepository repo = mock(DevelopmentRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    DevelopmentService svc =
        new DevelopmentService(auth, repo, guard, audit, outbox, new IdempotencyService(), notifications);

    when(repo.findVerificationById("pay-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING"));
    IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
        () -> svc.verifyPayment("admin-sub", "pay-1",
            new DevelopmentDtos.VerifyPaymentRequest("REJECTED", "  "), "req-1"));
    assertEquals(422, new GlobalExceptionHandler()
        .handleIllegalArg(ex, new MockHttpServletRequest()).getStatusCode().value());
    verify(repo, never()).verifyVerification(any(), any(), any(), any());

    when(repo.findVerificationById("pay-9"))
        .thenReturn(verification("pay-9", "reg-9", "stu-9", "prog-1", "VERIFIED"));
    ConflictException conflict = assertThrows(ConflictException.class,
        () -> svc.verifyPayment("admin-sub", "pay-9",
            new DevelopmentDtos.VerifyPaymentRequest("VERIFIED", null), "req-2"));
    assertEquals(409, new GlobalExceptionHandler()
        .handleConflict(conflict, new MockHttpServletRequest()).getStatusCode().value());
  }

  // 13. Release repeat-safe: same key → same response, no duplicate rows.
  @Test
  void acceptance13_releaseRepeatSafe_sameKey() {
    ReleaseRepository repo = mock(ReleaseRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    doNothing().when(guard).requireStaffActive(eq("staff-sub"), any());
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
    ReleaseService svc =
        new ReleaseService(repo, guard, audit, outbox, new IdempotencyService(), auth);

    when(repo.countSubmitted("sess-1")).thenReturn(5);
    when(repo.countExpected("sess-1")).thenReturn(6);
    when(repo.countReleased("sess-1")).thenReturn(0).thenReturn(3);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    Map<String, Object> e1 = new HashMap<>();
    e1.put("id", "e1");
    e1.put("studentId", "stu-e1");
    when(repo.lockEligibleEvaluations("sess-1")).thenReturn(List.of(e1));
    when(repo.insertRelease(eq("SESSION"), isNull(), eq("sess-1"), eq("staff-1"), eq("K-13")))
        .thenReturn("rel-13");
    when(repo.releaseEvaluations("sess-1")).thenReturn(1);

    Map<String, Object> first = svc.release("staff-sub", "sess-1", "K-13", "req-1", false);
    Map<String, Object> replay = svc.release("staff-sub", "sess-1", "K-13", "req-2", false);
    assertEquals(first, replay);
    verify(repo, times(1)).insertRelease(any(), any(), any(), any(), any());
    verify(repo, times(1)).releaseEvaluations(any());
  }

  // 14. Release atomic: fault mid-transaction → zero partial.
  @Test
  void acceptance14_releaseAtomic_noPartialOnFault() {
    ReleaseRepository repo = mock(ReleaseRepository.class);
    ScopeGuard guard = mock(ScopeGuard.class);
    doNothing().when(guard).requireStaffActive(eq("staff-sub"), any());
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
    ReleaseService svc =
        new ReleaseService(repo, guard, audit, outbox, new IdempotencyService(), auth);

    when(repo.countSubmitted("sess-1")).thenReturn(4);
    when(repo.countExpected("sess-1")).thenReturn(4);
    when(repo.findExcludedWithReason("sess-1")).thenReturn(List.of());
    when(repo.lockEligibleEvaluations("sess-1")).thenThrow(new RuntimeException("lock timeout"));

    assertThrows(RuntimeException.class,
        () -> svc.release("staff-sub", "sess-1", "K-fault", "req-1", false));
    verify(repo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(repo, never()).releaseEvaluations(any());
    verify(outbox, never()).emit(any(), any(), any(), any(), any());
  }

  // 15. Alert: 29 creates, 30 does NOT (strict <30).
  @Test
  void acceptance15_alertBelow30Creates_30DoesNot() {
    var low29 = List.of(
        new CriterionAlertService.ScorePoint("e1", "rev1", "s1", Instant.parse("2026-01-01T00:00:00Z"), 29));
    var at30 = List.of(
        new CriterionAlertService.ScorePoint("e1", "rev1", "s1", Instant.parse("2026-01-01T00:00:00Z"), 30));

    assertEquals(CriterionAlertService.Action.CREATE,
        CriterionAlertService.reconcile(low29, null).action());
    assertEquals(CriterionAlertService.Action.NOOP,
        CriterionAlertService.reconcile(at30, null).action());
    assertTrue(CriterionAlertService.isLow(29));
    assertFalse(CriterionAlertService.isLow(30));
  }

  // 16. Alert: later 30+ resolves active; 29 stays active.
  @Test
  void acceptance16_alertResolve30_resolves_29Stays() {
    var active = new CriterionAlertService.AlertState("stu-1", "clarity", 25, "rev1", "e1",
        Instant.parse("2026-01-01T00:00:00Z"), null, null);
    var later30 = List.of(
        new CriterionAlertService.ScorePoint("e2", "rev2", "s2", Instant.parse("2026-02-01T00:00:00Z"), 30));
    var later29 = List.of(
        new CriterionAlertService.ScorePoint("e2", "rev2", "s2", Instant.parse("2026-02-01T00:00:00Z"), 29));

    assertEquals(CriterionAlertService.Action.RESOLVE,
        CriterionAlertService.reconcile(later30, active).action());
    assertTrue(CriterionAlertService.isResolveScore(30));
    // 29 stays active (evidence update, never resolve).
    assertNotEquals(CriterionAlertService.Action.RESOLVE,
        CriterionAlertService.reconcile(later29, active).action());
    assertFalse(CriterionAlertService.isResolveScore(29));
  }

  // 17. Pending staff roster → 403 ACCOUNT_PENDING (no data leaked).
  @Test
  void acceptance17_pendingStaffRoster_accountPending() {
    stubCaller("pending-sub", "pending-1", "coordinator", "PendingReview");
    AccountPendingException pending = assertThrows(AccountPendingException.class,
        () -> realGuard().checkRosterAccess("pending-sub", "sess-1", "req-pending"));
    assertNotNull(pending);
    var res = new GlobalExceptionHandler().handlePending(pending, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("ACCOUNT_PENDING", res.getBody().code());
  }

  // 18. Targeting invisibility: non-assignee 404 + cross-student rec patch 404.
  @Test
  void acceptance18_targetingInvisible_404() {
    // Non-assignee direct development fetch → 404.
    DevelopmentRepository devRepo = mock(DevelopmentRepository.class);
    ScopeGuard devGuard = mock(ScopeGuard.class);
    DevelopmentService dev =
        new DevelopmentService(auth, devRepo, devGuard, audit, outbox, new IdempotencyService(), notifications);
    Map<String, Object> event = new HashMap<>();
    event.put("id", "ev-1");
    event.put("programId", "prog-1");
    when(devRepo.findEventById("ev-1")).thenReturn(event);
    Map<String, Object> outsider = new HashMap<>();
    outsider.put("id", "stu-X");
    outsider.put("role", "student");
    outsider.put("status", "Approved");
    when(devRepo.findCallerProfile("outsider-sub")).thenReturn(outsider);
    when(devRepo.findActiveAssignment("stu-X", "prog-1")).thenReturn(null);
    ResourceNotFoundException dev404 = assertThrows(ResourceNotFoundException.class,
        () -> dev.getMine("outsider-sub", "ev-1", "req-1"));
    assertEquals(404, new GlobalExceptionHandler()
        .handleNotFound(dev404, new MockHttpServletRequest()).getStatusCode().value());

    // Cross-student recommendation patch → 404 (no enumeration).
    RecommendationsRepository recRepo = mock(RecommendationsRepository.class);
    ScopeGuard recGuard = mock(ScopeGuard.class);
    RecommendationsService rec =
        new RecommendationsService(auth, recRepo, recGuard, audit, outbox, notifications);
    Map<String, Object> recipient = new HashMap<>();
    recipient.put("id", "rr-9");
    recipient.put("studentId", "stu-A");
    recipient.put("pinnedOrder", null);
    when(recRepo.findRecipientById("rr-9")).thenReturn(recipient);
    Map<String, Object> other = new HashMap<>();
    other.put("id", "stu-B");
    other.put("role", "student");
    other.put("status", "Approved");
    when(recRepo.findCallerProfile("other-sub")).thenReturn(other);
    ResourceNotFoundException rec404 = assertThrows(ResourceNotFoundException.class,
        () -> rec.patchMine("other-sub", "rr-9",
            new RecommendationDtos.PatchRecommendationRequest(true, null, null), "req-2"));
    assertEquals(404, new GlobalExceptionHandler()
        .handleNotFound(rec404, new MockHttpServletRequest()).getStatusCode().value());

    // Outbox backoff bounds (30s base, 1h cap) — release-quality invariant.
    assertEquals(30, com.elevateme.common.outbox.OutboxWorker.backoffSeconds(0));
    assertEquals(60, com.elevateme.common.outbox.OutboxWorker.backoffSeconds(1));
    assertEquals(3600, com.elevateme.common.outbox.OutboxWorker.backoffSeconds(20));
  }

  private static Map<String, Object> verification(
      String id, String registrationId, String studentId, String programId, String state) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("registrationId", registrationId);
    m.put("studentId", studentId);
    m.put("programId", programId);
    m.put("state", state);
    m.put("reference", "REF-1");
    return m;
  }
}
