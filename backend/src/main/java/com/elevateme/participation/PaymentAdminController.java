package com.elevateme.participation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import com.elevateme.opportunities.DevelopmentDtos;
import com.elevateme.opportunities.DevelopmentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Phase 5 payment verification (spec §10 + §11).
 *
 * <p>Exact paths: GET /admin/payments (PENDING queue: student, event, reference,
 * pending age), POST /admin/payments/{id}/verify (VERIFIED confirms + records
 * admin+time; REJECTED needs a reason; EXPIRED rows stay open for late manual
 * review — never a silent refund), POST /admin/payments/expire (sweep: PENDING
 * past expiry -&gt; EXPIRED, freeing the hold + notifying).
 *
 * <p>Phase 1c: admin role from DB (403 else, enforced in the service). Only the
 * external reference is stored; card data is never accepted.
 */
@RestController
@RequestMapping("/api/v1/admin/payments")
public class PaymentAdminController {

  private final DevelopmentService development;
  private final AuthContext auth;

  public PaymentAdminController(DevelopmentService development, AuthContext auth) {
    this.development = development;
    this.auth = auth;
  }

  /** Admin queue (default PENDING): student, event, reference, pending age. */
  @GetMapping
  public ResponseEntity<?> list(
      @RequestParam(value = "state", required = false) String state, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    List<Map<String, Object>> rows = development.listPayments(subject, state, requestId);
    return ResponseEntity.ok(rows);
  }

  /**
   * VERIFIED confirms the registration (records admin + time); REJECTED needs a
   * reason. Late EXPIRED stays open for manual review here. The 48h hold is
   * swept first so expiry frees before the decision.
   */
  @PostMapping("/{id}/verify")
  public ResponseEntity<?> verify(
      @PathVariable String id,
      @Valid @RequestBody DevelopmentDtos.VerifyPaymentRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(development.verifyPayment(subject, id, body, requestId));
  }

  /** Expiry sweep: PENDING past expiry -&gt; EXPIRED (frees the hold + notifies). */
  @PostMapping("/expire")
  public ResponseEntity<?> expire(HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(development.expireHolds(subject, requestId));
  }
}
