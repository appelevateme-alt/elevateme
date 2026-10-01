package com.elevateme.recommendations;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact paths: POST /admin/audiences/preview, POST /admin/recommendations,
 * GET /me/recommendations, PATCH /me/recommendations/{recipientId} (own only).
 * Phase 1c: /admin/* require the admin role from DB (403 else) — enforced in
 * the service. Teachers cannot publish recommendations. No public admin signup.
 */
@RestController
@RequestMapping("/api/v1")
public class RecommendationsController {

  private final RecommendationsService service;
  private final AuthContext auth;

  public RecommendationsController(RecommendationsService service, AuthContext auth) {
    this.service = service;
    this.auth = auth;
  }

  /** Preview the audience (counts + IDs) without persisting anything. */
  @PostMapping("/admin/audiences/preview")
  public ResponseEntity<?> previewAudience(
      @Valid @RequestBody RecommendationDtos.AudiencePreviewRequest body, HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.previewAudience(subject, body, requestId));
  }

  /** Publish recommendations: freezes the audience snapshot at publish time. */
  @PostMapping("/admin/recommendations")
  public ResponseEntity<?> create(
      @Valid @RequestBody RecommendationDtos.CreateRecommendationsRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    Map<String, Object> out = service.create(subject, body, requestId);
    return ResponseEntity.status(HttpStatus.CREATED).body(out);
  }

  /** Own recommendation inbox (student) or linked-child inbox (parent view). */
  @GetMapping("/me/recommendations")
  public ResponseEntity<?> listMine(HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    List<Map<String, Object>> rows = service.listMine(subject, requestId);
    return ResponseEntity.ok(rows);
  }

  /** Own completion/undo (and pin/note) on the caller's own recipient row only. */
  @PatchMapping("/me/recommendations/{recipientId}")
  public ResponseEntity<?> patchMine(
      @PathVariable String recipientId,
      @Valid @RequestBody RecommendationDtos.PatchRecommendationRequest body,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.ok(service.patchMine(subject, recipientId, body, requestId));
  }
}
