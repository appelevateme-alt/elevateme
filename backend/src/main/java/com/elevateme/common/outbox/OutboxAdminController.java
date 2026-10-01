package com.elevateme.common.outbox;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Admin outbox triage (Phase 6 release quality).
 *
 * <p>Exact path: {@code GET /admin/outbox?state=FAILED} (default FAILED).
 * Admin-only via DB role (403 else, enforced by {@link ScopeGuard#requireAdmin}).
 * Surfaces poison-pill FAILED rows (plus PENDING/SENT/SKIPPED for ops) with the
 * V9 {@code provider_message_id} receipt for provider reconciliation.
 *
 * <p>Payloads are ids-only (no PII message text) per {@link OutboxService}.
 */
@RestController
@RequestMapping("/api/v1/admin/outbox")
public class OutboxAdminController {

  private final OutboxRepository repo;
  private final ScopeGuard guard;
  private final AuthContext auth;

  public OutboxAdminController(OutboxRepository repo, ScopeGuard guard, AuthContext auth) {
    this.repo = repo;
    this.guard = guard;
    this.auth = auth;
  }

  /**
   * List outbox rows by state. Default {@code FAILED} (poison-pill triage);
   * accepts PENDING|SENT|FAILED|SKIPPED (422 on unknown).
   */
  @GetMapping
  public ResponseEntity<?> list(
      @RequestParam(value = "state", required = false, defaultValue = "FAILED") String state,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    guard.requireAdmin(subject, requestId);
    List<Map<String, Object>> rows = repo.listByState(state, 100);
    return ResponseEntity.ok(rows);
  }
}
