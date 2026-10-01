package com.elevateme.opportunities;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 5 development + payments persistence.
 *
 * <p>Development events back onto {@code app.programs} (one program row per
 * event, type SPECIAL, admin-published) with meta in V10
 * {@code app.development_events}. Targeting reuses V4
 * {@code app.development_assignments} (one active row per student+program;
 * overlapping batches dedupe; REMOVED blocks new registration but never
 * touches confirmed registrations). Paid holds reuse V4
 * {@code app.payment_verifications}: PENDING -&gt; VERIFIED|REJECTED|EXPIRED,
 * 48h default expiry, verifier + time recorded, external reference only —
 * card data is never stored (no such columns exist by design).
 */
@Repository
public class DevelopmentRepository {
  private final JdbcTemplate jdbc;

  public DevelopmentRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // ------------------------------------------------------------------
  // Events (backed by programs)
  // ------------------------------------------------------------------

  public String insertBackingProgram(
      String slug, String title, String description, int capacity,
      Object startsAt, Object deadline, String location, String createdBy) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.programs"
            + " (id, slug, title, program_type, capacity, lifecycle, description,"
            + " starts_at, registration_deadline, location, owner_id)"
            + " VALUES (?::uuid, ?, ?, 'SPECIAL', ?, 'PUBLISHED', ?, ?, ?, ?, ?::uuid)",
        id, slug, title, capacity, description == null ? "" : description,
        startsAt, deadline, location, createdBy);
    return id;
  }

  public String insertEvent(
      String programId, String details, Object eventDate, int capacity,
      String billingType, Double price, String currency, String paymentUrl,
      String partner, Object deadline, String createdBy) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.development_events"
            + " (id, program_id, details, event_date, capacity, billing_type,"
            + " price, currency, payment_url, partner, deadline, created_by)"
            + " VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::uuid)",
        id, programId, details, eventDate, capacity, billingType,
        price, currency, paymentUrl, partner, deadline, createdBy);
    return id;
  }

  /** Event + backing program meta (no scope check; the service guards). */
  public Map<String, Object> findEventById(String eventId) {
    List<Map<String, Object>> rows;
    try {
      rows = jdbc.queryForList(
          "SELECT e.id::text AS id, e.program_id::text AS programId, e.details AS details,"
              + " e.event_date AS eventDate, e.capacity AS capacity,"
              + " e.billing_type AS billingType, e.price AS price, e.currency AS currency,"
              + " e.payment_url AS paymentUrl, e.partner AS partner, e.deadline AS deadline,"
              + " p.title AS title, p.capacity AS programCapacity,"
              + " p.registration_deadline AS registrationDeadline"
              + " FROM app.development_events e JOIN app.programs p ON p.id = e.program_id"
              + " WHERE e.id::text = ? AND e.archived_at IS NULL LIMIT 1",
          eventId);
    } catch (Exception ex) {
      // Pre-V10 skeleton: event without meta table.
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public String findProgramIdForEvent(String eventId) {
    return String.valueOf(findEventById(eventId).get("programId"));
  }

  /** Event meta by backing program id (capacity checks at verify time). */
  public Map<String, Object> findEventByProgramId(String programId) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id, capacity AS capacity FROM app.development_events"
              + " WHERE program_id::text = ? AND archived_at IS NULL LIMIT 1",
          programId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Assignments (targeted only, deduped, removable)
  // ------------------------------------------------------------------

  /**
   * Targeted assign; overlapping batches dedupe via the active-unique
   * (student, program). Returns 1 on insert, 0 on duplicate.
   */
  public int insertAssignmentDeduped(
      String studentId, String programId, String reason, String assignedBy) {
    return jdbc.update(
        "INSERT INTO app.development_assignments"
            + " (student_id, program_id, reason, state, assigned_by)"
            + " VALUES (?::uuid, ?::uuid, ?, 'ASSIGNED', ?::uuid)"
            + " ON CONFLICT DO NOTHING",
        studentId, programId, reason == null ? "" : reason, assignedBy);
  }

  public Map<String, Object> findActiveAssignment(String studentId, String programId) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id, reason AS reason, state AS state,"
              + " assigned_at AS assignedAt FROM app.development_assignments"
              + " WHERE student_id::text = ? AND program_id::text = ?"
              + " AND archived_at IS NULL AND state IN ('ASSIGNED', 'IN_PROGRESS') LIMIT 1",
          studentId, programId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  /** Any assignment row incl. REMOVED (removal audit/removal checks). */
  public Map<String, Object> findAnyAssignment(String studentId, String programId) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id, reason AS reason, state AS state"
              + " FROM app.development_assignments"
              + " WHERE student_id::text = ? AND program_id::text = ?"
              + " AND archived_at IS NULL LIMIT 1",
          studentId, programId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Removal blocks new registration but NEVER cancels confirmed registrations:
   * only the assignment row flips to REMOVED; registration rows are untouched
   * (cancellation is a separate audited + notified flow).
   */
  public int markAssignmentRemoved(String studentId, String programId) {
    return jdbc.update(
        "UPDATE app.development_assignments SET state = 'REMOVED', updated_at = now()"
            + " WHERE student_id::text = ? AND program_id::text = ?"
            + " AND archived_at IS NULL AND state IN ('ASSIGNED', 'IN_PROGRESS')",
        studentId, programId);
  }

  /** Assigned-only listing for one student (targeted visibility). */
  public List<Map<String, Object>> findEventsForStudent(String studentId) {
    try {
      return jdbc.queryForList(
          "SELECT e.id::text AS id, e.program_id::text AS programId, e.details AS details,"
              + " e.event_date AS eventDate, e.capacity AS capacity,"
              + " e.billing_type AS billingType, e.price AS price, e.currency AS currency,"
              + " e.payment_url AS paymentUrl, e.partner AS partner, e.deadline AS deadline,"
              + " a.reason AS reason, a.state AS assignmentState, a.assigned_at AS assignedAt,"
              + " p.title AS title"
              + " FROM app.development_assignments a"
              + " JOIN app.development_events e ON e.program_id = a.program_id"
              + " JOIN app.programs p ON p.id = a.program_id"
              + " WHERE a.student_id::text = ? AND a.archived_at IS NULL"
              + " AND a.state IN ('ASSIGNED', 'IN_PROGRESS')"
              + " AND e.archived_at IS NULL ORDER BY e.event_date ASC NULLS LAST, e.id ASC",
          studentId);
    } catch (Exception e) {
      return List.of();
    }
  }

  public List<String> findApprovedStudentsByIds(List<String> ids) {
    if (ids == null || ids.isEmpty()) {
      return List.of();
    }
    try {
      return jdbc.query(
          "SELECT id::text FROM app.profiles WHERE id::text IN ("
              + placeholders(ids.size())
              + ") AND role = 'student' AND status = 'Approved' AND archived_at IS NULL",
          (rs, n) -> rs.getString(1), ids.toArray());
    } catch (Exception e) {
      return List.of();
    }
  }

  public List<String> findApprovedStudentsByInstitution(String institutionId) {
    if (institutionId == null || institutionId.isBlank()) {
      return List.of();
    }
    try {
      return jdbc.query(
          "SELECT DISTINCT p.id::text FROM app.profiles p"
              + " LEFT JOIN app.institute_memberships m ON m.profile_id = p.id"
              + " AND m.archived_at IS NULL"
              + " WHERE p.role = 'student' AND p.status = 'Approved' AND p.archived_at IS NULL"
              + " AND (p.institute_id::text = ? OR m.institute_id::text = ?)",
          (rs, n) -> rs.getString(1), institutionId, institutionId);
    } catch (Exception e) {
      return List.of();
    }
  }

  // ------------------------------------------------------------------
  // Registrations (capacity via SELECT FOR UPDATE + holds)
  // ------------------------------------------------------------------

  public Map<String, Object> lockProgramRow(String programId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, capacity FROM app.programs"
                + " WHERE id::text = ? FOR UPDATE LIMIT 1",
            programId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public int countConfirmed(String programId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.registrations WHERE program_id::text = ?"
              + " AND UPPER(status) = 'CONFIRMED' AND archived_at IS NULL",
          Integer.class, programId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Live paid holds: Pending registrations with an unexpired PENDING verification. */
  public int countActiveHolds(String programId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.registrations r"
              + " JOIN app.payment_verifications v ON v.registration_id = r.id"
              + " WHERE r.program_id::text = ? AND r.archived_at IS NULL"
              + " AND UPPER(r.status) = 'PENDING' AND v.state = 'PENDING'"
              + " AND v.expires_at > now()",
          Integer.class, programId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  public boolean existsRegistration(String studentId, String programId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.registrations WHERE student_id::text = ?"
              + " AND program_id::text = ? AND session_id IS NULL AND archived_at IS NULL",
          Integer.class, studentId, programId);
      return n != null && n > 0;
    } catch (Exception e) {
      return false;
    }
  }

  public String insertRegistration(String studentId, String programId, String status) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.registrations (id, student_id, program_id, status)"
            + " VALUES (?::uuid, ?::uuid, ?::uuid, ?)",
        id, studentId, programId, status);
    return id;
  }

  public Map<String, Object> findRegistrationById(String registrationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT r.id::text AS id, r.student_id::text AS studentId,"
                + " r.program_id::text AS programId, r.status AS status"
                + " FROM app.registrations r"
                + " WHERE r.id::text = ? AND r.archived_at IS NULL LIMIT 1",
            registrationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public int markRegistrationConfirmed(String registrationId) {
    return jdbc.update(
        "UPDATE app.registrations SET status = 'CONFIRMED', confirmed_at = now(),"
            + " updated_at = now() WHERE id::text = ? AND archived_at IS NULL"
            + " AND UPPER(status) IN ('PENDING', 'CONFIRMED', 'WAITLISTED')",
        registrationId);
  }

  public Map<String, Object> findCallerProfile(String subject) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, role, status FROM app.profiles"
                  + " WHERE supabase_subject::text = ? OR id::text = ? LIMIT 1",
              subject, subject);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  public String findLinkedChildId(String parentProfileId) {
    if (parentProfileId == null) {
      return null;
    }
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT parent_default_student_id::text AS childId FROM app.profiles"
              + " WHERE id::text = ? AND role = 'parent' LIMIT 1",
          parentProfileId);
      if (rows.isEmpty() || rows.get(0).get("childId") == null
          || "null".equals(String.valueOf(rows.get(0).get("childId")))) {
        return null;
      }
      return String.valueOf(rows.get(0).get("childId"));
    } catch (Exception e) {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Payment verifications (reference only — never card data)
  // ------------------------------------------------------------------

  public String insertVerification(
      String registrationId, String reference, Object expiresAt) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.payment_verifications (id, registration_id, external_reference,"
            + " state, expires_at) VALUES (?::uuid, ?::uuid, ?, 'PENDING', ?)",
        id, registrationId, reference, expiresAt);
    return id;
  }

  public Map<String, Object> findVerificationById(String verificationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT v.id::text AS id, v.registration_id::text AS registrationId,"
                + " v.external_reference AS reference, v.state AS state,"
                + " v.expires_at AS expiresAt, v.verified_by::text AS verifiedBy,"
                + " v.verified_at AS verifiedAt, v.reject_reason AS rejectReason,"
                + " v.created_at AS createdAt,"
                + " r.student_id::text AS studentId, r.program_id::text AS programId"
                + " FROM app.payment_verifications v"
                + " JOIN app.registrations r ON r.id = v.registration_id"
                + " WHERE v.id::text = ? LIMIT 1",
            verificationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public Map<String, Object> findVerificationByRegistration(String registrationId) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id, external_reference AS reference, state AS state,"
              + " expires_at AS expiresAt, created_at AS createdAt"
              + " FROM app.payment_verifications WHERE registration_id::text = ?"
              + " ORDER BY created_at DESC LIMIT 1",
          registrationId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * "I have paid" claim: attaches the reference for review. State stays
   * PENDING and the registration is NOT confirmed by this write.
   */
  public int claimVerification(String verificationId, String reference) {
    return jdbc.update(
        "UPDATE app.payment_verifications SET external_reference = ?, updated_at = now()"
            + " WHERE id::text = ? AND state IN ('PENDING', 'EXPIRED')",
        reference, verificationId);
  }

  public int reopenToPending(String verificationId, String reference) {
    return jdbc.update(
        "UPDATE app.payment_verifications SET external_reference = ?, state = 'PENDING',"
            + " reject_reason = NULL, verified_by = NULL, verified_at = NULL,"
            + " updated_at = now() WHERE id::text = ? AND state = 'REJECTED'",
        reference, verificationId);
  }

  public int verifyVerification(
      String verificationId, String state, String verifiedBy, String reason) {
    return jdbc.update(
        "UPDATE app.payment_verifications SET state = ?, verified_by = ?::uuid,"
            + " verified_at = now(),"
            + " reject_reason = CASE WHEN ? = 'REJECTED' THEN ? ELSE reject_reason END,"
            + " updated_at = now() WHERE id::text = ? AND state IN ('PENDING', 'EXPIRED')",
        state, verifiedBy, state, reason, verificationId);
  }

  public int extendVerification(String verificationId, Object newExpiresAt) {
    return jdbc.update(
        "UPDATE app.payment_verifications SET expires_at = ?, updated_at = now()"
            + " WHERE id::text = ? AND state = 'PENDING'",
        newExpiresAt, verificationId);
  }

  /** Expiry sweep: PENDING past expiry -> EXPIRED (frees the hold). */
  public List<Map<String, Object>> expireDueHolds() {
    try {
      List<Map<String, Object>> due = jdbc.queryForList(
          "SELECT id::text AS id, registration_id::text AS registrationId"
              + " FROM app.payment_verifications"
              + " WHERE state = 'PENDING' AND expires_at <= now()");
      for (Map<String, Object> row : due) {
        jdbc.update(
            "UPDATE app.payment_verifications SET state = 'EXPIRED', updated_at = now()"
                + " WHERE id::text = ? AND state = 'PENDING'",
            String.valueOf(row.get("id")));
      }
      return due;
    } catch (Exception e) {
      return List.of();
    }
  }

  /** Admin payments table: student, event, reference, pending age. */
  public List<Map<String, Object>> findVerificationsByState(String state, int limit) {
    try {
      return jdbc.queryForList(
          "SELECT v.id::text AS id, v.registration_id::text AS registrationId,"
              + " v.external_reference AS reference, v.state AS state,"
              + " v.expires_at AS expiresAt, v.created_at AS createdAt,"
              + " now() - v.created_at AS pendingAge,"
              + " r.student_id::text AS studentId, r.program_id::text AS programId,"
              + " p.title AS eventTitle"
              + " FROM app.payment_verifications v"
              + " JOIN app.registrations r ON r.id = v.registration_id"
              + " LEFT JOIN app.programs p ON p.id = r.program_id"
              + " WHERE v.state = ? ORDER BY v.created_at ASC LIMIT ?",
          state, limit);
    } catch (Exception e) {
      return List.of();
    }
  }

  public List<String> findAdminIds() {
    try {
      return jdbc.query(
          "SELECT id::text FROM app.profiles WHERE role = 'admin' AND status = 'Approved'"
              + " AND archived_at IS NULL",
          (rs, n) -> rs.getString(1));
    } catch (Exception e) {
      return List.of();
    }
  }

  private static String placeholders(int n) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < n; i++) {
      if (i > 0) {
        sb.append(",");
      }
      sb.append("?");
    }
    return sb.toString();
  }
}
