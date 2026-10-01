package com.elevateme.opportunities;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact paths: POST /admin/development, POST /admin/development/{id}/assign,
 * DELETE /admin/development/{id}/assignees/{studentId} (removal).
 * Phase 1c: admin role from DB (403 else) — enforced in the service.
 * No public admin signup.
 */
@RestController
@RequestMapping("/api/v1/admin/development")
public class DevelopmentController {

  private final DevelopmentService service;
  private final AuthContext auth;

  public DevelopmentController(DevelopmentService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  /** Admin creates a development opportunity (FREE|PAID, external pay link). */
  @PostMapping
  public ResponseEntity<?> create(
      @Valid @RequestBody DevelopmentDtos.CreateDevelopmentRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out = service.create(subject, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(out);
  }

  /** Targeted assign (overlapping batches dedupe). */
  @PostMapping("/{id}/assign")
  public ResponseEntity<?> assign(
      @PathVariable String id,
      @Valid @RequestBody DevelopmentDtos.AssignRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.assign(subject, id, body, requestId));
  }

  /**
   * Removal: blocks new registration but NEVER silently cancels a confirmed
   * registration (cancellation is the separate audited + notified withdraw
   * flow).
   */
  @DeleteMapping("/{id}/assignees/{studentId}")
  public ResponseEntity<?> removeAssignee(
      @PathVariable String id, @PathVariable String studentId, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.removeAssignee(subject, id, studentId, requestId));
  }
}
