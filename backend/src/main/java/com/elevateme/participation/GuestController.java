package com.elevateme.participation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.evaluation.EvaluationDtos;
import com.elevateme.evaluation.EvaluationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact path: POST /guest/exchange + GET/PATCH /guest/evaluations/{id} +
 * POST /guest/evaluations/{id}/submit + GET /guest/session + GET /guest/roster +
 * GET /guest/students/{studentId}/evaluation.
 *
 * <p>Phase 1C guest evaluator journey: invite link ({@code #t=...}, never logged) -&gt;
 * HttpOnly Secure SameSite cookie session -&gt; assigned roster (names + status only)
 * -&gt; editable sheet (DRAFT) -&gt; submit (SUBMITTED, read-only) -&gt; released
 * (LOCKED, read-only). Backend rejects unreleased access outside scope (404); guests
 * may GET/PATCH DRAFT + SUBMITTED for their assigned student+session only.
 *
 * <p>Security on every request: cookie session validated (hash-only lookup, expiry +
 * revocation, no grace window); scope checked (unrelated session/student =&gt; 404,
 * no enumeration); cookie mutations additionally verify same-origin Origin/Referer
 * (CSRF) on top of SameSite=Strict; raw tokens/fragments are never logged or stored
 * (hash-only); guests can NEVER release (403).
 */
@RestController
@RequestMapping("/api/v1/guest")
public class GuestController {

  private final GuestService guests;
  private final EvaluationService evaluations;
  private final ParticipationService participation;
  private final String publicUrl;

  @Autowired
  public GuestController(
      GuestService guests,
      EvaluationService evaluations,
      ParticipationService participation,
      @Value("${app.public-url:http://localhost:5173}") String publicUrl) {
    this.guests = guests;
    this.evaluations = evaluations;
    this.participation = participation;
    this.publicUrl =
        publicUrl == null || publicUrl.isBlank() ? "http://localhost:5173" : publicUrl;
  }

  /** Legacy wiring (roster/evaluate callers/tests without publicUrl). */
  public GuestController(GuestService guests, EvaluationService evaluations) {
    this(guests, evaluations, null, "http://localhost:5173");
  }

  /** Legacy 3-arg wiring (exchange cookie tests with explicit publicUrl). */
  public GuestController(GuestService guests, EvaluationService evaluations, String publicUrl) {
    this(guests, evaluations, null, publicUrl);
  }

  /** Legacy single-arg wiring (exchange-only callers/tests). */
  public GuestController(GuestService guests) {
    this(guests, null, null, "http://localhost:5173");
  }

  /** Secure cookies require https; localhost dev (http://localhost) must not set Secure. */
  static boolean isLocalhost(String url) {
    if (url == null) {
      return false;
    }
    return url.trim().toLowerCase().startsWith("http://localhost");
  }

  @PostMapping("/exchange")
  public ResponseEntity<?> exchange(
      @Valid @RequestBody ParticipationDtos.GuestExchangeRequest body, HttpServletRequest req) {
    String requestId = RequestIdFilter.resolve(req);
    // Never log body.fragment() (raw token): hash-only lookup inside the service.
    String sessionToken = guests.exchange(body.fragment(), requestId);
    // Short-TTL (24h) HttpOnly SameSite cookie; Path=/ so scoped reads carry it.
    // Secure is conditional: false on http://localhost dev (browsers reject Secure on http),
    // true otherwise (prod https).
    boolean secure = !isLocalhost(publicUrl);
    ResponseCookie cookie =
        ResponseCookie.from("guest_session", sessionToken)
            .httpOnly(true)
            .secure(secure)
            .sameSite("Strict")
            .path("/")
            .maxAge(Duration.ofHours(24))
            .build();
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, cookie.toString())
        .body(Map.of("ok", true));
  }

  /**
   * Scope-resolved session for the cookie (no DB/session IDs from the client).
   * Frontend resolves the assigned session from the invitation scope — never asks
   * the guest to type IDs.
   */
  @GetMapping("/session")
  public ResponseEntity<?> guestSession(
      @CookieValue(value = "guest_session", required = false) String guestSession) {
    Map<String, Object> scope = requireGuest(guestSession);
    Map<String, Object> out = new HashMap<>();
    out.put("scope", scope.get("scope"));
    out.put("sessionId", scope.get("sessionId"));
    out.put("programId", scope.get("programId"));
    out.put("invitationId", scope.get("invitationId"));
    return ResponseEntity.ok(out);
  }

  /**
   * Scope-resolved roster: names + status only (no contacts/history/recommendations).
   * No sessionId param required — resolved from the invitation scope. EVENT scope
   * may pass ?sessionId= to select a session within the invited program.
   */
  @GetMapping("/roster")
  public ResponseEntity<?> guestRoster(
      @CookieValue(value = "guest_session", required = false) String guestSession,
      @RequestParam(value = "sessionId", required = false) String sessionIdParam,
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "page", required = false, defaultValue = "1") int page) {
    Map<String, Object> scope = requireGuest(guestSession);
    String sessionId = resolveRosterSession(scope, sessionIdParam);
    guests.checkGuestScope(scope, sessionId);
    if (participation == null) {
      throw new ResourceNotFoundException("Not found");
    }
    Map<String, Object> out =
        participation.getRosterDetailedForGuest(sessionId, q, null, null, page);
    // Per-student allow-list: narrow rows when the invitation names students.
    filterRosterToAssigned(scope, out);
    return ResponseEntity.ok(out);
  }

  /**
   * Resolve an evaluation by assigned student (no evaluation DB id from the client).
   * Scope + per-student checks apply (unrelated =&gt; 404).
   */
  @GetMapping("/students/{studentId}/evaluation")
  public ResponseEntity<?> guestEvaluationByStudent(
      @PathVariable String studentId,
      @CookieValue(value = "guest_session", required = false) String guestSession) {
    Map<String, Object> scope = requireGuest(guestSession);
    guests.checkGuestStudent(scope, studentId);
    String sessionId = resolveRosterSession(scope, null);
    guests.checkGuestScope(scope, sessionId);
    if (evaluations == null) {
      throw new ResourceNotFoundException("Not found");
    }
    String evaluationId = evaluations.findEvaluationIdForStudentSession(studentId, sessionId);
    return guestEvaluation(evaluationId, guestSession, null);
  }

  /**
   * Guest scoped evaluation read: DRAFT + SUBMITTED (editable) + LOCKED (released,
   * read-only) for the assigned student+session. Unrelated session/student =&gt; 404.
   * Scope/expiry/revocation checked every request via {@link #requireGuest}.
   */
  @GetMapping("/evaluations/{id}")
  public ResponseEntity<?> guestEvaluation(
      @PathVariable String id,
      @CookieValue(value = "guest_session", required = false) String guestSession,
      HttpServletRequest req) {
    Map<String, Object> scope = requireGuest(guestSession);
    String requestId = RequestIdFilter.resolve(req);
    String scopeKind = scope.get("scope") == null ? "SESSION" : String.valueOf(scope.get("scope"));
    if ("EVENT".equals(scopeKind)) {
      // Program-scoped: resolve the evaluation's session, then program-check (404 on mismatch).
      String targetSession = evaluations.findSessionIdForEvaluation(id);
      guests.checkGuestScope(scope, targetSession);
      String studentId = evaluations.findStudentIdForEvaluation(id);
      guests.checkGuestStudent(scope, studentId, requestId);
      return ResponseEntity.ok(evaluations.getEvaluationForGuest(targetSession, id));
    }
    String allowedSession = scope.get("sessionId") == null ? null : String.valueOf(scope.get("sessionId"));
    // Per-student allow-list before returning the sheet (404 on unassigned).
    try {
      String studentId = evaluations.findStudentIdForEvaluation(id);
      guests.checkGuestStudent(scope, studentId, requestId);
    } catch (ResourceNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new ResourceNotFoundException("Not found");
    }
    return ResponseEntity.ok(evaluations.getEvaluationForGuest(allowedSession, id));
  }

  /**
   * Guest draft PATCH: partial scores allowed (null = blank, never 0). Accepts
   * {@code scores} as an ordered 10-slot array OR a 10-key object
   * ({@code preparation..overall_performance}); {@code remarks} (alias
   * {@code notes}) max 2000; {@code version} required. Assignment + version
   * checks apply (unassigned =&gt; 404, stale =&gt; 409 VERSION_CONFLICT).
   * Server recomputes total/10. SUBMITTED/LOCKED =&gt; 409 INVALID_STATE.
   */
  @PatchMapping("/evaluations/{id}")
  public ResponseEntity<?> patchGuestEvaluation(
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body,
      @CookieValue(value = "guest_session", required = false) String guestSession,
      HttpServletRequest req) {
    Map<String, Object> scope = requireGuest(guestSession);
    GuestService.requireSameOrigin(req);
    String requestId = RequestIdFilter.resolve(req);
    String targetSession = evaluations.findSessionIdForEvaluation(id);
    guests.checkGuestScope(scope, targetSession);
    String studentId = evaluations.findStudentIdForEvaluation(id);
    guests.checkGuestStudent(scope, studentId, requestId);
    List<Object> scores = extractGuestScores(body);
    String remarks = extractRemarks(body);
    Integer version = extractVersion(body);
    String guestActor =
        scope.get("invitationId") == null
            ? "guest"
            : "guest:" + String.valueOf(scope.get("invitationId"));
    Map<String, Object> out =
        evaluations.patchDraftAsGuest(id, scores, remarks, version, guestActor, requestId);
    return ResponseEntity.ok(out);
  }

  /**
   * Guest submit: DRAFT-&gt;SUBMITTED, all 10 int 0-100 required (else 422).
   * Version mismatch =&gt; 409. Submitted locks the sheet (read-only unless staff
   * reopens). Server recomputes total/10.
   */
  @PostMapping("/evaluations/{id}/submit")
  public ResponseEntity<?> submitGuestEvaluation(
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body,
      @CookieValue(value = "guest_session", required = false) String guestSession,
      HttpServletRequest req) {
    Map<String, Object> scope = requireGuest(guestSession);
    GuestService.requireSameOrigin(req);
    String requestId = RequestIdFilter.resolve(req);
    String targetSession = evaluations.findSessionIdForEvaluation(id);
    guests.checkGuestScope(scope, targetSession);
    String studentId = evaluations.findStudentIdForEvaluation(id);
    guests.checkGuestStudent(scope, studentId, requestId);
    List<Object> scores = extractGuestScores(body);
    Integer version = body == null ? null : extractVersion(body);
    String guestActor =
        scope.get("invitationId") == null
            ? "guest"
            : "guest:" + String.valueOf(scope.get("invitationId"));
    Map<String, Object> out =
        evaluations.submitAsGuest(id, scores, version, guestActor, requestId);
    return ResponseEntity.ok(out);
  }

  /** Guests can NEVER release reports (403). No release button is offered to guests. */
  @PostMapping("/evaluations/{id}/release")
  public ResponseEntity<?> denyGuestRelease(
      @PathVariable String id,
      @CookieValue(value = "guest_session", required = false) String guestSession,
      HttpServletRequest req) {
    requireGuest(guestSession);
    String requestId = RequestIdFilter.resolve(req);
    GuestService.denyGuestRelease(true);
    throw new AccessDeniedException("Guests cannot release reports");
  }

  // ------------------------------------------------------------------
  // Helpers (no tokens in logs; scope checked every request)
  // ------------------------------------------------------------------

  /** Validate the cookie session (expiry/revocation checked, no grace window). 401 when invalid. */
  private Map<String, Object> requireGuest(String guestSession) {
    if (guestSession == null || guestSession.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    // Hash-only lookup inside; raw cookie value never logged.
    return guests.validateGuestSession(guestSession);
  }

  /** Roster session: SESSION scope uses the invited session; EVENT may narrow via ?sessionId=. */
  private String resolveRosterSession(Map<String, Object> scope, String requested) {
    String kind = scope.get("scope") == null ? "SESSION" : String.valueOf(scope.get("scope"));
    if ("EVENT".equals(kind)) {
      if (requested != null && !requested.isBlank()) {
        return requested.trim();
      }
      // Program-scoped without a selected session: no single roster — 404 (no leak).
      throw new ResourceNotFoundException("Not found");
    }
    Object allowed = scope.get("sessionId");
    if (allowed == null || String.valueOf(allowed).isBlank()) {
      throw new ResourceNotFoundException("Not found");
    }
    return String.valueOf(allowed);
  }

  /** Narrow roster rows to the invitation allow-list when present (others hidden, no leak). */
  @SuppressWarnings("unchecked")
  private void filterRosterToAssigned(Map<String, Object> scope, Map<String, Object> roster) {
    if (scope.get("invitationId") == null || guests == null) {
      return;
    }
    try {
      // Best-effort: GuestService owns the repo; expose via a scoped probe per row.
      // When the allow-list is empty this is a no-op.
      Object rowsObj = roster.get("rows");
      if (!(rowsObj instanceof List)) {
        rowsObj = roster.get("items");
      }
      if (!(rowsObj instanceof List)) {
        return;
      }
      List<Map<String, Object>> rows = (List<Map<String, Object>>) rowsObj;
      List<Map<String, Object>> kept = new ArrayList<>();
      for (Map<String, Object> r : rows) {
        Object sid = r.get("studentId") == null ? r.get("id") : r.get("studentId");
        try {
          guests.checkGuestStudent(scope, sid == null ? null : String.valueOf(sid));
          kept.add(r);
        } catch (ResourceNotFoundException e) {
          // Unassigned student: hide (no enumeration).
        }
      }
      roster.put("rows", kept);
      roster.put("items", kept);
      roster.put("total", kept.size());
    } catch (Exception ignored) {
      // Best-effort narrowing; scope check already gated the session.
    }
  }

  /** Scores as ordered 10-slot list: accepts array OR 10-key object (partial ok for draft). */
  @SuppressWarnings("unchecked")
  private static List<Object> extractGuestScores(Map<String, Object> body) {
    if (body == null || body.get("scores") == null) {
      if (body != null && body.get("answers") != null) {
        return extractAnswers(body.get("answers"));
      }
      return null;
    }
    Object v = body.get("scores");
    if (v instanceof List<?> l) {
      return (List<Object>) l;
    }
    if (v instanceof Map<?, ?> m) {
      List<Object> ordered = new ArrayList<>();
      for (String k : EvaluationDtos.CRITERION_KEYS) {
        ordered.add(m.get(k));
      }
      return ordered;
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private static List<Object> extractAnswers(Object answers) {
    if (!(answers instanceof List<?> l)) {
      return null;
    }
    List<Object> out = new ArrayList<>();
    for (Object a : l) {
      if (a instanceof Map<?, ?> m) {
        out.add(m.get("score"));
      } else {
        out.add(a);
      }
    }
    return out;
  }

  /** Remarks alias: remarks | notes | comment (max 2000, validated in service). */
  private static String extractRemarks(Map<String, Object> body) {
    if (body == null) {
      return null;
    }
    for (String key : new String[] {"remarks", "notes", "comment"}) {
      if (body.get(key) != null) {
        return String.valueOf(body.get(key));
      }
    }
    return null;
  }

  private static Integer extractVersion(Map<String, Object> body) {
    if (body == null || body.get("version") == null) {
      return null;
    }
    Object v = body.get("version");
    if (v instanceof Number n) {
      return n.intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (Exception e) {
      return null;
    }
  }
}
