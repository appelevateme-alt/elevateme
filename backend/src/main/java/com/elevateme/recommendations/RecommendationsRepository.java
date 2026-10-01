package com.elevateme.recommendations;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 5 recommendations persistence (V4 {@code app.recommendations} +
 * {@code app.recommendation_recipients}, Phase 5 columns in V10).
 *
 * <p>Rules:
 * <ul>
 *   <li>Criterion targeting reads the LATEST RELEASED score only (LOCKED +
 *       released_revision_id). Students without a released score row for the
 *       criterion are excluded — missing is never zero.</li>
 *   <li>Audience snapshot ({@code target_snapshot}) freezes recipient IDs at
 *       publish time; later-matching students never receive history.</li>
 *   <li>Dedupe: UNIQUE(student, recommendation) — overlapping batches insert
 *       with ON CONFLICT DO NOTHING.</li>
 *   <li>Pin: at most 3 pinned per student (pinned_order 1..3); the column CHECK
 *       bounds the range, Java enforces the count in-transaction.</li>
 * </ul>
 */
@Repository
public class RecommendationsRepository {
  private final JdbcTemplate jdbc;

  public RecommendationsRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // ------------------------------------------------------------------
  // Audience resolution
  // ------------------------------------------------------------------

  /** Approved student IDs from an explicit list (invalid/unknown IDs dropped). */
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

  /** Approved students of one institution (membership join + direct FK fallback). */
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

  /**
   * Students whose LATEST RELEASED score for {@code criterion} satisfies the
   * explicit {@code comparator} against {@code threshold}. Students with no
   * released score row are excluded (missing is never zero).
   */
  public List<String> findStudentsByReleasedCriterion(
      String criterion, String comparator, int threshold) {
    String op =
        switch (comparator == null ? "" : comparator.trim().toUpperCase()) {
          case "LT" -> "<";
          case "LTE" -> "<=";
          case "GT" -> ">";
          case "GTE" -> ">=";
          case "EQ" -> "=";
          default -> throw new IllegalArgumentException("Unknown comparator: " + comparator);
        };
    String sql =
        "SELECT e.student_id::text AS sid, sc.score AS score FROM app.evaluations e"
            + " JOIN app.evaluation_scores sc ON sc.revision_id = e.released_revision_id"
            + " AND sc.criterion_key = ?"
            + " WHERE e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
            + " AND e.archived_at IS NULL"
            + " AND e.released_at = (SELECT MAX(e2.released_at) FROM app.evaluations e2"
            + " WHERE e2.student_id = e.student_id AND e2.state = 'LOCKED'"
            + " AND e2.released_revision_id IS NOT NULL AND e2.archived_at IS NULL)"
            + (" =".equals(op) ? " AND sc.score = ?" : " AND sc.score " + op + " ?");
    try {
      return jdbc.query(sql, (rs, n) -> rs.getString("sid"), criterion, threshold);
    } catch (Exception e) {
      return List.of();
    }
  }

  // ------------------------------------------------------------------
  // Recommendation + recipient writes
  // ------------------------------------------------------------------

  public String insertRecommendation(
      String title, String action, String reason, String skillArea,
      String priority, java.time.Instant dueDate, String targetSnapshotJson,
      String linkedReportId, String createdBy) {
    String id = java.util.UUID.randomUUID().toString();
    // V4-mandated columns first (title/body/skill_tag/priority/target_snapshot):
    // body carries the action text so pre-V10 readers still show the action.
    StringBuilder cols = new StringBuilder(
        " (id, title, body, skill_tag, priority, target_snapshot, created_by");
    StringBuilder vals = new StringBuilder(
        " VALUES (?::uuid, ?, ?, ?, ?, ?::jsonb, ?::uuid");
    List<Object> args = new ArrayList<>(List.of(id, title, action,
        skillArea == null ? "" : skillArea, priority,
        targetSnapshotJson == null ? "{}" : targetSnapshotJson, createdBy));
    if (dueDate != null) {
      cols.append(", due_date");
      vals.append(", ?");
      args.add(dueDate);
    }
    if (linkedReportId != null && !linkedReportId.isBlank()) {
      cols.append(", linked_report_id");
      vals.append(", ?::uuid");
      args.add(linkedReportId);
    }
    if (hasColumn("action")) {
      cols.append(", action");
      vals.append(", ?");
      args.add(action);
    }
    if (hasColumn("reason")) {
      cols.append(", reason");
      vals.append(", ?");
      args.add(reason);
    }
    if (hasColumn("skill_area")) {
      cols.append(", skill_area");
      vals.append(", ?");
      args.add(skillArea);
    }
    cols.append(")");
    vals.append(")");
    try {
      jdbc.update("INSERT INTO app.recommendations" + cols + vals, args.toArray());
    } catch (Exception e) {
      // Pre-V10 CHECK vocab (no HIGH|MED|LOW): map onto the V4 display values
      // so skeleton DBs stay bootable. V10 widens the CHECK properly.
      Map<String, String> legacy =
          Map.of("HIGH", "High priority", "MED", "In progress", "LOW", "In progress");
      List<Object> fallback = new ArrayList<>(args);
      fallback.set(4, legacy.getOrDefault(priority, "In progress"));
      jdbc.update("INSERT INTO app.recommendations" + cols + vals, fallback.toArray());
    }
    return id;
  }

