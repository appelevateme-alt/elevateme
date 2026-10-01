package com.elevateme.participation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import com.elevateme.evaluation.EvaluationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Phase 2 session endpoints (spec §10 + §11) + Phase 3 invitations/assignments.
 *
 * <p>Exact paths: GET /sessions/{id}/roster, PATCH /sessions/{id}/attendance,
 * POST /sessions/{id}/invitations, POST /sessions/{id}/assignments. Roster/attendance/invites
 * require staff scope (owner or assigned) — pending staff get 403 ACCOUNT_PENDING with no roster
 * data leaked. Invitation tokens are hash-only; the raw value appears once in the one-time
 * inviteUrl fragment.
 */
@RestController
@RequestMapping("/api/v1/sessions")
public class SessionController {

  private final ParticipationService service;
  private final GuestService guests;
  private final EvaluationService evaluations;
  private final AuthContext auth;

  @Autowired
  public SessionController(
      ParticipationService service, GuestService guests, EvaluationService evaluations, AuthContext auth) {
    this.service = service;
    this.guests = guests;
    this.evaluations = evaluations;
    this.auth = auth;
  }

  /** Legacy 2-arg wiring (Phase 2 callers/tests). Guest + evaluation paths need full wiring. */
  public SessionController(ParticipationService service, AuthContext auth) {
    this(service, null, null, auth);
  }

  /**
   * Staff-only roster with server-side search/filters + 10/page stable sort.
   * Query params: ?q=name|ID &amp;committee= &amp;status= &amp;page=1
   * Always paginated (detailed, 10/page); the legacy unpaginated projection
   * (findRosterForSession ORDER BY created_at, no LIMIT) was removed — unbounded
   * roster reads do not scale and bypass server-side search/filters.
   */
  @GetMapping("/{id}/roster")
  public ResponseEntity<?> roster(
      @PathVariable String id,
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "committee", required = false) String committee,
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "page", required = false, defaultValue = "1") int page,
      HttpServletRequest req) {
    // Guest scoped roster: cookie session with matching scope may read (unrelated => 404).
    String guestToken = guestCookie(req);
    if (guestToken != null && guests != null) {
      try {
        Map<String, Object> scope = guests.validateGuestSession(guestToken);
        guests.checkGuestScope(scope, id);
        Map<String, Object> out =
            service.getRosterDetailedForGuest(id, q, committee, status, page);
        return ResponseEntity.ok(out);
      } catch (com.elevateme.common.security.ResourceNotFoundException e) {
        throw e;
      } catch (IllegalStateException e) {
        // Invalid guest cookie -> fall through to staff Bearer path (401/403 there).
      }
    }
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out =
        service.getRosterDetailed(subject, id, q, committee, status, page, requestId);
    return ResponseEntity.ok(out);
  }

  /**
   * Staff-only attendance write. Absence is NOT a zero score — this path never
   * touches evaluation_scores. Returns {saved, total}.
   * Idempotent per (actor, operation, Idempotency-Key); differing payload → 409.
   */
  @PatchMapping("/{id}/attendance")
  public ResponseEntity<?> attendance(
      @PathVariable String id,
      @Valid @RequestBody ParticipationDtos.AttendancePatchRequest body,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out = service.markAttendance(subject, id, body, requestId, idempotencyKey);
    return ResponseEntity.ok(out);
  }

  /**
   * Staff creates a guest invitation (hash-only storage, scope SESSION, expiry default
   * session end+7d). Returns a one-time inviteUrl with the raw token in the fragment.
   */
  @PostMapping("/{id}/invitations")
  public ResponseEntity<?> invite(
      @PathVariable String id,
      @Valid @RequestBody(required = false) ParticipationDtos.InvitationCreateRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    String email = body == null ? null : body.email();
    GuestService.InvitationResult result = guests.createInvitation(subject, id, email, requestId);
    return ResponseEntity.status(201)
        .body(
            Map.of(
                "invitationId", result.invitationId(),
                "inviteUrl", result.inviteUrl(),
                "expiresAt", result.expiresAt() == null ? "" : result.expiresAt()));
  }

  /**
   * Staff assigns (or reassigns) a student sheet in this session. UNIQUE (student, session);
   * reassign bumps version + audit and invalidates old rights immediately.
   */
  @PostMapping("/{id}/assignments")
  public ResponseEntity<?> assign(
      @PathVariable String id,
      @Valid @RequestBody ParticipationDtos.AssignmentCreateRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out =
        evaluations.assign(subject, body.studentId(), id, body.evaluatorId(), requestId);
    return ResponseEntity.status(201).body(out);
  }

  private static String guestCookie(HttpServletRequest req) {
    if (req.getCookies() == null) {
      return null;
    }
    for (jakarta.servlet.http.Cookie c : req.getCookies()) {
      if ("guest_session".equals(c.getName())) {
        return c.getValue();
      }
    }
    return null;
  }
}
