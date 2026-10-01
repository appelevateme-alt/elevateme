package com.elevateme.queries;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 5 query exchange persistence (V4 {@code app.query_threads} +
 * {@code app.query_messages}, Phase 5 link/idempotency/version columns in V10).
 *
 * <p>Status machine: IN_REVIEW -&gt; ANSWERED -&gt; CLOSED (+ CLOSED -&gt;
 * IN_REVIEW on admin reopen). DI-initiated threads start in
 * AWAITING_STUDENT_RESPONSE. {@code awaiting_admin_reply} drives the staff
 * queue; a student follow-up sets it true while keeping the prior official
 * reply. Closed threads stay readable. Official replies carry a version chain
 * ({@code version}, {@code supersedes_id}) so edits never rewrite history.
 */
@Repository
public class QueriesRepository {
  private final JdbcTemplate jdbc;

  public QueriesRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // ------------------------------------------------------------------
  // Threads
  // ------------------------------------------------------------------

  public String insertThread(
      String studentId, String subject, String body, String initiator,
      String initiatorProfileId, String linkedProgramId, String linkedReportId,
      String idempotencyKey, String status, boolean awaitingAdminReply) {
    String id = java.util.UUID.randomUUID().toString();
    StringBuilder cols = new StringBuilder(
        " (id, student_id, subject, initiator, initiator_profile_id,"
            + " status, awaiting_admin_reply");
    StringBuilder vals = new StringBuilder(" VALUES (?::uuid, ?::uuid, ?, ?, ?::uuid, ?, ?");
    List<Object> args = new ArrayList<>(List.of(id, studentId, subject, initiator,
        initiatorProfileId, status, awaitingAdminReply));
    if (hasThreadColumn("linked_program_id") && linkedProgramId != null) {
      cols.append(", linked_program_id");
      vals.append(", ?::uuid");
      args.add(linkedProgramId);
    }
    if (hasThreadColumn("linked_report_id") && linkedReportId != null) {
      cols.append(", linked_report_id");
      vals.append(", ?::uuid");
      args.add(linkedReportId);
    }
    if (hasThreadColumn("idempotency_key") && idempotencyKey != null) {
      cols.append(", idempotency_key");
      vals.append(", ?");
      args.add(idempotencyKey);
    }
    cols.append(")");
    vals.append(")");
    jdbc.update("INSERT INTO app.query_threads" + cols + vals, args.toArray());
    // The opening body is the first message (full-width follow-ups follow).
    insertMessage(id, initiatorProfileId, initiatorAuthorType(initiator), body, 1, null);
    return id;
  }

