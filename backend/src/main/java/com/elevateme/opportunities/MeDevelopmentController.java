package com.elevateme.opportunities;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Student development surface (spec §10 + §11).
 *
 * <p>Exact paths: GET /me/development (assigned only — reason, date,
 * price/free, eligibility, availability), GET /me/development/{id} (404 unless
 * assigned), POST /me/development/{id}/register (FREE confirms subject to
 * capacity; PAID returns AWAITING_PAYMENT_VERIFICATION with the external link,
 * flagged external, plus the hold expiry displayed upfront).
 */
@RestController
@RequestMapping("/api/v1/me/development")
public class MeDevelopmentController {

  private final DevelopmentService service;
  private final AuthContext auth;

  public MeDevelopmentController(DevelopmentService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  /** Assigned opportunities only (targeted invisibility for the rest). */
  @GetMapping
  public ResponseEntity<?> listMine(HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    List<Map<String, Object>> rows = service.listMine(subject, requestId);
    return ResponseEntity.ok(rows);
  }

  /** Direct fetch: 404 unless assigned (or admin). */
  @GetMapping("/{id}")
  public ResponseEntity<?> get(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.getMine(subject, id, requestId));
  }

  /** Register: FREE confirms; PAID awaits payment verification. */
  @PostMapping("/{id}/register")
  public ResponseEntity<?> register(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out = service.register(subject, id, requestId, idempotencyKey);
    return ResponseEntity.status(HttpStatus.CREATED).body(out);
  }
}
