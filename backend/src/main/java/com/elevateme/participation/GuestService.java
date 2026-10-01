package com.elevateme.participation;

import com.elevateme.audit.AuditService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 3 guest invitations + exchange.
 *
 * <ul>
 *   <li>POST /sessions/{id}/invitations creates a &gt;=256-bit token, stores ONLY its SHA-256 hash,
 *       scope SESSION (+ expiry default session end+7d via DB trigger), and returns a one-time
 *       inviteUrl with the raw token in the fragment ({@code #t=...}, never logged/stored).
 *   <li>POST /guest/exchange verifies hash/expiry/revoked, then issues a short-TTL HttpOnly cookie
 *       session (24h, hashed at rest). Revocation is immediate (no grace window).
 *   <li>Every guest op checks scope (unrelated session =&gt; 404 to avoid enumeration).
 *   <li>Guests can NEVER release (403) — enforced in {@link
 *       com.elevateme.performance.ReleaseService}.
 * </ul>
 */
@Service
public class GuestService {
  private final GuestRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final String publicUrl;

  @Autowired
  public GuestService(
      GuestRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      @Value("${app.public-url:http://localhost:5173}") String publicUrl) {
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.publicUrl = publicUrl == null || publicUrl.isBlank() ? "http://localhost:5173" : publicUrl;
  }

  /** Test-friendly ctor without Spring @Value. */
  public GuestService(GuestRepository repo, ScopeGuard guard, AuditService audit, OutboxService outbox) {
    this(repo, guard, audit, outbox, "http://localhost:5173");
  }

  public record InvitationResult(String invitationId, String inviteUrl, String expiresAt) {}

  /**
   * Staff creates a session invitation. Stores hash-only; raw token appears once in the returned
   * inviteUrl fragment.
   */
  @Transactional
  public InvitationResult createInvitation(
      String authenticatedSubject, String sessionId, String email, String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();

    Map<String, Object> session = repo.findSessionMeta(sessionId);
    String programId =
        session.get("programId") == null ? null : String.valueOf(session.get("programId"));

    String rawToken = GuestTokenUtil.generateRawToken();
    String tokenHash = GuestTokenUtil.sha256Hex(rawToken);
    String invitationId = repo.insertInvitation("SESSION", programId, sessionId, tokenHash, actorId);
    Map<String, Object> stored = repo.findInvitationById(invitationId);
    String expiresAt = stored.get("expiresAt") == null ? null : String.valueOf(stored.get("expiresAt"));

    if (audit != null) {
      audit.record(actorId, "GUEST_INVITATION_CREATED", "guest_invitation", invitationId, requestId);
    }
    if (outbox != null) {
      String safeEmail = email == null ? "" : email.replace("\"", "");
      outbox.emit(
          "guest_invitation",
          invitationId,
          "GUEST_INVITATION_CREATED",
          "{\"sessionId\":\"" + sessionId + "\",\"email\":\"" + safeEmail + "\"}",
          "GUEST_INVITATION_CREATED:" + invitationId);
    }
    // One-time inviteUrl with fragment (fragment never reaches the server on click).
    // Frontend router only serves /evaluate/invite (with ?sessionId=); /guest is a 404.
    String inviteUrl = publicUrl + "/evaluate/invite?sessionId=" + sessionId + "#t=" + rawToken;
    return new InvitationResult(invitationId, inviteUrl, expiresAt);
  }

  /**
   * Exchange a one-time fragment for a cookie session. Returns the raw session token (controller
   * sets it as HttpOnly Secure SameSite cookie; never logs it).
   */
  @Transactional
  public String exchange(String fragment, String requestId) {
    if (fragment == null || fragment.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    String raw = fragment.trim();
    // Allow "t=<token>" or bare token (frontend strips "#t=" before POST).
    if (raw.startsWith("t=")) {
      raw = raw.substring(2);
    }
    if (raw.contains("&")) {
      raw = raw.split("&")[0];
    }
    if (raw.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    String hash = GuestTokenUtil.sha256Hex(raw);
    Map<String, Object> invitation = repo.findInvitationByHash(hash);
    if (invitation == null) {
      throw new IllegalStateException("Unauthenticated");
    }
    assertLive(invitation);
    String invitationId = String.valueOf(invitation.get("id"));
    String sessionToken = GuestTokenUtil.generateRawToken();
    repo.insertGuestSession(invitationId, GuestTokenUtil.sha256Hex(sessionToken));
    return sessionToken;
  }

  /** Validate a cookie session token; returns the live invitation scope. 401 when invalid. */
  public Map<String, Object> validateGuestSession(String sessionToken) {
    if (sessionToken == null || sessionToken.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    Map<String, Object> row = repo.findLiveGuestSession(GuestTokenUtil.sha256Hex(sessionToken.trim()));
    if (row == null) {
      throw new IllegalStateException("Unauthenticated");
    }
    if (row.get("revokedAt") != null) {
      throw new IllegalStateException("Unauthenticated");
    }
    if (isExpired(row.get("sessionExpiresAt")) || isExpired(row.get("inviteExpiresAt"))) {
      throw new IllegalStateException("Unauthenticated");
    }
    repo.touchGuestSession(GuestTokenUtil.sha256Hex(sessionToken.trim()));
    Map<String, Object> scope = new HashMap<>();
    scope.put("invitationId", String.valueOf(row.get("invitationId")));
    scope.put("scope", String.valueOf(row.get("scope")));
    scope.put("sessionId", row.get("sessionId") == null ? null : String.valueOf(row.get("sessionId")));
    scope.put("programId", row.get("programId") == null ? null : String.valueOf(row.get("programId")));
    return scope;
  }

  /**
   * Scope gate for every guest op: unrelated session =&gt; 404 (no enumeration). EVENT scope
   * allows any session in the invited program; SESSION scope allows exactly one session.
   */
  public void checkGuestScope(Map<String, Object> guestScope, String targetSessionId) {
    if (guestScope == null || targetSessionId == null) {
      throw new ResourceNotFoundException("Not found");
    }
    String scope = String.valueOf(guestScope.get("scope"));
    if ("EVENT".equals(scope)) {
      // Program-scoped: allow when the target session belongs to the invited program.
      // Repository lookup is best-effort; mismatch (or unknown) => 404.
      try {
        Map<String, Object> meta = repo.findSessionMeta(targetSessionId);
        String invitedProgram =
            guestScope.get("programId") == null ? null : String.valueOf(guestScope.get("programId"));
        String targetProgram =
            meta.get("programId") == null ? null : String.valueOf(meta.get("programId"));
        if (invitedProgram != null && invitedProgram.equals(targetProgram)) {
          return;
        }
      } catch (ResourceNotFoundException e) {
        throw e;
      } catch (Exception ignored) {
        // fall through to 404
      }
      throw new ResourceNotFoundException("Not found");
    }
    // Default SESSION scope: exact match.
    String allowed = guestScope.get("sessionId") == null ? null : String.valueOf(guestScope.get("sessionId"));
    if (!targetSessionId.equals(allowed)) {
      throw new ResourceNotFoundException("Not found");
    }
  }

  /** Staff revokes an invitation; guest cookie checks fail immediately after. */
  @Transactional
  public void revoke(String authenticatedSubject, String invitationId, String requestId) {
    Map<String, Object> invitation = repo.findInvitationById(invitationId);
    String sessionId =
        invitation.get("sessionId") == null ? null : String.valueOf(invitation.get("sessionId"));
    if (sessionId != null) {
      guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    } else {
      guard.requireStaffActive(authenticatedSubject, requestId);
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    int updated = repo.revokeInvitation(invitationId);
    if (updated == 0) {
      throw new ResourceNotFoundException("Not found");
    }
    if (audit != null) {
      audit.record(actorId, "GUEST_INVITATION_REVOKED", "guest_invitation", invitationId, requestId);
    }
  }

  /** Guest scope check from a raw cookie token (convenience for controllers). */
  public Map<String, Object> requireGuestScope(String sessionToken, String targetSessionId) {
    Map<String, Object> scope = validateGuestSession(sessionToken);
    checkGuestScope(scope, targetSessionId);
    return scope;
  }

  private void assertLive(Map<String, Object> invitation) {
    if (invitation.get("revokedAt") != null) {
      throw new IllegalStateException("Unauthenticated");
    }
    if (isExpired(invitation.get("expiresAt"))) {
      throw new IllegalStateException("Unauthenticated");
    }
  }

  private static boolean isExpired(Object expiresAt) {
    if (expiresAt == null) {
      return false;
    }
    if (expiresAt instanceof Instant i) {
      return !i.isAfter(Instant.now());
    }
    if (expiresAt instanceof java.sql.Timestamp ts) {
      return !ts.toInstant().isAfter(Instant.now());
    }
    if (expiresAt instanceof java.util.Date d) {
      return !d.toInstant().isAfter(Instant.now());
    }
    try {
      return !Instant.parse(String.valueOf(expiresAt)).isAfter(Instant.now());
    } catch (Exception e) {
      return false;
    }
  }

  /** Guard helper for tests/controllers: guests must never reach release paths. */
  public static void denyGuestRelease(boolean isGuest) {
    if (isGuest) {
      throw new AccessDeniedException("Guests cannot release reports");
    }
  }
}
