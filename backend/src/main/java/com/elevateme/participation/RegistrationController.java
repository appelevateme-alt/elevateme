package com.elevateme.participation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import com.elevateme.opportunities.DevelopmentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Phase 2 registration endpoints (spec §10 + §11) + Phase 5 payment claims.
 *
 * <p>Exact paths: POST /programs/{id}/registrations, POST /registrations/{id}/withdraw,
 * POST /registrations/{id}/payment-reference ("I have paid" submits the reference
 * for review — it does NOT confirm; confirmation is the admin verify decision).
 */
@RestController
@RequestMapping("/api/v1")
public class RegistrationController {

  private final ParticipationService service;
  private final DevelopmentService development;
  private final AuthContext auth;

  public RegistrationController(
      ParticipationService service, DevelopmentService development, AuthContext auth) {
    this.service = service;
    this.development = development;
    this.auth = auth;
  }

  /**
   * Student-only (own studentId from subject). Capacity via SELECT FOR UPDATE,
   * eligibility, deadline, dedupe → 409 DUPLICATE/CAPACITY. Idempotent per
   * (actor, operation, Idempotency-Key); differing payload → 409.
   * Confirmed attendance is recorded by staff separately — never inferred here.
   */
  @PostMapping("/programs/{id}/registrations")
  public ResponseEntity<?> register(
      @PathVariable String id,
      @Valid @RequestBody(required = false) ParticipationDtos.RegisterRequest body,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> registration = service.register(subject, id, body, requestId, idempotencyKey);
    return ResponseEntity.status(HttpStatus.CREATED).body(registration);
  }

  /** Owner-only withdraw before deadline. Idempotent per (actor, operation, key). */
  @PostMapping("/registrations/{id}/withdraw")
  public ResponseEntity<?> withdraw(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> registration = service.withdraw(subject, id, requestId, idempotencyKey);
    return ResponseEntity.ok(registration);
  }

  /**
   * "I have paid": attaches the external reference for review. Does NOT confirm —
   * the registration stays Pending and verification stays PENDING until the admin
   * verify decision. Starts/continues the 48h hold clock (hold expiry is managed
   * in {@link DevelopmentService}).
   */
  @PostMapping("/registrations/{id}/payment-reference")
  public ResponseEntity<?> paymentReference(
      @PathVariable String id,
      @Valid @RequestBody ParticipationDtos.PaymentReferenceRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out =
        development.submitPaymentReference(subject, id, body.reference(), requestId);
    return ResponseEntity.ok(out);
  }
}
