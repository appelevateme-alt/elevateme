package com.elevateme.programs;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Phase 2 programs lifecycle (spec §9 + §10 + §11).
 *
 * <p>Exact paths: GET /programs, GET /programs/{id}, POST /programs,
 * PATCH /programs/{id}, POST /programs/{id}/submit + /approve + /publish + /complete + /archive,
 * POST /programs/{id}/sessions.
 * Publish/approve are admin-only (DB role). No public admin signup —
 * teacher publish attempts yield 403.
 */
@RestController
@RequestMapping("/api/v1/programs")
public class ProgramsController {

  private final ProgramsService service;
  private final AuthContext auth;

  public ProgramsController(ProgramsService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  @GetMapping
  public ResponseEntity<?> list(
      @RequestParam(value = "page", required = false, defaultValue = "1") int page,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.list(subject, page, requestId));
  }

  @GetMapping("/{id}")
  public ResponseEntity<?> get(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.get(subject, id, requestId));
  }

  @PostMapping
  public ResponseEntity<?> create(
      @Valid @RequestBody ProgramDtos.CreateProgramRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.create(subject, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(program);
  }

  @PatchMapping("/{id}")
  public ResponseEntity<?> patch(
      @PathVariable String id,
      @Valid @RequestBody ProgramDtos.PatchProgramRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.patch(subject, id, body, requestId);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/submit")
  public ResponseEntity<?> submit(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.submit(subject, id, requestId, idempotencyKey);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/approve")
  public ResponseEntity<?> approve(
      @PathVariable String id,
      @Valid @RequestBody ProgramDtos.ApproveRequest body,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.approve(subject, id, body, requestId, idempotencyKey);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/publish")
  public ResponseEntity<?> publish(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.publish(subject, id, requestId, idempotencyKey);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/complete")
  public ResponseEntity<?> complete(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.complete(subject, id, requestId, idempotencyKey);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/archive")
  public ResponseEntity<?> archive(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> program = service.archive(subject, id, requestId, idempotencyKey);
    return ResponseEntity.ok(program);
  }

  @PostMapping("/{id}/sessions")
  public ResponseEntity<?> createSession(
      @PathVariable String id,
      @Valid @RequestBody ProgramDtos.SessionCreateRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> session = service.createSession(subject, id, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(session);
  }
}
