package com.elevateme.evaluation;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Comment bank (no AI): GET shared + own private snippets, POST new snippet.
 *
 * <p>Exact paths: GET /comment-bank, POST /comment-bank.
 */
@RestController
@RequestMapping("/api/v1/comment-bank")
public class CommentBankController {

  private final CommentBankService service;
  private final AuthContext auth;

  public CommentBankController(CommentBankService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  @GetMapping
  public ResponseEntity<?> list(
      @RequestParam(value = "criterionKey", required = false) String criterionKey,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    List<Map<String, Object>> rows = service.list(subject, criterionKey, requestId);
    return ResponseEntity.ok(rows);
  }

  @PostMapping
  public ResponseEntity<?> create(
      @Valid @RequestBody EvaluationDtos.CommentBankCreateRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> row =
        service.create(subject, body.scope(), body.criterionKey(), body.text(), requestId);
    return ResponseEntity.status(201).body(row);
  }
}
