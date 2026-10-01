package com.elevateme.notifications;

import com.elevateme.common.api.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Exact paths: GET /notifications, PATCH /notifications/{id}/read (own only). */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationsController {

  private final NotificationsService service;

  public NotificationsController(NotificationsService service) {
    this.service = service;
  }

  /** Own inbox, newest first (subject-scoped; ?limit capped at 100). */
  @GetMapping
  public ResponseEntity<?> list(
      @RequestParam(value = "limit", required = false, defaultValue = "50") int limit,
      HttpServletRequest req) {
    String subject = service.currentSubject();
    RequestIdFilter.resolve(req);
    int capped = Math.max(1, Math.min(limit, 100));
    List<Map<String, Object>> rows = service.listOwn(subject, capped);
    return ResponseEntity.ok(rows);
  }

  /** Mark own notification read (cross-user => 404; idempotent re-read). */
  @PatchMapping("/{id}/read")
  public ResponseEntity<?> markRead(@PathVariable String id, HttpServletRequest req) {
    String subject = service.currentSubject();
    RequestIdFilter.resolve(req);
    Map<String, Object> row = service.markRead(subject, id);
    return ResponseEntity.ok(row);
  }
}