  /** Raw thread row (no scope check; the service guards). */
  public Map<String, Object> findThreadById(String threadId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, student_id::text AS studentId, subject AS subject,"
                + " initiator AS initiator, initiator_profile_id::text AS initiatorProfileId,"
                + " status AS status, awaiting_admin_reply AS awaitingAdminReply,"
                + " closed_at AS closedAt, reopened_at AS reopenedAt,"
                + " close_count AS closeCount, row_version AS rowVersion,"
                + " created_at AS createdAt, updated_at AS updatedAt"
                + " FROM app.query_threads WHERE id::text = ? AND archived_at IS NULL LIMIT 1",
            threadId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** SELECT ... FOR UPDATE inside the service transaction. */
  public Map<String, Object> lockThread(String threadId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, student_id::text AS studentId, subject AS subject,"
                + " initiator AS initiator, status AS status,"
                + " awaiting_admin_reply AS awaitingAdminReply,"
                + " close_count AS closeCount, row_version AS rowVersion"
                + " FROM app.query_threads WHERE id::text = ? AND archived_at IS NULL"
                + " FOR UPDATE LIMIT 1",
            threadId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** Own threads, stable sort (updated_at DESC, id ASC), 10 per page. */
  public List<Map<String, Object>> findThreadsForStudent(
      String studentId, String q, String status, int limit, int offset) {
    StringBuilder sql = new StringBuilder(
        "SELECT id::text AS id, subject AS title, subject AS subject, status AS status,"
            + " awaiting_admin_reply AS awaitingAdminReply,"
            + " created_at AS createdAt, updated_at AS updatedAt"
            + " FROM app.query_threads WHERE student_id::text = ? AND archived_at IS NULL");
    List<Object> args = new ArrayList<>(List.of(studentId));
    if (q != null && !q.isBlank()) {
      sql.append(" AND subject ILIKE ?");
      args.add("%" + q.trim() + "%");
    }
    if (status != null && !status.isBlank()) {
      sql.append(" AND status = ?");
      args.add(status.trim().toUpperCase());
    }
    sql.append(" ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?");
    args.add(limit);
    args.add(offset);
    try {
      return jdbc.queryForList(sql.toString(), args.toArray());
    } catch (Exception e) {
      return List.of();
    }
  }

  public int countThreadsForStudent(String studentId, String q, String status) {
    StringBuilder sql = new StringBuilder(
        "SELECT COUNT(*) FROM app.query_threads"
            + " WHERE student_id::text = ? AND archived_at IS NULL");
    List<Object> args = new ArrayList<>(List.of(studentId));
    if (q != null && !q.isBlank()) {
      sql.append(" AND subject ILIKE ?");
      args.add("%" + q.trim() + "%");
    }
    if (status != null && !status.isBlank()) {
      sql.append(" AND status = ?");
      args.add(status.trim().toUpperCase());
    }
    try {
      Integer n = jdbc.queryForObject(sql.toString(), Integer.class, args.toArray());
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Recent same-title+body duplicate guard (idempotency backstop). */
  public Map<String, Object> findRecentDuplicate(
      String studentId, String subject, String bodyHash) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id FROM app.query_threads"
              + " WHERE student_id::text = ? AND subject = ? AND archived_at IS NULL"
              + " AND created_at > now() - interval '10 minutes'"
              + " ORDER BY created_at DESC LIMIT 1",
          studentId, subject);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  public int setStatus(
      String threadId, int expectedVersion, String status, boolean awaitingAdminReply) {
    return jdbc.update(
        "UPDATE app.query_threads SET status = ?, awaiting_admin_reply = ?,"
            + " updated_at = now() WHERE id::text = ? AND row_version = ?"
            + " AND archived_at IS NULL",
        status, awaitingAdminReply, threadId, expectedVersion);
  }

  public int setAwaitingAdmin(String threadId, boolean awaiting) {
    return jdbc.update(
        "UPDATE app.query_threads SET awaiting_admin_reply = ?, updated_at = now()"
            + " WHERE id::text = ? AND archived_at IS NULL",
        awaiting, threadId);
  }

  public int markClosed(String threadId, int expectedVersion) {
    return jdbc.update(
        "UPDATE app.query_threads SET status = 'CLOSED', awaiting_admin_reply = false,"
            + " closed_at = now(), close_count = close_count + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND archived_at IS NULL",
        threadId, expectedVersion);
  }

  public int markReopened(String threadId, int expectedVersion) {
    return jdbc.update(
        "UPDATE app.query_threads SET status = 'IN_REVIEW', awaiting_admin_reply = true,"
            + " reopened_at = now(), updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND status = 'CLOSED'"
            + " AND archived_at IS NULL",
        threadId, expectedVersion);
  }

  // ------------------------------------------------------------------
  // Messages (timestamped follow-ups, versioned official replies)
  // ------------------------------------------------------------------

  public String insertMessage(
      String threadId, String authorId, String authorType, String body,
      int version, String supersedesId) {
    String id = java.util.UUID.randomUUID().toString();
    boolean versioned = hasMessageColumn("version");
    if (versioned) {
      jdbc.update(
          "INSERT INTO app.query_messages"
              + " (id, thread_id, author_id, author_type, body, version, supersedes_id)"
              + " VALUES (?::uuid, ?::uuid, "
              + (authorId == null ? "NULL" : "?::uuid") + ", ?, ?, ?, "
              + (supersedesId == null ? "NULL" : "?::uuid") + ")",
          versionedArgs(id, threadId, authorId, authorType, body, version, supersedesId));
    } else {
      jdbc.update(
          "INSERT INTO app.query_messages (id, thread_id, author_id, author_type, body)"
              + " VALUES (?::uuid, ?::uuid, "
              + (authorId == null ? "NULL" : "?::uuid") + ", ?, ?)",
          plainArgs(id, threadId, authorId, authorType, body));
    }
    return id;
  }

  /** Chronological messages for a thread (full-width follow-ups, both sides). */
  public List<Map<String, Object>> findMessagesChronological(String threadId) {
    boolean versioned = hasMessageColumn("version");
    try {
      return jdbc.queryForList(
          "SELECT id::text AS id, author_id::text AS authorId, author_type AS authorType,"
              + " body AS body,"
              + (versioned ? " version AS version," : "")
              + " created_at AS createdAt FROM app.query_messages"
              + " WHERE thread_id::text = ? ORDER BY created_at ASC, id ASC",
          threadId);
    } catch (Exception e) {
      return List.of();
    }
  }

  /** Latest official (ADMIN/DI) reply — kept so follow-ups never erase it. */
  public Map<String, Object> findLatestOfficialReply(String threadId) {
    try {
      List<Map<String, Object>> rows = jdbc.queryForList(
          "SELECT id::text AS id, body AS body,"
              + (hasMessageColumn("version") ? " version AS version," : "")
              + " created_at AS createdAt FROM app.query_messages"
              + " WHERE thread_id::text = ? AND author_type IN ('ADMIN', 'COORDINATOR')"
              + " ORDER BY created_at DESC LIMIT 1",
          threadId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  public Map<String, Object> findMessageById(String messageId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, thread_id::text AS threadId,"
                + " author_id::text AS authorId, author_type AS authorType, body AS body"
                + " FROM app.query_messages WHERE id::text = ? LIMIT 1",
            messageId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  // ------------------------------------------------------------------
  // Profiles / admin queue
  // ------------------------------------------------------------------

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

  /** Approved admin profile IDs (DI queue fan-out for in-app notifications). */
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

  /**
   * Parent's pinned default child (V1 {@code parent_default_student_id}).
   * Used for parent posting context + parent inbox; never trusted for authz
   * without {@link #isParentLinked}.
   */
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

  public boolean isParentLinked(String parentProfileId, String studentId) {    if (parentProfileId == null || studentId == null) {
      return false;
    }
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT 1 FROM app.profiles WHERE id::text = ?"
                  + " AND parent_default_student_id::text = ? LIMIT 1",
              Integer.class, parentProfileId, studentId);
      return n != null;
    } catch (EmptyResultDataAccessException e) {
      return false;
    } catch (Exception e) {
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private static String initiatorAuthorType(String initiator) {
    if ("PARENT".equalsIgnoreCase(initiator)) {
      return "PARENT";
    }
    if ("DI".equalsIgnoreCase(initiator)) {
      return "ADMIN";
    }
    return "STUDENT";
  }

  private boolean hasThreadColumn(String column) {
    try {
      jdbc.queryForList("SELECT " + column + " FROM app.query_threads LIMIT 0");
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  private boolean hasMessageColumn(String column) {
    try {
      jdbc.queryForList("SELECT " + column + " FROM app.query_messages LIMIT 0");
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  private static Object[] versionedArgs(
      String id, String threadId, String authorId, String authorType,
      String body, int version, String supersedesId) {
    List<Object> args = new ArrayList<>(List.of(id, threadId));
    if (authorId != null) {
      args.add(authorId);
    }
    args.add(authorType);
    args.add(body);
    args.add(version);
    if (supersedesId != null) {
      args.add(supersedesId);
    }
    return args.toArray();
  }

  private static Object[] plainArgs(
      String id, String threadId, String authorId, String authorType, String body) {
    List<Object> args = new ArrayList<>(List.of(id, threadId));
    if (authorId != null) {
      args.add(authorId);
    }
    args.add(authorType);
    args.add(body);
    return args.toArray();
  }
}
