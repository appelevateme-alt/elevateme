package com.elevateme.evaluation;

import com.elevateme.common.security.ScopeGuard;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 1c: JDBC scoped by authenticated subject (own evaluations) / organizer
 * scope. Every scoped read takes authenticatedSubject + studentId.
 *
 * <p>Phase 3: raw evaluation/assignment/revision/score writes. Scoped reads keep
 * the guard-inside-repo pattern; state-machine writes are pure JDBC (guard lives
 * in the service so unit tests can mock either layer). All writes assume the
 * caller holds the evaluation row lock (SELECT ... FOR UPDATE) inside a
 * transactional service method.
 */
@Repository
public class EvaluationRepository {
  private final JdbcTemplate jdbc;
  private final ScopeGuard guard;

  public EvaluationRepository(JdbcTemplate jdbc, ScopeGuard guard) {
    this.jdbc = jdbc;
    this.guard = guard;
  }

  public List<Map<String, Object>> findEvaluationsForStudent(
      String authenticatedSubject, String studentId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    return jdbc.queryForList(
        "SELECT e.id::text AS id, e.session_id::text AS sessionId, e.state AS state "
            + "FROM app.evaluations e WHERE e.student_id::text = ? "
            + "AND e.archived_at IS NULL ORDER BY e.created_at DESC",
        studentId);
  }

  public Map<String, Object> findEvaluationByIdForStudent(
      String authenticatedSubject, String studentId, String evaluationId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT e.id::text AS id, e.session_id::text AS sessionId, e.state AS state "
                + "FROM app.evaluations e WHERE e.id::text = ? AND e.student_id::text = ? "
                + "AND e.archived_at IS NULL LIMIT 1",
            evaluationId, studentId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  // ------------------------------------------------------------------
  // Phase 3 raw access (service enforces scope + state machine).
  // ------------------------------------------------------------------

  /** Raw evaluation row (no scope check; service guards). */
  public Map<String, Object> findEvaluationRaw(String evaluationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT e.id::text AS id, e.student_id::text AS studentId,"
                + " e.session_id::text AS sessionId, e.program_id::text AS programId,"
                + " e.evaluator_id::text AS evaluatorId,"
                + " e.rubric_version_id::text AS rubricVersionId, e.state AS state,"
                + " e.released_revision_id::text AS releasedRevisionId,"
                + " e.correction_reason AS correctionReason,"
                + " e.released_at AS releasedAt, e.row_version AS rowVersion"
                + " FROM app.evaluations e WHERE e.id::text = ? AND e.archived_at IS NULL LIMIT 1",
            evaluationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** SELECT ... FOR UPDATE inside the service transaction. */
  public Map<String, Object> lockEvaluation(String evaluationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT e.id::text AS id, e.student_id::text AS studentId,"
                + " e.session_id::text AS sessionId, e.program_id::text AS programId,"
                + " e.evaluator_id::text AS evaluatorId,"
                + " e.rubric_version_id::text AS rubricVersionId, e.state AS state,"
                + " e.released_revision_id::text AS releasedRevisionId,"
                + " e.row_version AS rowVersion"
                + " FROM app.evaluations e WHERE e.id::text = ? AND e.archived_at IS NULL"
                + " FOR UPDATE LIMIT 1",
            evaluationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public String findProgramIdForSession(String sessionId) {
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT program_id::text AS programId FROM app.sessions WHERE id::text = ? LIMIT 1",
              sessionId);
      if (rows.isEmpty() || rows.get(0).get("programId") == null) {
        return null;
      }
      return String.valueOf(rows.get(0).get("programId"));
    } catch (Exception e) {
      return null;
    }
  }

  public String findActiveRubricVersionId() {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id FROM app.rubric_versions WHERE is_active LIMIT 1");
    if (rows.isEmpty()) {
      throw new IllegalStateException("No active rubric version");
    }
    return String.valueOf(rows.get(0).get("id"));
  }

  public List<String> findRubricCriteria(String rubricVersionId) {
    return jdbc.query(
        "SELECT criterion_key FROM app.rubric_criteria WHERE rubric_version_id::text = ?"
            + " ORDER BY sort_order ASC",
        (rs, n) -> rs.getString(1),
        rubricVersionId);
  }

  // -- assignments (UNIQUE student+session, versioned) -----------------

  public Map<String, Object> findAssignment(String studentId, String sessionId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, student_id::text AS studentId,"
                + " session_id::text AS sessionId, rubric_version_id::text AS rubricVersionId,"
                + " assigned_by::text AS assignedBy, row_version AS rowVersion"
                + " FROM app.evaluation_assignments"
                + " WHERE student_id::text = ? AND session_id::text = ?"
                + " AND archived_at IS NULL LIMIT 1",
            studentId, sessionId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public String insertAssignment(
      String studentId, String sessionId, String rubricVersionId, String assignedBy) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.evaluation_assignments"
            + " (id, student_id, session_id, rubric_version_id, assigned_by)"
            + " VALUES (?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid)",
        id, studentId, sessionId, rubricVersionId, assignedBy);
    return id;
  }

