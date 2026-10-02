package com.elevateme.evaluation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.participation.GuestController;
import com.elevateme.participation.GuestRepository;
import com.elevateme.participation.GuestService;
import java.time.Instant;
import java.util.ArrayList;
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
 * Phase 1C guest evaluator journey (JUnit5 + Mockito, no DB).
 *
 * <ul>
 *   <li>Assigned guest may GET DRAFT + SUBMITTED + LOCKED in scope (released read kept).
 *   <li>Assigned draft PATCH ok (partial allowed, server total/10, version bump).
 *   <li>Unassigned session/student =&gt; 404 (no enumeration).
 *   <li>Submit requires all 10 int 0-100 (else 422); stale version =&gt; 409.
 *   <li>SUBMITTED is read-only (PATCH =&gt; 409 INVALID_STATE); guest release =&gt; 403.
 *   <li>Scope/expiry/revocation checked every request; cookie mutations verify
 *       same-origin Origin/Referer (CSRF) on top of SameSite=Strict.
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GuestEvaluateTest {

  @Mock EvaluationRepository evalRepo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock AuthContext auth;
  @Mock GuestRepository guestRepo;

  private ScoringService scoring;
  private EvaluationService evaluations;
  private GuestService guests;

  private static Map<String, Object> draftEvalRow(String id, int version) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("studentId", "student-1");
    m.put("sessionId", "sess-S");
    m.put("programId", "prog-1");
    m.put("rubricVersionId", "rubric-v2");
    m.put("state", "DRAFT");
    m.put("rowVersion", version);
    return m;
  }

  private static List<Object> ten(int v) {
    List<Object> out = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
      out.add(v);
    }
    return out;
  }

  private static Map<String, Object> guestScope() {
    Map<String, Object> scope = new HashMap<>();
    scope.put("invitationId", "inv-1");
    scope.put("scope", "SESSION");
    scope.put("sessionId", "sess-S");
    scope.put("programId", "prog-1");
    return scope;
  }

  @BeforeEach
  void setUp() {
    scoring = new ScoringService();
    evaluations =
        new EvaluationService(
            auth, scoring, evalRepo, guard, audit, outbox,
            new com.elevateme.common.idempotency.IdempotencyService());
    guests = new GuestService(guestRepo, guard, audit, outbox);
  }

  // ------------------------------------------------------------------
  // GET: assigned draft/submitted/released readable in scope
  // ------------------------------------------------------------------

  @Test
  void guestGetDraftAllowed_withScoresAndVersion() {
    when(evalRepo.findEvaluationRaw("eval-1")).thenReturn(draftEvalRow("eval-1", 3));
    when(evalRepo.findLatestRevision("eval-1")).thenReturn(null);

    Map<String, Object> sheet = evaluations.getEvaluationForGuest("sess-S", "eval-1");

    assertEquals("DRAFT", sheet.get("state"));
    assertEquals(3, sheet.get("version"));
    assertNotNull(sheet.get("scores"));
    assertEquals("student-1", sheet.get("studentId"));
    assertEquals("sess-S", sheet.get("sessionId"));
  }

  @Test
  void guestGetSubmittedAndLockedAllowed_readOnly() {
    Map<String, Object> submitted = draftEvalRow("eval-1", 4);
    submitted.put("state", "SUBMITTED");
    when(evalRepo.findEvaluationRaw("eval-1")).thenReturn(submitted);
    when(evalRepo.findLatestRevision("eval-1")).thenReturn(null);

    assertEquals("SUBMITTED", evaluations.getEvaluationForGuest("sess-S", "eval-1").get("state"));

    Map<String, Object> locked = draftEvalRow("eval-1", 5);
    locked.put("state", "LOCKED");
    when(evalRepo.findEvaluationRaw("eval-1")).thenReturn(locked);
    assertEquals("LOCKED", evaluations.getEvaluationForGuest("sess-S", "eval-1").get("state"));
  }

  @Test
  void guestGetUnrelatedSession_404() {
    when(evalRepo.findEvaluationRaw("eval-1")).thenReturn(draftEvalRow("eval-1", 1));
    ResourceNotFoundException notFound =
        assertThrows(
            ResourceNotFoundException.class,
            () -> evaluations.getEvaluationForGuest("sess-OTHER", "eval-1"));
    var res = new GlobalExceptionHandler().handleNotFound(notFound, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // Scope + per-student gates: unassigned => 404
  // ------------------------------------------------------------------

  @Test
  void unassignedSession_404_noEnumeration() {
    ResourceNotFoundException notFound =
        assertThrows(
            ResourceNotFoundException.class,
            () -> guests.checkGuestScope(guestScope(), "sess-OTHER"));
    var res = new GlobalExceptionHandler().handleNotFound(notFound, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
    assertEquals("NOT_FOUND", res.getBody().code());
  }

  @Test
  void unassignedStudent_404_whenAllowListPresent() {
    when(guestRepo.findAssignedStudentIds("inv-1"))
        .thenReturn(List.of("student-1", "student-2"));
    // Assigned passes.
    guests.checkGuestStudent(guestScope(), "student-1");
    // Unlisted => 404.
    assertThrows(
        ResourceNotFoundException.class, () -> guests.checkGuestStudent(guestScope(), "student-9"));
  }

  @Test
  void emptyAllowList_sessionScopeIsGate() {
    when(guestRepo.findAssignedStudentIds("inv-1")).thenReturn(List.of());
    // No explicit list: any student in the session passes the student gate
    // (session scope already checked via checkGuestScope).
    guests.checkGuestStudent(guestScope(), "student-any");
  }

  // ------------------------------------------------------------------
  // PATCH: assigned draft ok, version 409, state 409, validation 422
  // ------------------------------------------------------------------

  @Test
  void assignedDraftPatchOk_partialAllowed_serverTotal() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 1));
    when(evalRepo.findLatestRevision("eval-1")).thenReturn(null);
    when(evalRepo.nextRevisionNo("eval-1")).thenReturn(1);
    when(evalRepo.insertRevision(eq("eval-1"), eq(1), any(), eq("DRAFT"), isNull(), isNull()))
        .thenReturn("rev-1");
    when(evalRepo.updateEvaluationOptimistic(eq("eval-1"), eq(1), eq("good effort"))).thenReturn(1);

    List<Object> partial = new ArrayList<>();
    partial.add(80);
    partial.add(70);
    partial.add(null);
    Map<String, Object> out =
        evaluations.patchDraftAsGuest("eval-1", partial, "good effort", 1, "guest:inv-1", "req-1");

    assertEquals("DRAFT", out.get("state"));
    assertEquals(2, out.get("version"));
    // Server recomputes total/10 (80+70=150, avg 15.0); browser totals never trusted.
    assertEquals(150, out.get("provisionalTotal"));
    assertEquals(150, out.get("total"));
    assertEquals(15.0, out.get("average"));
    assertEquals(2, out.get("scoredCount"));
  }

  @Test
  void guestPatchStaleVersion_409() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 5));
    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () -> evaluations.patchDraftAsGuest("eval-1", ten(50), null, 4, "guest:inv-1", "req-1"));
    assertEquals("VERSION_CONFLICT", conflict.getCode());
    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
  }

  @Test
  void guestPatchSubmitted_readOnly_409() {
    Map<String, Object> submitted = draftEvalRow("eval-1", 2);
    submitted.put("state", "SUBMITTED");
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(submitted);
    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () -> evaluations.patchDraftAsGuest("eval-1", ten(50), null, 2, "guest:inv-1", "req-1"));
    assertEquals("INVALID_STATE", conflict.getCode());
  }

  @Test
  void guestPatchOutOfRange_422() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 1));
    List<Object> bad = new ArrayList<>(ten(50));
    bad.set(0, 101);
    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class,
            () -> evaluations.patchDraftAsGuest("eval-1", bad, null, 1, "guest:inv-1", "req-1"));
    var res = new GlobalExceptionHandler().handleIllegalArg(ex, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // SUBMIT: all 10 required (422), server total/10
  // ------------------------------------------------------------------

  @Test
  void guestSubmitAllTen_computesTotalServerSide() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 2));
    when(evalRepo.findLatestRevision("eval-1")).thenReturn(null);
    when(evalRepo.nextRevisionNo("eval-1")).thenReturn(1);
    when(evalRepo.insertRevision(eq("eval-1"), eq(1), any(), eq("SUBMITTED"), isNull(), isNull()))
        .thenReturn("rev-2");
    when(evalRepo.transitionEvaluationState("eval-1", 2, "DRAFT", "SUBMITTED")).thenReturn(1);

    Map<String, Object> out =
        evaluations.submitAsGuest("eval-1", ten(60), 2, "guest:inv-1", "req-submit");
    assertEquals("SUBMITTED", out.get("state"));
    assertEquals(600, out.get("total"));
    assertEquals(60.0, out.get("average"));
    assertEquals(3, out.get("version"));
  }

  @Test
  void guestSubmitMissing_422() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 1));
    List<Object> nine = new ArrayList<>();
    for (int i = 0; i < 9; i++) {
      nine.add(50);
    }
    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class,
            () -> evaluations.submitAsGuest("eval-1", nine, 1, "guest:inv-1", "req-1"));
    var res = new GlobalExceptionHandler().handleIllegalArg(ex, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());
  }

  @Test
  void guestSubmitStaleVersion_409() {
    when(evalRepo.lockEvaluation("eval-1")).thenReturn(draftEvalRow("eval-1", 3));
    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () -> evaluations.submitAsGuest("eval-1", ten(60), 2, "guest:inv-1", "req-1"));
    assertEquals("VERSION_CONFLICT", conflict.getCode());
  }

  // ------------------------------------------------------------------
  // Release: guest always 403
  // ------------------------------------------------------------------

  @Test
  void guestReleaseAlways403() {
    // Service gate.
    AccessDeniedException denied =
        assertThrows(AccessDeniedException.class, () -> GuestService.denyGuestRelease(true));
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());

    // Controller release endpoint: 403 for a guest cookie (scope valid, still denied).
    Map<String, Object> liveRow = new HashMap<>();
    liveRow.put("invitationId", "inv-1");
    liveRow.put("scope", "SESSION");
    liveRow.put("sessionId", "sess-S");
    liveRow.put("programId", "prog-1");
    liveRow.put("sessionExpiresAt", Instant.now().plusSeconds(3600).toString());
    liveRow.put("inviteExpiresAt", Instant.now().plusSeconds(3600).toString());
    liveRow.put("revokedAt", null);
    when(guestRepo.findLiveGuestSession(any())).thenReturn(liveRow);
    GuestService realGuests = new GuestService(guestRepo, guard, audit, outbox);
    GuestController controller = new GuestController(realGuests, evaluations);
    AccessDeniedException denied2 =
        assertThrows(
            AccessDeniedException.class,
            () ->
                controller.denyGuestRelease(
                    "eval-1", "cookie-token", new MockHttpServletRequest()));
    var res2 = new GlobalExceptionHandler().handleDenied(denied2, new MockHttpServletRequest());
    assertEquals(403, res2.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // CSRF: cookie mutations verify same-origin Origin/Referer
  // ------------------------------------------------------------------

  @Test
  void csrfSameOrigin_passes_mismatch403() {
    MockHttpServletRequest ok = new MockHttpServletRequest();
    ok.setScheme("https");
    ok.setServerName("app.example");
    ok.setServerPort(443);
    ok.addHeader("Origin", "https://app.example");
    GuestService.requireSameOrigin(ok);

    MockHttpServletRequest evil = new MockHttpServletRequest();
    evil.setScheme("https");
    evil.setServerName("app.example");
    evil.setServerPort(443);
    evil.addHeader("Origin", "https://evil.example");
    assertThrows(AccessDeniedException.class, () -> GuestService.requireSameOrigin(evil));

    MockHttpServletRequest refOk = new MockHttpServletRequest();
    refOk.setScheme("http");
    refOk.setServerName("localhost");
    refOk.setServerPort(5173);
    refOk.addHeader("Referer", "http://localhost:5173/evaluate/session");
    GuestService.requireSameOrigin(refOk);
  }

  @Test
  void expiredOrRevokedSession_401_everyRequest() {
    Map<String, Object> revoked = new HashMap<>();
    revoked.put("invitationId", "inv-1");
    revoked.put("scope", "SESSION");
    revoked.put("sessionId", "sess-S");
    revoked.put("programId", "prog-1");
    revoked.put("sessionExpiresAt", Instant.now().plusSeconds(3600).toString());
    revoked.put("inviteExpiresAt", Instant.now().plusSeconds(3600).toString());
    revoked.put("revokedAt", Instant.now().toString());
    when(guestRepo.findLiveGuestSession(any())).thenReturn(revoked);
    assertThrows(
        IllegalStateException.class, () -> guests.validateGuestSession("old-cookie"));
  }
}
