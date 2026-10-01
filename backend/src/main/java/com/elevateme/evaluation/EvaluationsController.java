package com.elevateme.evaluation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact paths: GET /evaluations/{id}, PATCH /evaluations/{id}, POST /evaluations/{id}/submit +
 * /reopen + /correct, POST /evaluations/assignments.
 *
 * <p>Draft PATCH allows incomplete (blank != zero); submit requires all 10 int 0-100 (422 on
 * 101/negative/fractional/missing). Optimistic version mismatch -&gt; 409. Totals are recomputed
 * server-side, never trusted from the browser.
 */
@RestController
@RequestMapping("/api/v1/evaluations")
public class EvaluationsController {

  private final EvaluationService service;
  private final AuthContext auth;

  public EvaluationsController(EvaluationService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  /** Staff assignment (UNIQUE student+session, versioned; reassign bumps + invalidates old). */
  @PostMapping("/assignments")
  public ResponseEntity<?> assign(
      @Valid @RequestBody EvaluationDtos.AssignmentRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out =
        service.assign(subject, body.studentId(), body.sessionId(), body.evaluatorId(), requestId);
    return ResponseEntity.status(201).body(out);
  }

  @GetMapping("/{id}")
  public ResponseEntity<?> get(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.getEvaluation(subject, id, requestId));
  }

  /** Legacy typed patch (kept for compat): maps to raw draft patch when version supplied. */
  @PatchMapping("/{id}")
  public ResponseEntity<?> patch(
      @PathVariable String id, @RequestBody Map<String, Object> body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    java.util.List<Object> scores = extractScores(body);
    String notes = body.get("notes") == null ? null : String.valueOf(body.get("notes"));
    Integer version = extractVersion(body);
    if (scores == null && body.get("answers") != null) {
      scores = extractAnswers(body.get("answers"));
    }
    return ResponseEntity.ok(service.patchDraft(subject, id, scores, notes, version, requestId));
  }

  @PostMapping("/{id}/submit")
  public ResponseEntity<?> submit(
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    java.util.List<Object> scores = body == null ? null : extractScores(body);
    if (scores == null && body != null && body.get("answers") != null) {
      scores = extractAnswers(body.get("answers"));
    }
    Integer version = body == null ? null : extractVersion(body);
    return ResponseEntity.ok(service.submit(subject, id, scores, version, requestId, idempotencyKey));
  }

  /** Staff-only reopen (SUBMITTED -&gt; DRAFT) with reason. */
  @PostMapping("/{id}/reopen")
  public ResponseEntity<?> reopen(
      @PathVariable String id,
      @Valid @RequestBody EvaluationDtos.ReopenRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.reopen(subject, id, body.reason(), requestId));
  }

  /** Staff-only correction of a LOCKED (released) sheet: NEW revision, atomic replace. */
  @PostMapping("/{id}/correct")
  public ResponseEntity<?> correct(
      @PathVariable String id,
      @RequestBody Map<String, Object> body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    java.util.List<Object> scores = extractScores(body);
    if (scores == null && body.get("answers") != null) {
      scores = extractAnswers(body.get("answers"));
    }
    String reason =
        body.get("reason") != null
            ? String.valueOf(body.get("reason"))
            : String.valueOf(body.getOrDefault("correctionReason", ""));
    Integer version = extractVersion(body);
    return ResponseEntity.ok(service.correctReleased(subject, id, scores, reason, version, requestId));
  }

  @SuppressWarnings("unchecked")
  private static java.util.List<Object> extractScores(Map<String, Object> body) {
    if (body == null || body.get("scores") == null) {
      return null;
    }
    Object v = body.get("scores");
    if (v instanceof java.util.List<?> l) {
      return (java.util.List<Object>) l;
    }
    return null;
  }

  @SuppressWarnings("unchecked")
  private static java.util.List<Object> extractAnswers(Object answers) {
    if (!(answers instanceof java.util.List<?> l)) {
      return null;
    }
    java.util.List<Object> out = new java.util.ArrayList<>();
    for (Object a : l) {
      if (a instanceof Map<?, ?> m) {
        out.add(m.get("score"));
      } else {
        out.add(a);
      }
    }
    return out;
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
