package com.elevateme.participation;

import com.elevateme.common.security.ScopeGuard;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 2 JDBC: registrations + attendance + roster. Reads enforce the Phase 1c
 * scoping pattern (authenticatedSubject + ids); roster/attendance writes require
 * staff-active + session ownership/assignment via {@link ScopeGuard}.
 */
@Repository
public class ParticipationRepository {
  private final JdbcTemplate jdbc;
  private final ScopeGuard guard;

  public ParticipationRepository(JdbcTemplate jdbc, ScopeGuard guard) {
    this.jdbc = jdbc;
    this.guard = guard;
  }

  /**
   * Organizer-scoped roster for a session (legacy minimal projection; kept for
   * Phase 1c callers). Detailed roster lives in {@link #findRosterDetailed}.
   *
   * @param authenticatedSubject verified JWT sub
   * @param sessionId target session id
   * @param requestId tracing id (audit on denial, no PII)
   */
  public List<Map<String, Object>> findRosterForSession(
      String authenticatedSubject, String sessionId, String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    return jdbc.queryForList(
        "SELECT r.student_id::text AS studentId, r.status AS status "
            + "FROM app.registrations r WHERE r.session_id::text = ? "
            + "AND r.archived_at IS NULL ORDER BY r.created_at",
        sessionId);
  }

  /**
   * Student-scoped registration lookup (self / admin / teacher-linked).
   */
  public List<Map<String, Object>> findRegistrationsForStudent(
      String authenticatedSubject, String studentId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    return jdbc.queryForList(
        "SELECT r.id::text AS id, r.program_id::text AS programId, r.status AS status "
            + "FROM app.registrations r WHERE r.student_id::text = ? "
            + "AND r.archived_at IS NULL ORDER BY r.created_at DESC",
        studentId);
  }

  // ------------------------------------------------------------------
  // Registration writes
  // ------------------------------------------------------------------