  /**
   * Reassign bumps version + audit; old rights invalidate immediately because
   * scope checks always read the live assignment row.
   *
   * @return updated rows (0 = version conflict or missing)
   */
  public int updateAssignmentReassign(
      String assignmentId, int expectedVersion, String newAssignedBy) {
    return jdbc.update(
        "UPDATE app.evaluation_assignments SET assigned_by = ?::uuid,"
            + " assigned_at = now(), row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND archived_at IS NULL",
        newAssignedBy, assignmentId, expectedVersion);
  }

  // -- evaluations -----------------------------------------------------

  public String insertEvaluation(
      String studentId,
      String sessionId,
      String programId,
      String evaluatorId,
      String rubricVersionId) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.evaluations"
            + " (id, student_id, session_id, program_id, evaluator_id, rubric_version_id, state)"
            + " VALUES (?::uuid, ?::uuid, ?::uuid, ?::uuid, "
            + (evaluatorId == null ? "NULL" : "?::uuid") + ", ?::uuid, 'DRAFT')",
        evaluatorId == null
            ? new Object[] {id, studentId, sessionId, programId, rubricVersionId}
            : new Object[] {id, studentId, sessionId, programId, evaluatorId, rubricVersionId});
    return id;
  }

  public int updateEvaluationEvaluator(
      String evaluationId, int expectedVersion, String evaluatorId) {
    return jdbc.update(
        "UPDATE app.evaluations SET evaluator_id = ?::uuid,"
            + " row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND archived_at IS NULL",
        evaluatorId, evaluationId, expectedVersion);
  }

  public int updateEvaluationOptimistic(
      String evaluationId, int expectedVersion, String notes) {
    // Notes are not a V3 column; version bump is the observable effect.
    // Callers persist notes alongside scores/outbox when needed.
    return jdbc.update(
        "UPDATE app.evaluations SET row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND archived_at IS NULL",
        evaluationId, expectedVersion);
  }

  public int transitionEvaluationState(
      String evaluationId, int expectedVersion, String fromState, String toState) {
    return jdbc.update(
        "UPDATE app.evaluations SET state = ?, row_version = row_version + 1,"
            + " updated_at = now() WHERE id::text = ? AND row_version = ? AND state = ?"
            + " AND archived_at IS NULL",
        toState, evaluationId, expectedVersion, fromState);
  }

  public int transitionEvaluationStateWithCorrection(
      String evaluationId, int expectedVersion, String fromState, String toState, String reason) {
    return jdbc.update(
        "UPDATE app.evaluations SET state = ?, correction_reason = ?,"
            + " row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND state = ? AND archived_at IS NULL",
        toState, reason, evaluationId, expectedVersion, fromState);
  }

  /**
   * @deprecated Legacy non-versioned pointer; prefer
   *     {@link #pointReleasedWithCorrection(String, int, String, String)} which bumps
   *     row_version exactly once (single-bump) and enforces the LOCKED state.
   */
  @Deprecated
  public int pointReleasedAt(String evaluationId, String revisionId) {
    return jdbc.update(
        "UPDATE app.evaluations SET state = 'LOCKED', released_revision_id = ?::uuid,"
            + " released_at = now(), row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND archived_at IS NULL",
        revisionId, evaluationId);
  }

  /**
   * Phase 3 audit fix: correction must bump row_version exactly once. Atomically points the
   * live row at the new revision, stamps released_at/correction_reason, and keeps LOCKED —
   * all in a single UPDATE (single row_version bump).
   *
   * @return updated rows (0 = version conflict or not LOCKED)
   */
  public int pointReleasedWithCorrection(
      String evaluationId, int expectedVersion, String revisionId, String reason) {
    return jdbc.update(
        "UPDATE app.evaluations SET released_revision_id = ?::uuid,"
            + " released_at = now(), correction_reason = ?, state = 'LOCKED',"
            + " row_version = row_version + 1, updated_at = now()"
            + " WHERE id::text = ? AND row_version = ? AND state = 'LOCKED'"
            + " AND archived_at IS NULL",
        revisionId, reason, evaluationId, expectedVersion);
  }

  /** Evaluator pointer lookup for (student, session): id + version + current evaluator. */
  public Map<String, Object> findEvaluationByStudentSession(String studentId, String sessionId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, row_version AS rowVersion,"
                + " evaluator_id::text AS evaluatorId"
                + " FROM app.evaluations WHERE student_id::text = ? AND session_id::text = ?"
                + " AND archived_at IS NULL LIMIT 1",
            studentId, sessionId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  // -- revisions + scores ----------------------------------------------

  public int nextRevisionNo(String evaluationId) {
    try {
      Integer max =
          jdbc.queryForObject(
              "SELECT COALESCE(MAX(revision_no), 0) FROM app.evaluation_revisions"
                  + " WHERE evaluation_id::text = ?",
              Integer.class, evaluationId);
      return (max == null ? 0 : max) + 1;
    } catch (Exception e) {
      return 1;
    }
  }

  public String insertRevision(
      String evaluationId,
      int revisionNo,
      String rubricVersionId,
      String state,
      String createdBy,
      String correctionReason) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.evaluation_revisions"
            + " (id, evaluation_id, revision_no, rubric_version_id, state, correction_reason, created_by)"
            + " VALUES (?::uuid, ?::uuid, ?, ?::uuid, ?, ?, "
            + (createdBy == null ? "NULL" : "?::uuid") + ")",
        createdBy == null
            ? new Object[] {id, evaluationId, revisionNo, rubricVersionId, state, correctionReason}
            : new Object[] {
              id, evaluationId, revisionNo, rubricVersionId, state, correctionReason, createdBy
            });
    return id;
  }

  public Map<String, Object> findLatestRevision(String evaluationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, revision_no AS revisionNo, state AS state,"
                + " rubric_version_id::text AS rubricVersionId,"
                + " correction_reason AS correctionReason"
                + " FROM app.evaluation_revisions WHERE evaluation_id::text = ?"
                + " ORDER BY revision_no DESC LIMIT 1",
            evaluationId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public List<Map<String, Object>> findScoresForRevision(String revisionId) {
    return jdbc.queryForList(
        "SELECT criterion_key AS criterionKey, score FROM app.evaluation_scores"
            + " WHERE revision_id::text = ?",
        revisionId);
  }

  public void deleteScoresForRevision(String revisionId) {
    jdbc.update("DELETE FROM app.evaluation_scores WHERE revision_id::text = ?", revisionId);
  }

  public void upsertScores(String revisionId, java.util.Map<String, Integer> scoresByCriterion) {
    for (Map.Entry<String, Integer> e : scoresByCriterion.entrySet()) {
      jdbc.update(
          "INSERT INTO app.evaluation_scores (revision_id, criterion_key, score)"
              + " VALUES (?::uuid, ?, ?)"
              + " ON CONFLICT (revision_id, criterion_key) DO UPDATE SET score = EXCLUDED.score",
          revisionId, e.getKey(), e.getValue());
    }
  }
}
