package com.elevateme.participation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.performance.ReleaseRepository;
import com.elevateme.performance.ReleaseService;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Guest scope isolation (JUnit5 + Mockito, no DB).
 *
 * <ol>
 *   <li>Invitation stores ONLY the hash (raw token absent from DB args).
 *   <li>Exchange with fragment issues a session token; controller sets HttpOnly Secure SameSite
 *       cookie.
 *   <li>Guest ops on another session =&gt; 404 (single-invitation scope, no enumeration).
 *   <li>Revoke is immediate (no grace window); replay of old fragment/session =&gt; 401.
 *   <li>Guest can NEVER release (403).
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GuestScopeTest {

  @Mock GuestRepository guestRepo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;

  private GuestService guests() {
    return new GuestService(guestRepo, guard, audit, outbox);
  }

  private static Map<String, Object> liveInvitation(String id, String sessionId) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("scope", "SESSION");
    m.put("sessionId", sessionId);
    m.put("programId", "prog-1");
    m.put("expiresAt", Instant.now().plusSeconds(3600).toString());
    m.put("revokedAt", null);
    return m;
  }

  // ------------------------------------------------------------------
  // 1. Hash-only storage: raw token never reaches the DB
  // ------------------------------------------------------------------

  @Test
  void invitationStoresHashOnly_rawAbsentFromDb() {
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-S"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
    when(guestRepo.findSessionMeta("sess-S")).thenReturn(Map.of("programId", "prog-1"));
    ArgumentCaptor<String> hashCap = ArgumentCaptor.forClass(String.class);
    when(guestRepo.insertInvitation(eq("SESSION"), eq("prog-1"), eq("sess-S"), hashCap.capture(), eq("staff-1")))
        .thenReturn("inv-1");
    when(guestRepo.findInvitationById("inv-1")).thenReturn(liveInvitation("inv-1", "sess-S"));

    GuestService.InvitationResult result = guests().createInvitation("staff-sub", "sess-S", "g@example.com", "req-1");

    assertEquals("inv-1", result.invitationId());
    assertTrue(result.inviteUrl().contains("#t="), "one-time inviteUrl carries fragment");
    String raw = result.inviteUrl().substring(result.inviteUrl().indexOf("#t=") + 3);
    assertFalse(raw.isBlank());
    // Token is >=256-bit entropy (32 bytes -> 43 Base64URL chars).
    assertTrue(raw.length() >= 43, "token must carry >=256-bit entropy, got: " + raw.length());

    String storedHash = hashCap.getValue();
    assertEquals(64, storedHash.length(), "stored value is SHA-256 hex");
    assertEquals(GuestTokenUtil.sha256Hex(raw), storedHash);
    assertNotEquals(raw, storedHash, "raw token must never be stored");
    assertFalse(storedHash.contains(raw.substring(0, 8)), "raw fragment absent from DB arg");
  }

  // ------------------------------------------------------------------
  // 2. Exchange -> HttpOnly Secure SameSite cookie
  // ------------------------------------------------------------------

  @Test
  void exchangeIssuesSessionToken_controllerSetsHttpOnlyCookie() throws Exception {
    // Service: fragment hash verified, session token hashed at rest.
    GuestService svc = guests();
    Map<String, Object> inv = liveInvitation("inv-1", "sess-S");
    // Exchange looks up by hash; return live invitation for any hash.
    when(guestRepo.findInvitationByHash(any())).thenReturn(inv);
    ArgumentCaptor<String> sessionHashCap = ArgumentCaptor.forClass(String.class);
    when(guestRepo.insertGuestSession(eq("inv-1"), sessionHashCap.capture())).thenReturn("gs-1");

    String fragment = GuestTokenUtil.generateRawToken();
    String sessionToken = svc.exchange(fragment, "req-ex");

    assertNotNull(sessionToken);
    assertEquals(GuestTokenUtil.sha256Hex(sessionToken), sessionHashCap.getValue());
    assertNotEquals(sessionToken, sessionHashCap.getValue(), "cookie value hashed at rest");

    // Controller: sets HttpOnly SameSite cookie, never logs the token.
    // Secure is conditional: localhost dev (http) omits Secure (browsers reject
    // Secure on http), prod https sets Secure.
    GuestService mockGuests = mock(GuestService.class);
    when(mockGuests.exchange(eq(fragment), any())).thenReturn(sessionToken);
    // Localhost (default publicUrl http://localhost:5173): HttpOnly + SameSite, Secure=false.
    GuestController localhostController = new GuestController(mockGuests);
    var resLocal =
        localhostController.exchange(
            new ParticipationDtos.GuestExchangeRequest(fragment), new MockHttpServletRequest());
    assertEquals(200, resLocal.getStatusCode().value());
    String localCookie = resLocal.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
    assertNotNull(localCookie);
    assertTrue(localCookie.contains("guest_session="), "cookie name");
    assertTrue(localCookie.contains("HttpOnly"), "HttpOnly");
    assertTrue(localCookie.contains("SameSite"), "SameSite");
    assertFalse(localCookie.contains("Secure"), "localhost http must not set Secure");
    // Prod https: Secure=true.
    GuestController prodController = new GuestController(mockGuests, null, "https://app.test");
    var res =
        prodController.exchange(
            new ParticipationDtos.GuestExchangeRequest(fragment), new MockHttpServletRequest());
    assertEquals(200, res.getStatusCode().value());
    String setCookie = res.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
    assertNotNull(setCookie);
    assertTrue(setCookie.contains("guest_session="), "cookie name");
    assertTrue(setCookie.contains("HttpOnly"), "HttpOnly");
    assertTrue(setCookie.contains("Secure"), "Secure");
    assertTrue(setCookie.contains("SameSite"), "SameSite");
  }

  @Test
  void exchangeUnknownOrExpiredFragment_401() {
    when(guestRepo.findInvitationByHash(any())).thenReturn(null);
    assertThrows(IllegalStateException.class, () -> guests().exchange("bogus", "req-1"));

    Map<String, Object> expired = liveInvitation("inv-1", "sess-S");
    expired.put("expiresAt", Instant.now().minusSeconds(10).toString());
    when(guestRepo.findInvitationByHash(any())).thenReturn(expired);
    assertThrows(
        IllegalStateException.class,
        () -> guests().exchange(GuestTokenUtil.generateRawToken(), "req-2"));

    var res =
        new GlobalExceptionHandler()
            .handleUnauthenticated(new IllegalStateException("Unauthenticated"), new MockHttpServletRequest());
    assertEquals(401, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // 3. Scope: unrelated session => 404
  // ------------------------------------------------------------------

  @Test
  void guestScopedToSingleInvitation_unrelatedIs404() {
    Map<String, Object> scope = new HashMap<>();
    scope.put("invitationId", "inv-1");
    scope.put("scope", "SESSION");
    scope.put("sessionId", "sess-S");
    scope.put("programId", "prog-1");

    // Same session passes.
    guests().checkGuestScope(scope, "sess-S");

    // Unrelated session => 404 (no enumeration).
    ResourceNotFoundException notFound =
        assertThrows(
            ResourceNotFoundException.class, () -> guests().checkGuestScope(scope, "sess-OTHER"));
    var res = new GlobalExceptionHandler().handleNotFound(notFound, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
    assertEquals("NOT_FOUND", res.getBody().code());
  }

  // ------------------------------------------------------------------
  // 4. Revocation immediate; replay => 401
  // ------------------------------------------------------------------

  @Test
  void revocationIsImmediate_replayFails401() {
    // Revoke path: staff scoped to the invitation session.
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-S"), any());
    when(guard.loadCaller("staff-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("staff-1", "coordinator", "Approved"));
    when(guestRepo.findInvitationById("inv-1")).thenReturn(liveInvitation("inv-1", "sess-S"));
    when(guestRepo.revokeInvitation("inv-1")).thenReturn(1);

    guests().revoke("staff-sub", "inv-1", "req-revoke");
    verify(guestRepo).revokeInvitation("inv-1");
    verify(audit)
        .record(eq("staff-1"), eq("GUEST_INVITATION_REVOKED"), eq("guest_invitation"), eq("inv-1"), eq("req-revoke"));

    // Next guest request with a session from the revoked invitation => 401 (no grace window).
    Map<String, Object> revokedRow = new HashMap<>();
    revokedRow.put("invitationId", "inv-1");
    revokedRow.put("scope", "SESSION");
    revokedRow.put("sessionId", "sess-S");
    revokedRow.put("programId", "prog-1");
    revokedRow.put("sessionExpiresAt", Instant.now().plusSeconds(3600).toString());
    revokedRow.put("inviteExpiresAt", Instant.now().plusSeconds(3600).toString());
    revokedRow.put("revokedAt", Instant.now().toString());
    when(guestRepo.findLiveGuestSession(any())).thenReturn(revokedRow);

    IllegalStateException unauth =
        assertThrows(IllegalStateException.class, () -> guests().validateGuestSession("old-cookie"));
    var res = new GlobalExceptionHandler().handleUnauthenticated(unauth, new MockHttpServletRequest());
    assertEquals(401, res.getStatusCode().value());

    // Replay of the old fragment after revoke => 401 as well.
    Map<String, Object> revokedInvite = liveInvitation("inv-1", "sess-S");
    revokedInvite.put("revokedAt", Instant.now().toString());
    when(guestRepo.findInvitationByHash(any())).thenReturn(revokedInvite);
    assertThrows(
        IllegalStateException.class,
        () -> guests().exchange(GuestTokenUtil.generateRawToken(), "req-replay"));
  }

  // ------------------------------------------------------------------
  // 5. Guest can NEVER release (403)
  // ------------------------------------------------------------------

  @Test
  void guestCanNeverRelease_403() {
    ReleaseRepository releaseRepo = mock(ReleaseRepository.class);
    com.elevateme.common.idempotency.IdempotencyService idem =
        new com.elevateme.common.idempotency.IdempotencyService();
    com.elevateme.common.security.AuthContext authCtx = mock(com.elevateme.common.security.AuthContext.class);
    ReleaseService releases = new ReleaseService(releaseRepo, guard, audit, outbox, idem, authCtx);

    AccessDeniedException denied =
        assertThrows(
            AccessDeniedException.class,
            () -> releases.release("guest:inv-1", "sess-S", "key-1", "req-1", true));
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("FORBIDDEN", res.getBody().code());
    verify(releaseRepo, never()).insertRelease(any(), any(), any(), any(), any());
    verify(releaseRepo, never()).releaseEvaluations(any());
  }
}
