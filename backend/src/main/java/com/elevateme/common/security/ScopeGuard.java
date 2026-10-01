package com.elevateme.common.security;

import com.elevateme.audit.AuditService;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Phase 1c scoping guard (Student A vs B isolation proof + staff approval gate).
 *
 * <p>Pattern: every repository/service method takes {@code authenticatedSubject}
 * (verified Supabase JWT sub, never client-supplied) + {@code studentId} and checks,
 * in order:
 *
 * <ol>
 *   <li>(a) caller owns {@code studentId} (caller profile id == studentId), OR
 *   <li>(b) caller is_admin via {@code app.profiles} lookup
 *       ({@code role='admin' AND status='Approved'}), OR
 *   <li>(c) teacher owns program / is assigned (program {@code owner_id} or
 *       {@code evaluation_assignments} linkage).
 * </ol>
 *
 * <p>Violation: cross-student reads throw {@link ResourceNotFoundException} (404 to
 * avoid enumeration, spec §11); other denials throw {@link AccessDeniedException}
 * (403). Pending staff ({@code status='PendingReview'}) throw
 * {@link AccountPendingException} (403 code ACCOUNT_PENDING). Every denial emits
 * an {@link AuditService} record with (actor, action, entity, requestId) and no
 * PII message text.
 */
@Component
public class ScopeGuard {

  private final JdbcTemplate jdbc;
  private final AuditService audit;

  public ScopeGuard(JdbcTemplate jdbc, AuditService audit) {
    this.jdbc = jdbc;
    this.audit = audit;
  }

  /** Minimal caller projection from app.profiles. */
  public record CallerProfile(String id, String role, String status) {
    public boolean isAdmin() {
      return "admin".equalsIgnoreCase(role) && "Approved".equals(status);
    }

    public boolean isPendingReview() {
      return "PendingReview".equals(status);
    }

    public boolean isStaffLike() {
      String r = role == null ? "" : role.toLowerCase();
      return r.equals("coordinator") || r.equals("evaluator") || r.equals("staff")
          || r.equals("admin");
    }
  }