  public Map<String, Object> lockProgramRow(String programId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, lifecycle, capacity, registered_count AS registeredCount"
                + " FROM app.programs WHERE id::text = ? FOR UPDATE LIMIT 1",
            programId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** Program meta for eligibility/deadline checks (tiered V7 → V6 → V2). */
  public Map<String, Object> findProgramMeta(String programId) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, lifecycle, capacity,"
                  + " registration_deadline AS registrationDeadline,"
                  + " eligibility, institute_id::text AS instituteId"
                  + " FROM app.programs WHERE id::text = ? LIMIT 1",
              programId);
      if (rows.isEmpty()) {
        throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
      }
      return rows.get(0);
    } catch (org.springframework.jdbc.BadSqlGrammarException e1) {
      try {
        List<Map<String, Object>> rows =
            jdbc.queryForList(
                "SELECT id::text AS id, lifecycle, capacity,"
                    + " registration_deadline AS registrationDeadline,"
                    + " institute_id::text AS instituteId"
                    + " FROM app.programs WHERE id::text = ? LIMIT 1",
                programId);
        if (rows.isEmpty()) {
          throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
        }
        return rows.get(0);
      } catch (org.springframework.jdbc.BadSqlGrammarException e2) {
        List<Map<String, Object>> rows =
            jdbc.queryForList(
                "SELECT id::text AS id, lifecycle, capacity FROM app.programs"
                    + " WHERE id::text = ? LIMIT 1",
                programId);
        if (rows.isEmpty()) {
          throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
        }
        return rows.get(0);
      }
    }
  }

  public int countConfirmed(String programId) {
    try {
      // Case-insensitive: handles legacy TitleCase ('Confirmed') + canonical UPPER ('CONFIRMED').
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.registrations WHERE program_id::text = ?"
              + " AND UPPER(status) = 'CONFIRMED' AND archived_at IS NULL",
          Integer.class, programId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Dedupe pre-check honoring the two partial unique indexes (program vs session level). */
  public boolean existsRegistration(String studentId, String programId, String sessionId) {
    try {
      Integer n;
      if (sessionId == null) {
        n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.registrations WHERE student_id::text = ?"
                + " AND program_id::text = ? AND session_id IS NULL AND archived_at IS NULL",
            Integer.class, studentId, programId);
      } else {
        n = jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.registrations WHERE student_id::text = ?"
                + " AND program_id::text = ? AND session_id::text = ? AND archived_at IS NULL",
            Integer.class, studentId, programId, sessionId);
      }
      return n != null && n > 0;
    } catch (Exception e) {
      return false;
    }
  }

  public String insertRegistration(
      String studentId, String programId, String sessionId, String allocation) {
    String id = java.util.UUID.randomUUID().toString();
    // Canonical Phase 2 status is UPPER ('CONFIRMED'); legacy TitleCase rows still
    // read via UPPER() comparisons (see countConfirmed/markWithdrawn).
    jdbc.update(
        "INSERT INTO app.registrations (id, student_id, program_id, session_id, allocation, status)"
            + " VALUES (?::uuid, ?::uuid, ?::uuid, "
            + (sessionId == null ? "NULL" : "?::uuid") + ", ?, 'CONFIRMED')",
        sessionId == null
            ? new Object[] {id, studentId, programId, allocation}
            : new Object[] {id, studentId, programId, sessionId, allocation});
    return id;
  }

  public Map<String, Object> findRegistrationById(String registrationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT r.id::text AS id, r.student_id::text AS studentId,"
                + " r.program_id::text AS programId, r.session_id::text AS sessionId,"
                + " r.status AS status FROM app.registrations r"
                + " WHERE r.id::text = ? AND r.archived_at IS NULL LIMIT 1",
            registrationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /**
   * Withdraw: PENDING/CONFIRMED/WAITLISTED (either case) → WITHDRAWN (canonical UPPER).
   * Case-insensitive guard so uppercase CONFIRMED seed rows withdraw correctly;
   * new rows are written canonical UPPER (see V6 registrations_status_phase2_check).
   */
  public int markWithdrawn(String registrationId) {
    return jdbc.update(
        "UPDATE app.registrations SET status = 'WITHDRAWN', updated_at = now()"
            + " WHERE id::text = ? AND archived_at IS NULL"
            + " AND UPPER(status) IN ('PENDING', 'CONFIRMED', 'WAITLISTED')",
        registrationId);
  }

  public Map<String, Object> findCallerProfile(String subject) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, role, status, institute_id::text AS instituteId"
                  + " FROM app.profiles WHERE supabase_subject::text = ? OR id::text = ? LIMIT 1",
              subject, subject);
      if (rows.isEmpty()) {
        return null;
      }
      return rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Attendance
  // ------------------------------------------------------------------

  public int upsertAttendance(
      String sessionId, String studentId, String status, String actorId, String reason) {
    return jdbc.update(
        "INSERT INTO app.session_attendance (session_id, student_id, status, actor_id, reason)"
            + " VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?)"
            + " ON CONFLICT (student_id, session_id) DO UPDATE SET"
            + " status = EXCLUDED.status, actor_id = EXCLUDED.actor_id,"
            + " reason = EXCLUDED.reason, marked_at = now(), updated_at = now()",
        sessionId, studentId, status, actorId, reason);
  }

  // ------------------------------------------------------------------
  // Roster (detailed, server-side search/filter/pagination)
  // ------------------------------------------------------------------

  /**
   * Detailed roster with stable sort (full_name, student id), 10/page.
   * Includes photo_key (service signs to 300s URL), elevateMeId, allocation,
   * attendance, assignedEvaluator, evalStatus.
   */
  public List<Map<String, Object>> findRosterDetailed(
      String sessionId, String q, String committee, String statusFilter, int limit, int offset) {
    StringBuilder sql = new StringBuilder(
        "SELECT r.student_id::text AS studentId, p.full_name AS displayName,"
            + " p.elevate_me_id AS elevateMeId, r.allocation AS allocation,"
            + " r.status AS registrationStatus,"
            + " a.status AS attendance,"
            + " COALESCE(e.evaluator_id::text, ea.assigned_by::text) AS assignedEvaluator,"
            + " e.id::text AS evaluationId,"
            + " CASE WHEN e.id IS NULL THEN 'NOT_STARTED'"
            + "      WHEN e.state = 'DRAFT' THEN 'DRAFT'"
            + "      WHEN e.state = 'SUBMITTED' THEN 'SUBMITTED'"
            + "      WHEN e.state = 'LOCKED' THEN 'RELEASED' ELSE 'NOT_STARTED' END AS evalStatus,"
            + " s.committee AS committee"
            + " FROM app.registrations r"
            + " JOIN app.sessions s ON s.id::uuid = COALESCE(r.session_id, s.id)"
            + " JOIN app.profiles p ON p.id = r.student_id"
            + " LEFT JOIN app.session_attendance a"
            + "   ON a.session_id = s.id AND a.student_id = r.student_id"
            + " LEFT JOIN app.evaluations e"
            + "   ON e.session_id = s.id AND e.student_id = r.student_id AND e.archived_at IS NULL"
            + " LEFT JOIN app.evaluation_assignments ea"
            + "   ON ea.session_id = s.id AND ea.student_id = r.student_id AND ea.archived_at IS NULL"
            + " WHERE (r.session_id::text = ? OR"
            + "   (r.session_id IS NULL AND r.program_id = s.program_id))"
            + " AND s.id::text = ? AND r.archived_at IS NULL");
    List<Object> args = new ArrayList<>(List.of(sessionId, sessionId));
    if (committee != null && !committee.isBlank()) {
      sql.append(" AND s.committee = ?");
      args.add(committee);
    }
    if (q != null && !q.isBlank()) {
      sql.append(" AND (p.full_name ILIKE ? OR p.elevate_me_id ILIKE ?)");
      args.add("%" + q + "%");
      args.add("%" + q + "%");
    }
    if (statusFilter != null && !statusFilter.isBlank()) {
      // Registration statuses vs attendance statuses share one filter slot.
      // Case-insensitive: TitleCase legacy + UPPER canonical + WITHDRAWN.
      String upperFilter = statusFilter.trim().toUpperCase();
      if (List.of("PENDING", "CONFIRMED", "WAITLISTED", "REJECTED", "CANCELLED", "WITHDRAWN")
          .contains(upperFilter)) {
        sql.append(" AND UPPER(r.status) = ?");
        args.add(upperFilter);
      } else {
        sql.append(" AND a.status = ?");
        args.add(upperFilter);
      }
    }
    // Photo key best-effort (pre-V5 DBs lack the column).
    sql = new StringBuilder(sql.toString()
        .replace("p.elevate_me_id AS elevateMeId",
            "p.elevate_me_id AS elevateMeId, p.photo_key AS photoKey"));
    sql.append(" ORDER BY p.full_name ASC, r.student_id ASC LIMIT ? OFFSET ?");
    args.add(limit);
    args.add(offset);
    try {
      return jdbc.queryForList(sql.toString(), args.toArray());
    } catch (org.springframework.jdbc.BadSqlGrammarException e) {
      // Fallback without photo_key on pre-V5 DBs.
      String fallback = sql.toString().replace(", p.photo_key AS photoKey", "");
      try {
        return jdbc.queryForList(fallback, args.toArray());
      } catch (Exception ex) {
        // Minimal fallback: registration-only projection.
        return jdbc.queryForList(
            "SELECT r.student_id::text AS studentId, r.status AS registrationStatus"
                + " FROM app.registrations r WHERE r.session_id::text = ?"
                + " AND r.archived_at IS NULL ORDER BY r.created_at LIMIT ? OFFSET ?",
            sessionId, limit, offset);
      }
    }
  }

  public int countRoster(String sessionId, String q, String committee, String statusFilter) {
    try {
      StringBuilder sql = new StringBuilder(
          "SELECT COUNT(*) FROM app.registrations r"
              + " JOIN app.sessions s ON s.id::uuid = COALESCE(r.session_id, s.id)"
              + " JOIN app.profiles p ON p.id = r.student_id"
              + " LEFT JOIN app.session_attendance a"
              + "   ON a.session_id = s.id AND a.student_id = r.student_id"
              + " WHERE (r.session_id::text = ? OR"
              + "   (r.session_id IS NULL AND r.program_id = s.program_id))"
              + " AND s.id::text = ? AND r.archived_at IS NULL");
      List<Object> args = new ArrayList<>(List.of(sessionId, sessionId));
      if (committee != null && !committee.isBlank()) {
        sql.append(" AND s.committee = ?");
        args.add(committee);
      }
      if (q != null && !q.isBlank()) {
        sql.append(" AND (p.full_name ILIKE ? OR p.elevate_me_id ILIKE ?)");
        args.add("%" + q + "%");
        args.add("%" + q + "%");
      }
      if (statusFilter != null && !statusFilter.isBlank()) {
        String upperFilter = statusFilter.trim().toUpperCase();
        if (List.of("PENDING", "CONFIRMED", "WAITLISTED", "REJECTED", "CANCELLED", "WITHDRAWN")
            .contains(upperFilter)) {
          sql.append(" AND UPPER(r.status) = ?");
          args.add(upperFilter);
        } else {
          sql.append(" AND a.status = ?");
          args.add(upperFilter);
        }
      }
      Integer n = jdbc.queryForObject(sql.toString(), Integer.class, args.toArray());
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  public boolean sessionExists(String sessionId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT 1 FROM app.sessions WHERE id::text = ? LIMIT 1", Integer.class, sessionId);
      return n != null;
    } catch (EmptyResultDataAccessException e) {
      return false;
    } catch (Exception e) {
      return false;
    }
  }
}
