package com.elevateme.opportunities;

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
import com.elevateme.notifications.NotificationsService;
import java.time.Duration;
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
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 5 development + payments (JUnit5 + Mockito, no DB).
 *
 * <p>Covers: targeted assign dedupes overlapping batches (non-assignees get 404
 * on reads via the service guard), payment-reference does NOT confirm,
 * admin verify VERIFIED confirms (+ admin + time) vs REJECTED (+ reason),
 * 48h hold with deadline cap, expiry frees the hold.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PaymentFlowTest {

  @Mock DevelopmentRepository repo;
  @Mock ScopeGuard guard;
  @Mock AuthContext auth;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock IdempotencyService idempotency;
  @Mock NotificationsService notifications;

  private DevelopmentService svc() {
    return new DevelopmentService(auth, repo, guard, audit, outbox, idempotency, notifications);
  }

  private static Map<String, Object> studentCaller(String id) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("role", "student");
    m.put("status", "Approved");
    return m;
  }

  private static Map<String, Object> registration(String id, String studentId, String programId) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("studentId", studentId);
    m.put("programId", programId);
    m.put("status", "Pending");
    return m;
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

  // ------------------------------------------------------------------
  // Pure rules: billing/decision/URL/hold/dedupe
  // ------------------------------------------------------------------

  @Test
  void holdExpiry_is48hOrDeadlineWhicheverFirst() {
    assertEquals(Duration.ofHours(48), DevelopmentService.HOLD);
    Instant now = Instant.parse("2026-03-01T10:00:00Z");
    assertEquals(now.plus(Duration.ofHours(48)), DevelopmentService.computeHoldExpiry(now, null));
    assertEquals(
        Instant.parse("2026-03-02T10:00:00Z"),
        DevelopmentService.computeHoldExpiry(now, Instant.parse("2026-03-02T10:00:00Z")));
    // Far deadline keeps the 48h default (displayed upfront on paid responses).
    assertEquals(
        now.plus(Duration.ofHours(48)),
        DevelopmentService.computeHoldExpiry(now, now.plus(Duration.ofHours(72))));
  }

  @Test
  void paidRequiresHttpsPaymentUrl_cardDataNeverAccepted() {
    DevelopmentService.requireHttpsUrl("https://pay.example.com/checkout");
    assertThrows(IllegalArgumentException.class, () -> DevelopmentService.requireHttpsUrl("http://pay.example.com"));
    assertThrows(IllegalArgumentException.class, () -> DevelopmentService.requireHttpsUrl(null));
    assertEquals("PAID", DevelopmentService.normalizeBilling("paid"));
    assertEquals("FREE", DevelopmentService.normalizeBilling(null));
    assertEquals("VERIFIED", DevelopmentService.normalizeDecision("verified"));
    assertThrows(IllegalArgumentException.class, () -> DevelopmentService.normalizeDecision("maybe"));
  }

  @Test
  void dedupeIds_preservesOrder() {
    java.util.List<String> withBlanks =
        new java.util.ArrayList<>(java.util.Arrays.asList("s1", "s2", "s1", " ", null));
    assertEquals(List.of("s1", "s2"), DevelopmentService.dedupeIds(withBlanks));
  }

  // ------------------------------------------------------------------
  // Targeted assign: dedupe overlapping batches
  // ------------------------------------------------------------------

  @Test
  void assignDedupesOverlappingBatches() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(repo.findProgramIdForEvent("ev-1")).thenReturn("prog-1");
    // Explicit IDs + institution rule overlap on stu-1: union dedupes to 2 targets.
    when(repo.findApprovedStudentsByIds(anyList())).thenReturn(List.of("stu-1"));
    when(repo.findApprovedStudentsByInstitution("inst-1")).thenReturn(List.of("stu-1", "stu-2"));
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    when(repo.insertAssignmentDeduped(eq("stu-1"), eq("prog-1"), any(), eq("admin-1"))).thenReturn(0);
    when(repo.insertAssignmentDeduped(eq("stu-2"), eq("prog-1"), any(), eq("admin-1"))).thenReturn(1);

    var req =
        new DevelopmentDtos.AssignRequest(
            List.of("stu-1"), new DevelopmentDtos.AudienceRule("inst-1", null, null, null), "reason");
    Map<String, Object> out = svc().assign("admin-sub", "ev-1", req, "req-1");

    assertEquals(1, out.get("assigned"));
    assertEquals(1, out.get("skippedDuplicates"));
    verify(repo, times(1)).insertAssignmentDeduped(eq("stu-1"), eq("prog-1"), any(), any());
    verify(repo, times(1)).insertAssignmentDeduped(eq("stu-2"), eq("prog-1"), any(), any());
  }

  @Test
  void nonAssigneeDirectFetch_is404() {
    Map<String, Object> event = new HashMap<>();
    event.put("id", "ev-1");
    event.put("programId", "prog-1");
    when(repo.findEventById("ev-1")).thenReturn(event);
    when(repo.findCallerProfile("outsider-sub")).thenReturn(studentCaller("stu-X"));
    when(repo.findActiveAssignment("stu-X", "prog-1")).thenReturn(null);

    var ex =
        assertThrows(
            com.elevateme.common.security.ResourceNotFoundException.class,
            () -> svc().getMine("outsider-sub", "ev-1", "req-1"));
    var res = new GlobalExceptionHandler().handleNotFound(ex, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // Payment-reference does NOT confirm
  // ------------------------------------------------------------------

  @Test
  void paymentReference_doesNotConfirm_staysPending() {
    when(repo.findRegistrationById("reg-1")).thenReturn(registration("reg-1", "stu-1", "prog-1"));
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));
    when(repo.findVerificationByRegistration("reg-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING"));
    when(repo.claimVerification("pay-1", "REF-123")).thenReturn(1);
    when(repo.findVerificationById("pay-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING"));
    when(repo.findAdminIds()).thenReturn(List.of("admin-1"));

    Map<String, Object> out = svc().submitPaymentReference("stu-sub", "reg-1", "REF-123", "req-1");

    assertEquals(false, out.get("confirmed"));
    assertEquals("PENDING", out.get("state"));
    // Claim never confirms: no registration confirm, no verify decision.
    verify(repo, never()).markRegistrationConfirmed(any());
    verify(repo, never()).verifyVerification(any(), any(), any(), any());
    verify(repo).claimVerification("pay-1", "REF-123");
  }

  // ------------------------------------------------------------------
  // Verify: VERIFIED confirms (+admin+time) vs REJECTED (+reason)
  // ------------------------------------------------------------------

  @Test
  void verifyVerified_confirmsRegistration_recordsAdminAndTime() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    Map<String, Object> pending = verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING");
    // Post-decision read carries verifier + time columns.
    Map<String, Object> decided = verification("pay-1", "reg-1", "stu-1", "prog-1", "VERIFIED");
    decided.put("verifiedBy", "admin-1");
    decided.put("verifiedAt", Instant.now().toString());
    // First read (decision) sees PENDING; post-decision read sees VERIFIED.
    when(repo.findVerificationById("pay-1")).thenReturn(pending, decided);
    when(repo.lockProgramRow("prog-1")).thenReturn(Map.of("id", "prog-1", "capacity", 10));
    when(repo.findEventByProgramId("prog-1")).thenReturn(Map.of("id", "ev-1", "capacity", 10));
    when(repo.countConfirmed("prog-1")).thenReturn(1);
    when(repo.countActiveHolds("prog-1")).thenReturn(1);
    when(repo.verifyVerification("pay-1", "VERIFIED", "admin-1", null)).thenReturn(1);
    when(repo.markRegistrationConfirmed("reg-1")).thenReturn(1);

    Map<String, Object> out =
        svc().verifyPayment("admin-sub", "pay-1", new DevelopmentDtos.VerifyPaymentRequest("VERIFIED", null), "req-1");

    assertEquals("VERIFIED", out.get("state"));
    assertEquals("admin-1", out.get("verifiedBy"));
    assertNotNull(out.get("verifiedAt"));
    verify(repo).markRegistrationConfirmed("reg-1");
    verify(audit).record(eq("admin-1"), eq("PAYMENT_VERIFIED"), eq("payment_verification"), eq("pay-1"), eq("req-1"));
  }

  @Test
  void verifyRejected_needsReason_doesNotConfirm() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    when(repo.findVerificationById("pay-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING"));

    // Missing reason -> 422, no decision written.
    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                svc().verifyPayment(
                    "admin-sub", "pay-1", new DevelopmentDtos.VerifyPaymentRequest("REJECTED", "  "), "req-1"));
    var res = new GlobalExceptionHandler().handleIllegalArg(ex, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());
    verify(repo, never()).verifyVerification(any(), any(), any(), any());

    // With reason: REJECTED, registration untouched.
    when(repo.verifyVerification("pay-1", "REJECTED", "admin-1", "unreadable")).thenReturn(1);
    Map<String, Object> rejected = verification("pay-1", "reg-1", "stu-1", "prog-1", "REJECTED");
    // Decision read sees PENDING; post-decision read sees REJECTED.
    when(repo.findVerificationById("pay-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "PENDING"), rejected);
    Map<String, Object> out =
        svc().verifyPayment(
            "admin-sub", "pay-1", new DevelopmentDtos.VerifyPaymentRequest("REJECTED", "unreadable"), "req-2");
    assertEquals("REJECTED", out.get("state"));
    verify(repo, never()).markRegistrationConfirmed(any());
  }

  @Test
  void doubleVerify_409() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(repo.findVerificationById("pay-1"))
        .thenReturn(verification("pay-1", "reg-1", "stu-1", "prog-1", "VERIFIED"));

    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () ->
                svc().verifyPayment(
                    "admin-sub", "pay-1", new DevelopmentDtos.VerifyPaymentRequest("VERIFIED", null), "req-1"));
    assertEquals("INVALID_STATE", conflict.getCode());
    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // Expiry frees the hold
  // ------------------------------------------------------------------

  @Test
  void expiryFreesHold_expireDueHoldsToExpired() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    Map<String, Object> due = new HashMap<>();
    due.put("id", "pay-2");
    due.put("registrationId", "reg-2");
    when(repo.expireDueHolds()).thenReturn(List.of(due));
    when(repo.findVerificationById("pay-2"))
        .thenReturn(verification("pay-2", "reg-2", "stu-2", "prog-1", "EXPIRED"));

    Map<String, Object> out = svc().expireHolds("admin-sub", "req-1");
    assertEquals(1, out.get("expired"));
    verify(repo).expireDueHolds();
    verify(audit).record(eq("system"), eq("PAYMENT_EXPIRED"), eq("payment_verification"), eq("pay-2"), eq("req-1"));
  }
}