  /** Load caller by verified subject (supabase_subject) or fallback to profile id. */
  public CallerProfile loadCaller(String authenticatedSubject) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, role, status FROM app.profiles "
                  + "WHERE supabase_subject::text = ? OR id::text = ? LIMIT 1",
              authenticatedSubject, authenticatedSubject);
      if (rows.isEmpty()) {
        return null;
      }
      Map<String, Object> r = rows.get(0);
      return new CallerProfile(
          String.valueOf(r.get("id")),
          String.valueOf(r.get("role")),
          String.valueOf(r.get("status")));
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Pure decision helper (no DB) — unit-testable. {@code teacherLinked} means the
   * caller owns the student's program or has an evaluation assignment for them.
   */
  public static boolean canReadStudent(
      CallerProfile caller, String targetStudentId, boolean teacherLinked) {
    if (caller == null || targetStudentId == null) {
      return false;
    }
    if (targetStudentId.equals(caller.id())) {
      return true;
    }
    if (caller.isAdmin()) {
      return true;
    }
    if (teacherLinked && "Approved".equals(caller.status())
        && (caller.isStaffLike())) {
      return true;
    }
    return false;
  }

  /** Check whether caller is linked to the student via program ownership/assignment. */
  public boolean isTeacherLinked(String callerProfileId, String targetStudentId) {
    if (callerProfileId == null || targetStudentId == null) {
      return false;
    }
    try {
      Integer owned =
          jdbc.queryForObject(
              "SELECT 1 FROM app.programs p JOIN app.registrations r ON r.program_id = p.id "
                  + "WHERE p.owner_id::text = ? AND r.student_id::text = ? "
                  + "AND r.archived_at IS NULL LIMIT 1",
              Integer.class, callerProfileId, targetStudentId);
      if (owned != null) {
        return true;
      }
    } catch (EmptyResultDataAccessException e) {
      // fall through to assignment check
    } catch (Exception e) {
      // fall through
    }
    try {
      Integer assigned =
          jdbc.queryForObject(
              "SELECT 1 FROM app.evaluation_assignments ea "
                  + "JOIN app.sessions s ON s.id = ea.session_id "
                  + "JOIN app.programs p ON p.id = s.program_id "
                  + "WHERE ea.student_id::text = ? "
                  + "AND (p.owner_id::text = ? OR ea.assigned_by::text = ?) LIMIT 1",
              Integer.class, targetStudentId, callerProfileId, callerProfileId);
      return assigned != null;
    } catch (EmptyResultDataAccessException e) {
      return false;
    } catch (Exception e) {
      return false;
    }
  }

  /**
   * Enforce cross-student read isolation. Throws {@link ResourceNotFoundException}
   * (404) on out-of-scope to avoid enumeration; {@link AccountPendingException} for
   * pending staff; {@link AccessDeniedException} when caller is unknown.
   */
  public void checkStudentRead(String authenticatedSubject, String studentId, String requestId) {
    CallerProfile caller = loadCaller(authenticatedSubject);
    if (caller == null) {
      audit.record(authenticatedSubject, "ACCESS_DENIED", "student_read", studentId, requestId);
      throw new AccessDeniedException("Not permitted");
    }
    if (caller.isPendingReview() && caller.isStaffLike()) {
      audit.record(caller.id(), "ACCESS_DENIED_PENDING", "student_read", studentId, requestId);
      throw new AccountPendingException("Account pending review");
    }
    if (studentId.equals(caller.id()) || caller.isAdmin()) {
      return;
    }
    boolean linked = isTeacherLinked(caller.id(), studentId);
    if (canReadStudent(caller, studentId, linked)) {
      return;
    }
    // No PII in audit: entity ids only, no message text.
    audit.record(caller.id(), "ACCESS_DENIED", "student_read", studentId, requestId);
    throw new ResourceNotFoundException("Not found");
  }

  /** Require caller to be an approved admin (DB role, never client claim). */
  public void requireAdmin(String authenticatedSubject, String requestId) {
    CallerProfile caller = loadCaller(authenticatedSubject);
    if (caller != null && caller.isAdmin()) {
      return;
    }
    String actor = caller != null ? caller.id() : authenticatedSubject;
    audit.record(actor, "ACCESS_DENIED", "admin_action", null, requestId);
    throw new AccessDeniedException("Admin only");
  }

  /**
   * Staff gate for staff paths and session rosters. PendingReview yields 403
   * ACCOUNT_PENDING (no roster data leaked - callers must not fetch after this).
   */
  public void requireStaffActive(String authenticatedSubject, String requestId) {
    CallerProfile caller = loadCaller(authenticatedSubject);
    if (caller == null) {
      audit.record(authenticatedSubject, "ACCESS_DENIED", "staff_action", null, requestId);
      throw new AccessDeniedException("Not permitted");
    }
    if (caller.isPendingReview()) {
      audit.record(caller.id(), "ACCESS_DENIED_PENDING", "staff_action", null, requestId);
      throw new AccountPendingException("Account pending review");
    }
    if (caller.isAdmin()) {
      return;
    }
    if (caller.isStaffLike() && "Approved".equals(caller.status())) {
      return;
    }
    audit.record(caller.id(), "ACCESS_DENIED", "staff_action", null, requestId);
    throw new AccessDeniedException("Staff only");
  }

  /**
   * Program-owner check for a session (owner of the session's program).
   * Used by evaluator enforcement: admin / program owner bypass the assigned-evaluator match.
   */
  public boolean isProgramOwner(String callerProfileId, String sessionId) {
    if (callerProfileId == null || sessionId == null) {
      return false;
    }
    try {
      Integer ok =
          jdbc.queryForObject(
              "SELECT 1 FROM app.sessions s JOIN app.programs p ON p.id = s.program_id "
                  + "WHERE s.id::text = ? AND p.owner_id::text = ? LIMIT 1",
              Integer.class, sessionId, callerProfileId);
      return ok != null;
    } catch (EmptyResultDataAccessException e) {
      return false;
    } catch (Exception e) {
      return false;
    }
  }

  /**
   * Roster gate: pending => ACCOUNT_PENDING; otherwise caller must be admin, program
   * owner, or assigned evaluator for the session. Unknown session => 404.
   */
  public void checkRosterAccess(
      String authenticatedSubject, String sessionId, String requestId) {
    CallerProfile caller = loadCaller(authenticatedSubject);
    if (caller == null) {
      audit.record(authenticatedSubject, "ACCESS_DENIED", "roster_read", sessionId, requestId);
      throw new AccessDeniedException("Not permitted");
    }
    if (caller.isPendingReview()) {
      audit.record(caller.id(), "ACCESS_DENIED_PENDING", "roster_read", sessionId, requestId);
      throw new AccountPendingException("Account pending review");
    }
    if (caller.isAdmin()) {
      return;
    }
    try {
      Integer ok =
          jdbc.queryForObject(
              "SELECT 1 FROM app.sessions s JOIN app.programs p ON p.id = s.program_id "
                  + "LEFT JOIN app.evaluation_assignments ea ON ea.session_id = s.id "
                  + "WHERE s.id::text = ? AND (p.owner_id::text = ? OR ea.assigned_by::text = ?) "
                  + "LIMIT 1",
              Integer.class, sessionId, caller.id(), caller.id());
      if (ok != null) {
        return;
      }
    } catch (Exception e) {
      // fall through to denial paths
    }
    // Distinguish unknown session (404) from forbidden (403) without leaking roster.
    boolean sessionExists = false;
    try {
      Integer exists =
          jdbc.queryForObject(
              "SELECT 1 FROM app.sessions WHERE id::text = ? LIMIT 1",
              Integer.class, sessionId);
      sessionExists = exists != null;
    } catch (Exception e) {
      sessionExists = false;
    }
    audit.record(caller.id(), "ACCESS_DENIED", "roster_read", sessionId, requestId);
    if (!sessionExists) {
      throw new ResourceNotFoundException("Not found");
    }
    throw new AccessDeniedException("Not permitted");
  }
}