  /**
   * Insert a recipient row; overlapping batches dedupe via the partial UNIQUE
   * (student, recommendation) — duplicates are skipped, never double-created.
   *
   * @return 1 when inserted, 0 when the recipient already had this recommendation
   */
  public int insertRecipientDeduped(
      String recommendationId, String studentId, Integer pinnedOrder) {
    try {
      return jdbc.update(
          "INSERT INTO app.recommendation_recipients"
              + " (recommendation_id, student_id, pinned_order)"
              + " VALUES (?::uuid, ?::uuid, ?)"
              + " ON CONFLICT (student_id, recommendation_id) DO NOTHING",
          recommendationId, studentId, pinnedOrder);
    } catch (Exception e) {
      // Pre-V4 skeleton DBs: fall back without pinned_order.
      return jdbc.update(
          "INSERT INTO app.recommendation_recipients (recommendation_id, student_id)"
              + " VALUES (?::uuid, ?::uuid)"
              + " ON CONFLICT (student_id, recommendation_id) DO NOTHING",
          recommendationId, studentId);
    }
  }

  /** Raw recipient row (no scope check; the service guards ownership). */
  public Map<String, Object> findRecipientById(String recipientId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, recommendation_id::text AS recommendationId,"
                + " student_id::text AS studentId, viewed_at AS viewedAt,"
                + " completed_at AS completedAt, completed_by::text AS completedBy,"
                + " pinned_order AS pinnedOrder FROM app.recommendation_recipients"
                + " WHERE id::text = ? LIMIT 1",
            recipientId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** Pinned count for one student (pin budget: at most 3). */
  public int countPinnedByStudent(String studentId) {
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM app.recommendation_recipients"
                  + " WHERE student_id::text = ? AND pinned_order IS NOT NULL",
              Integer.class, studentId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  public int markCompleted(String recipientId, String completedBy) {
    try {
      return jdbc.update(
          "UPDATE app.recommendation_recipients SET completed_at = now(),"
              + " completed_by = ?::uuid, updated_at = now()"
              + " WHERE id::text = ? AND completed_at IS NULL",
          completedBy, recipientId);
    } catch (Exception e) {
      return jdbc.update(
          "UPDATE app.recommendation_recipients SET completed_at = now(), updated_at = now()"
              + " WHERE id::text = ? AND completed_at IS NULL",
          recipientId);
    }
  }

  public int markUncompleted(String recipientId) {
    return jdbc.update(
        "UPDATE app.recommendation_recipients SET completed_at = NULL,"
            + " completed_by = NULL, updated_at = now() WHERE id::text = ?",
        recipientId);
  }

  public int setPinned(String recipientId, int order) {
    return jdbc.update(
        "UPDATE app.recommendation_recipients SET pinned_order = ?, updated_at = now()"
            + " WHERE id::text = ?",
        order, recipientId);
  }

  public int clearPinned(String recipientId) {
    return jdbc.update(
        "UPDATE app.recommendation_recipients SET pinned_order = NULL, updated_at = now()"
            + " WHERE id::text = ?",
        recipientId);
  }

  public int updateNote(String recipientId, String note) {
    try {
      return jdbc.update(
          "UPDATE app.recommendation_recipients SET note = ?, updated_at = now()"
              + " WHERE id::text = ?",
          note, recipientId);
    } catch (Exception e) {
      // Pre-V10 DBs have no note column: note is best-effort, never a failure.
      return 0;
    }
  }

  /** Recipient rows for one student, newest first (own inbox). */
  public List<Map<String, Object>> findForStudent(String studentId) {
    try {
      return jdbc.queryForList(
          "SELECT rr.id::text AS id, rr.recommendation_id::text AS recommendationId,"
              + " r.title AS title, r.body AS body, r.skill_tag AS skillTag,"
              + " r.priority AS priority, rr.viewed_at AS viewedAt,"
              + " rr.completed_at AS completedAt, rr.completed_by::text AS completedBy,"
              + " rr.pinned_order AS pinnedOrder, rr.created_at AS createdAt"
              + " FROM app.recommendation_recipients rr"
              + " JOIN app.recommendations r ON r.id = rr.recommendation_id"
              + " WHERE rr.student_id::text = ? AND r.archived_at IS NULL"
              + " ORDER BY rr.pinned_order NULLS LAST, rr.created_at DESC",
          studentId);
    } catch (Exception e) {
      return List.of();
    }
  }

  /**
   * Parent's pinned default child (V1 {@code parent_default_student_id}).
   * Used for the parent inbox view; completions still re-check
   * {@link #isParentLinked}.
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

  /**
   * Parent linkage: the parent's pinned default child (V1
   * {@code parent_default_student_id}). Never trusted from the client — Java
   * re-checks this row for every parent completion.
   */
  public boolean isParentLinked(String parentProfileId, String studentId) {
    if (parentProfileId == null || studentId == null) {
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

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

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

  /** Best-effort column probe for pre-V10 DBs (missing column => skip it). */
  private boolean hasColumn(String column) {
    try {
      jdbc.queryForList("SELECT " + column + " FROM app.recommendations LIMIT 0");
      return true;
    } catch (Exception e) {
      return false;
    }
  }
}
