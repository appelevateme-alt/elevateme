package com.elevateme.queries;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact paths: GET /queries, POST /queries, GET /queries/{id},
 * POST /queries/{id}/comments, POST /queries/{id}/reply (+ versioned edit
 * PUT /queries/{id}/reply/{messageId}), POST /queries/{id}/close + /reopen,
 * POST /admin/queries (DI-initiated, starts AWAITING_STUDENT_RESPONSE).
 *
 * <p>Request/reply model only — no chat bubbles, typing indicators, presence,
 * or reactions. Bodies render as sanitized plain text.
 */
@RestController
public class QueriesController {

  private final QueriesService service;
  private final AuthContext auth;

  public QueriesController(QueriesService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  /** Own threads: search (q) + status filter, 10/page, stable updated_at sort. */
  @GetMapping("/api/v1/queries")
  public ResponseEntity<?> list(
      @RequestParam(value = "q", required = false) String q,
      @RequestParam(value = "status", required = false) String status,
      @RequestParam(value = "page", required = false, defaultValue = "1") int page,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.listOwn(subject, q, status, page, requestId));
  }

  /**
   * Create a query (IN_REVIEW). Input is validated before any write (preserved
   * on error); dupes prevented via Idempotency-Key (same key + differing
   * payload -&gt; 409).
   */
  @PostMapping("/api/v1/queries")
  public ResponseEntity<?> create(
      @Valid @RequestBody QueryDtos.CreateQueryRequest body,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> thread = service.create(subject, body, idempotencyKey, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(thread);
  }

  /** Single thread + chronological messages (closed threads stay readable). */
  @GetMapping("/api/v1/queries/{id}")
  public ResponseEntity<?> get(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.getThread(subject, id, requestId));
  }

  /** Timestamped follow-up (both sides, full-width). */
  @PostMapping("/api/v1/queries/{id}/comments")
  public ResponseEntity<?> comment(
      @PathVariable String id,
      @Valid @RequestBody QueryDtos.CommentRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> message = service.comment(subject, id, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(message);
  }

  /** Admin official reply (first reply: IN_REVIEW -&gt; ANSWERED). */
  @PostMapping("/api/v1/queries/{id}/reply")
  public ResponseEntity<?> reply(
      @PathVariable String id,
      @Valid @RequestBody QueryDtos.ReplyRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> reply = service.reply(subject, id, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(reply);
  }

  /**
   * Versioned edit of an official reply: inserts a new version row (history
   * visible to staff), never a silent rewrite.
   */
  @PutMapping("/api/v1/queries/{id}/reply/{messageId}")
  public ResponseEntity<?> editReply(
      @PathVariable String id,
      @PathVariable String messageId,
      @Valid @RequestBody QueryDtos.EditReplyRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.editReply(subject, id, messageId, body, requestId));
  }

  /** Admin close (ANSWERED|IN_REVIEW -&gt; CLOSED). */
  @PostMapping("/api/v1/queries/{id}/close")
  public ResponseEntity<?> close(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.close(subject, id, requestId));
  }

  /**
   * Admin reopen (CLOSED -&gt; IN_REVIEW); student call is a reopen REQUEST
   * (state unchanged, DI notified).
   */
  @PostMapping("/api/v1/queries/{id}/reopen")
  public ResponseEntity<?> reopen(@PathVariable String id, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.reopen(subject, id, requestId));
  }

  /** DI-initiated thread (admin): starts in AWAITING_STUDENT_RESPONSE. */
  @PostMapping("/api/v1/admin/queries")
  public ResponseEntity<?> createDiInitiated(
      @Valid @RequestBody QueryDtos.CreateDiQueryRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> thread = service.createDiInitiated(subject, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(thread);
  }
}
