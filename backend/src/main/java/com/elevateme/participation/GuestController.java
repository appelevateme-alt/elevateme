package com.elevateme.participation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.evaluation.EvaluationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact path: POST /guest/exchange.
 *
 * <p>Fragment ({@code #t=...}, never logged) -&gt; HttpOnly Secure SameSite cookie session.
 * Hash-only lookup; single-invitation scope; revocation immediate; rate-limit at the edge.
 * The raw session token is set once as {@code guest_session}; the DB holds only its hash.
 * Every guest read checks scope (unrelated =&gt; 404).
 */
@RestController
@RequestMapping("/api/v1/guest")
public class GuestController {

  private final GuestService guests;
  private final EvaluationService evaluations;
  private final String publicUrl;

  @Autowired
  public GuestController(
      GuestService guests,
      EvaluationService evaluations,
      @Value("${app.public-url:http://localhost:5173}") String publicUrl) {
    this.guests = guests;
    this.evaluations = evaluations;
    this.publicUrl =
        publicUrl == null || publicUrl.isBlank() ? "http://localhost:5173" : publicUrl;
  }

  /** Legacy wiring (roster/evaluate callers/tests without publicUrl). */
  public GuestController(GuestService guests, EvaluationService evaluations) {
    this(guests, evaluations, "http://localhost:5173");
  }

  /** Legacy single-arg wiring (exchange-only callers/tests). */
  public GuestController(GuestService guests) {
    this(guests, null, "http://localhost:5173");
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

  /** Guest scoped evaluation read: released only, unrelated session =&gt; 404. */
  @GetMapping("/evaluations/{id}")
  public ResponseEntity<?> guestEvaluation(
      @PathVariable String id,
      @CookieValue(value = "guest_session", required = false) String guestSession,
      HttpServletRequest req) {
    if (guestSession == null || guestSession.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    Map<String, Object> scope = guests.validateGuestSession(guestSession);
    String scopeKind = scope.get("scope") == null ? "SESSION" : String.valueOf(scope.get("scope"));
    if ("EVENT".equals(scopeKind)) {
      // Program-scoped: resolve the evaluation's session, then program-check (404 on mismatch).
      String targetSession = evaluations.findSessionIdForEvaluation(id);
      guests.checkGuestScope(scope, targetSession);
      return ResponseEntity.ok(evaluations.getEvaluationForGuest(targetSession, id));
    }
    String allowedSession = scope.get("sessionId") == null ? null : String.valueOf(scope.get("sessionId"));
    return ResponseEntity.ok(evaluations.getEvaluationForGuest(allowedSession, id));
  }
}
