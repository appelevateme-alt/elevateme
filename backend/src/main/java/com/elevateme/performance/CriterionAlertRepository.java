package com.elevateme.performance;

import java.util.List;
import java.util.Map;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 4 criterion-alert persistence (V4 {@code app.criterion_alerts}).
 *
 * <p>Exactly one ACTIVE row per (student, criterion): partial UNIQUE
 * WHERE resolved_at IS NULL. Evidence pins the triggering sheet revision.
 * acknowledged_at (seen/dismissed) vs resolved_at (actioned) are separate;
 * dismiss never resolves.
 */
@Repository
public class CriterionAlertRepository {
  private final JdbcTemplate jdbc;

  public CriterionAlertRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Active alert for (student, criterion), or null. */
  public Map<String, Object> findActive(String studentId, String criterionKey) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, student_id::text AS studentId, criterion_key AS criterionKey,"
                  + " session_id::text AS sessionId, evidence_revision_id::text AS evidenceRevisionId,"
                  + " score, threshold, acknowledged_at AS acknowledgedAt,"
                  + " acknowledged_by::text AS acknowledgedBy, resolved_at AS resolvedAt,"
                  + " resolved_note AS resolvedNote, created_at AS createdAt"
                  + " FROM app.criterion_alerts"
                  + " WHERE student_id::text = ? AND criterion_key = ? AND resolved_at IS NULL LIMIT 1",
              studentId, criterionKey);
      if (rows.isEmpty() || rows.get(0).get("id") == null) {
        return null;
      }
      return rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  /** Latest alert row (active or resolved) for backdated comparison, or null. */
  public Map<String, Object> findLatest(String studentId, String criterionKey) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, student_id::text AS studentId, criterion_key AS criterionKey,"
                  + " session_id::text AS sessionId, evidence_revision_id::text AS evidenceRevisionId,"
                  + " score, threshold, acknowledged_at AS acknowledgedAt,"
                  + " resolved_at AS resolvedAt, created_at AS createdAt"
                  + " FROM app.criterion_alerts"
                  + " WHERE student_id::text = ? AND criterion_key = ?"
                  + " ORDER BY created_at DESC LIMIT 1",
              studentId, criterionKey);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }

  /** Create a new active alert (score must be &lt; threshold per DB CHECK). */
  public String create(
      String studentId, String criterionKey, String sessionId,
      String evidenceRevisionId, int score, int threshold) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.criterion_alerts"
            + " (id, student_id, criterion_key, session_id, evidence_revision_id, score, threshold)"
            + " VALUES (?::uuid, ?::uuid, ?, "
            + (sessionId == null ? "NULL" : "?::uuid") + ", "
            + (evidenceRevisionId == null ? "NULL" : "?::uuid") + ", ?, ?)",
        buildArgs(id, studentId, criterionKey, sessionId, evidenceRevisionId, score, threshold));
    return id;
  }

  private static Object[] buildArgs(
      String id, String studentId, String criterionKey, String sessionId,
      String evidenceRevisionId, int score, int threshold) {
    java.util.List<Object> args = new java.util.ArrayList<>();
    args.add(id);
    args.add(studentId);
    args.add(criterionKey);
    if (sessionId != null) {
      args.add(sessionId);
    }
    if (evidenceRevisionId != null) {
      args.add(evidenceRevisionId);
    }
    args.add(score);
    args.add(threshold);
    return args.toArray();
  }

  /** Update evidence only (no dup email path); keeps the row active. */
  public int updateEvidence(String alertId, String sessionId, String evidenceRevisionId, int score) {
    return jdbc.update(
        "UPDATE app.criterion_alerts SET session_id = "
            + (sessionId == null ? "NULL" : "?::uuid")
            + ", evidence_revision_id = "
            + (evidenceRevisionId == null ? "NULL" : "?::uuid")
            + ", score = ? WHERE id::text = ? AND resolved_at IS NULL",
        buildUpdateArgs(sessionId, evidenceRevisionId, score, alertId));
  }

  private static Object[] buildUpdateArgs(
      String sessionId, String evidenceRevisionId, int score, String alertId) {
    java.util.List<Object> args = new java.util.ArrayList<>();
    if (sessionId != null) {
      args.add(sessionId);
    }
    if (evidenceRevisionId != null) {
      args.add(evidenceRevisionId);
    }
    args.add(score);
    args.add(alertId);
    return args.toArray();
  }

  /** Resolve with a mandatory note (DB CHECK requires resolved_note when resolved_at set). */
  public int resolve(String alertId, String note) {
    return jdbc.update(
        "UPDATE app.criterion_alerts SET resolved_at = now(), resolved_note = ?"
            + " WHERE id::text = ? AND resolved_at IS NULL",
        note, alertId);
  }

  /** Dismiss = acknowledged (seen), NOT resolved (row stays active). */
  public int dismiss(String alertId, String acknowledgedBy) {
    return jdbc.update(
        "UPDATE app.criterion_alerts SET acknowledged_at = now(), acknowledged_by = "
            + (acknowledgedBy == null ? "NULL" : "?::uuid")
            + " WHERE id::text = ? AND resolved_at IS NULL",
        acknowledgedBy == null ? new Object[] {alertId} : new Object[] {acknowledgedBy, alertId});
  }

  /** Chronological released scores for (student, criterion) for reconcile-from-scratch. */
  public List<Map<String, Object>> findChronologicalScores(String studentId, String criterionKey) {
    try {
      return jdbc.queryForList(
          "SELECT e.id::text AS evaluationId, r.id::text AS revisionId,"
              + " e.session_id::text AS sessionId, s.starts_at AS startsAt, sc.score AS score"
              + " FROM app.evaluations e"
              + " JOIN app.evaluation_revisions r ON r.id = e.released_revision_id"
              + " JOIN app.evaluation_scores sc ON sc.revision_id = r.id"
              + " LEFT JOIN app.sessions s ON s.id = e.session_id"
              + " WHERE e.student_id::text = ? AND sc.criterion_key = ?"
              + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
              + " AND e.archived_at IS NULL"
              + " ORDER BY s.starts_at ASC NULLS LAST, e.id ASC",
          studentId, criterionKey);
    } catch (EmptyResultDataAccessException e) {
      return List.of();
    } catch (Exception e) {
      return List.of();
    }
  }

  /** Evidence starts_at + evaluation for backdated comparison (joins sessions). */
  public Map<String, Object> findEvidenceMeta(String evidenceRevisionId) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT r.evaluation_id::text AS evaluationId, s.starts_at AS startsAt"
                  + " FROM app.evaluation_revisions r"
                  + " JOIN app.evaluations e ON e.id = r.evaluation_id"
                  + " LEFT JOIN app.sessions s ON s.id = e.session_id"
                  + " WHERE r.id::text = ? LIMIT 1",
              evidenceRevisionId);
      return rows.isEmpty() ? null : rows.get(0);
    } catch (Exception e) {
      return null;
    }
  }
}
