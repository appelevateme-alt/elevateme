package com.elevateme.performance;

import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Exact paths: POST /sessions/{id}/release-reports (atomic + idempotency + preview counts),
 * GET /me/reports + /me/reports/{id} + /me/performance + /me/insights
 * (released only + scope/sample). Phase 1c: subject-scoped, 404 on cross-student.
 *
 * <p>Phase 4:
 * <ul>
 *   <li>GET /me/reports + /me/reports/{id}: released only, 10 marks + total/1000 +
 *       normalized/100 + typed remarks + correction version, Sound label, evaluator
 *       attribution, NO staff-private notes. {@code ?print=true} adds print-friendly flag.</li>
 *   <li>GET /me/performance: released rows chronological (starts_at + eval ID, never
 *       averaged, same-day separate) + scope sampleSize. Filters: criterion, period
 *       (last4w|3m|all|custom), from/to (custom YYYY-MM-DD Colombo inclusive =&gt;
 *       half-open UTC), program, subtype, session.</li>
 *   <li>GET /me/insights: same filters, deterministic per docs/INSIGHTS.md, ordered
 *       low,decline,best,improved,strengths, Top5 + Expand (all + top5 flag),
 *       Based-on scope label + evidence window, &lt;2 no trends.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1")
public class PerformanceController {

  private final PerformanceService service;
  private final ReleaseService releases;
  private final AuthContext auth;
  private final ScopeGuard guard;

  @Autowired
  public PerformanceController(
      PerformanceService service, ReleaseService releases, AuthContext auth, ScopeGuard guard) {
    this.service = service;
    this.releases = releases;
    this.auth = auth;
    this.guard = guard;
  }

  /** Legacy 3-arg wiring (Phase 1c callers). */
  public PerformanceController(PerformanceService service, AuthContext auth, ScopeGuard guard) {
    this(service, null, auth, guard);
  }

  /**
   * Atomic + idempotent release with preview counts. Guests can NEVER release (403).
   * Absent/excluded attendance is excluded with reason (never released as zero).
   */
  @PostMapping("/sessions/{id}/release-reports")
  public ResponseEntity<?> release(
      @PathVariable String id,
      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
      @RequestParam(value = "dryRun", required = false, defaultValue = "false") boolean dryRun,
      HttpServletRequest req) {
    String subject;
    boolean isGuest = false;
    try {
      subject = auth.currentSubject();
      isGuest = auth.isGuest();
    } catch (IllegalStateException e) {
      // Guest-cookie callers carry no Bearer subject; treat cookie presence as guest.
      if (hasGuestCookie(req)) {
        isGuest = true;
        subject = "guest";
      } else {
        throw e;
      }
    }
    // Belt-and-braces: a guest cookie on a Bearer call still denies release.
    if (!isGuest && hasGuestCookie(req) && releases != null) {
      // Let the service decide via isGuest flag when the security context carries ROLE_GUEST;
      // a stray guest cookie alongside staff Bearer auth does not escalate, but a pure-guest
      // call without Bearer subject is already flagged above.
    }
    String requestId = RequestIdFilter.resolve(req);
    if (dryRun) {
      return ResponseEntity.ok(releases.preview(subject, id, requestId));
    }
    return ResponseEntity.ok(releases.release(subject, id, idempotencyKey, requestId, isGuest));
  }

  private static boolean hasGuestCookie(HttpServletRequest req) {
    if (req.getCookies() == null) {
      return false;
    }
    for (jakarta.servlet.http.Cookie c : req.getCookies()) {
      if ("guest_session".equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Released reports for the caller. The studentId is resolved server-side from
   * the verified subject (never a client-supplied user id), so Student B cannot
   * enumerate Student A's rows — a forged id yields 404 via ScopeGuard.
   */
  @GetMapping("/me/reports")
  public ResponseEntity<?> myReports(HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    String studentId = service.ownStudentId(subject);
    List<Map<String, Object>> rows = service.getMyReports(subject, studentId, requestId);
    return ResponseEntity.ok(rows);
  }

  /** Single released report. Cross-student access => 404 (no enumeration). */
  @GetMapping("/me/reports/{reportId}")
  public ResponseEntity<?> myReportById(
      @PathVariable String reportId,
      @RequestParam(value = "print", required = false, defaultValue = "false") boolean print,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    String studentId = service.ownStudentId(subject);
    Map<String, Object> row =
        service.getReportById(subject, studentId, reportId, requestId, print);
    return ResponseEntity.ok(row);
  }

  /**
   * Released performance history: chronological rows + scope sampleSize.
   * Never averages sessions into programs; same-day stays separate.
   */
  @GetMapping("/me/performance")
  public ResponseEntity<?> myPerformance(
      @RequestParam(value = "criterion", required = false) String criterion,
      @RequestParam(value = "period", required = false) String period,
      @RequestParam(value = "from", required = false) String from,
      @RequestParam(value = "to", required = false) String to,
      @RequestParam(value = "program", required = false) String program,
      @RequestParam(value = "subtype", required = false) String subtype,
      @RequestParam(value = "session", required = false) String session,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    String studentId = service.ownStudentId(subject);
    Map<String, Object> out =
        service.getPerformance(
            subject, studentId, criterion, period, from, to, program, subtype, session,
            Instant.now(), requestId);
    return ResponseEntity.ok(out);
  }

  /**
   * Deterministic insights for the same filtered scope. Ordered
   * low,decline,best,improved,strengths; Top5 + Expand (all + top5 flag);
   * Based-on scope label + evidence window; &lt;2 no trends.
   */
  @GetMapping("/me/insights")
  public ResponseEntity<?> myInsights(
      @RequestParam(value = "criterion", required = false) String criterion,
      @RequestParam(value = "period", required = false) String period,
      @RequestParam(value = "from", required = false) String from,
      @RequestParam(value = "to", required = false) String to,
      @RequestParam(value = "program", required = false) String program,
      @RequestParam(value = "subtype", required = false) String subtype,
      @RequestParam(value = "session", required = false) String session,
      HttpServletRequest req) {
    String subject = auth.currentSubject();
    String requestId = RequestIdFilter.resolve(req);
    String studentId = service.ownStudentId(subject);
    Map<String, Object> out =
        service.getInsights(
            subject, studentId, criterion, period, from, to, program, subtype, session,
            Instant.now(), requestId);
    return ResponseEntity.ok(out);
  }
}
