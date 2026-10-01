package com.elevateme.performance;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 1D release persistence: preview counts, row locking, idempotent release insert.
 *
 * <p>Releasing is atomic (single transaction in {@link ReleaseService}): lock roster -&gt;
 * lock eligible -&gt; recompute readiness (same query path as preview) -&gt; block on
 * outstanding (409 INCOMPLETE) -&gt; insert release -&gt; flip exactly the validated
 * eligible set -&gt; outbox per recipient. Absent / excluded attendance is excluded
 * with reason (never released as zero).
 *
 * <p>Fail-closed: NO catch-&gt;0 / catch-&gt;empty. Every DB failure propagates to the
 * caller (service attaches requestId, {@code GlobalExceptionHandler} renders it).
 * Returning zero on failure would silently allow an incomplete release — forbidden.
 */
@Repository
public class ReleaseRepository {
  private final JdbcTemplate jdbc;

  public ReleaseRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  // ------------------------------------------------------------------
  // Readiness: shared query path for preview + release (must stay in sync).
  // Required roster = live assignments + live registrations (session or program
  // level) + ATTENDED attendance, minus ABSENT/EXCLUDED. Unmarked students stay
  // required (they surface as NOT_STARTED and block release).
  // ------------------------------------------------------------------

  private static final String REQUIRED_STUDENT_SUBQUERY =
      "SELECT student_id FROM app.evaluation_assignments"
          + " WHERE session_id::text = ? AND archived_at IS NULL"
          + " UNION "
          + "SELECT r.student_id FROM app.registrations r JOIN app.sessions s ON s.id::text = ?"
          + " WHERE (r.session_id::text = ? OR"
          + " (r.session_id IS NULL AND r.program_id = s.program_id))"
          + " AND r.archived_at IS NULL"
          + " UNION "
          + "SELECT student_id FROM app.session_attendance"
          + " WHERE session_id::text = ? AND status = 'ATTENDED'";

  private static final String NOT_EXCLUDED_CLAUSE =
      "NOT EXISTS (SELECT 1 FROM app.session_attendance a"
          + " WHERE a.session_id::text = ? AND a.student_id = req.student_id"
          + " AND a.status IN ('ABSENT', 'EXCLUDED'))";

  private static final String NOT_EXCLUDED_EVAL_CLAUSE =
      "NOT EXISTS (SELECT 1 FROM app.session_attendance a"
          + " WHERE a.session_id = e.session_id AND a.student_id = e.student_id"
          + " AND a.status IN ('ABSENT', 'EXCLUDED'))";

  /**
   * SUBMITTED (releasable, non-excluded) evaluations in the session. Same WHERE as
   * {@link #lockEligibleEvaluations} so preview counts == actual recipient set.
   */
  public int countSubmitted(String sessionId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.evaluations e WHERE e.session_id::text = ?"
                + " AND e.state = 'SUBMITTED' AND e.archived_at IS NULL AND "
                + NOT_EXCLUDED_EVAL_CLAUSE,
            Integer.class, sessionId);
    return n == null ? 0 : n;
  }

  /**
   * Expected = required (non-excluded) roster size: assignments + registrations +
   * ATTENDED, minus ABSENT/EXCLUDED. ATTENDED-only in the sense that ABSENT/EXCLUDED
   * are never expected; unmarked roster members remain expected (block as
   * NOT_STARTED until marked excluded or evaluated).
   */
  public int countExpected(String sessionId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM ("
                + "SELECT DISTINCT req.student_id FROM (" + REQUIRED_STUDENT_SUBQUERY + ") req"
                + " WHERE " + NOT_EXCLUDED_CLAUSE
                + ") t",
            Integer.class,
            sessionId, sessionId, sessionId, sessionId, sessionId);
    return n == null ? 0 : n;
  }

  /** Already LOCKED (released) evaluations in the session. */
  public int countReleased(String sessionId) {
    Integer n =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.evaluations WHERE session_id::text = ? AND state = 'LOCKED'"
                + " AND archived_at IS NULL",
            Integer.class, sessionId);
    return n == null ? 0 : n;
  }

  /**
   * Absent/excluded attendance rows (excluded from release, reason required for
   * EXCLUDED by DB CHECK). Includes student name for the release bar.
   */
  public List<Map<String, Object>> findExcludedWithReason(String sessionId) {
    return jdbc.queryForList(
        "SELECT a.student_id::text AS studentId, COALESCE(p.full_name, '') AS name,"
            + " a.status AS status, a.reason AS reason FROM app.session_attendance a"
            + " LEFT JOIN app.profiles p ON p.id = a.student_id"
            + " WHERE a.session_id::text = ? AND a.status IN ('ABSENT', 'EXCLUDED')"
            + " ORDER BY COALESCE(p.full_name, a.student_id::text)",
        sessionId);
  }

  /**
   * Required but not releasable: {@code [{studentId, name, reason}]} where reason is
   * NOT_STARTED (no evaluation row) | DRAFT_INCOMPLETE (DRAFT sheet) | UNSUBMITTED
   * (any other non-releasable state). LOCKED rows are never outstanding. Same
   * required-roster subquery as {@link #countExpected} so counts stay consistent.
   */
  public List<Map<String, Object>> findOutstandingWithReason(String sessionId) {
    return jdbc.queryForList(
        "SELECT need.student_id::text AS studentId, COALESCE(p.full_name, '') AS name,"
            + " CASE WHEN e.id IS NULL THEN 'NOT_STARTED'"
            + " WHEN e.state = 'DRAFT' THEN 'DRAFT_INCOMPLETE'"
            + " ELSE 'UNSUBMITTED' END AS reason,"
            + " e.state AS state"
            + " FROM (SELECT DISTINCT req.student_id FROM ("
            + REQUIRED_STUDENT_SUBQUERY + ") req WHERE " + NOT_EXCLUDED_CLAUSE + ") need"
            + " LEFT JOIN app.profiles p ON p.id = need.student_id"
            + " LEFT JOIN app.evaluations e ON e.session_id::text = ?"
            + " AND e.student_id = need.student_id AND e.archived_at IS NULL"
            + " WHERE e.id IS NULL OR e.state NOT IN ('SUBMITTED', 'LOCKED')"
            + " ORDER BY COALESCE(p.full_name, need.student_id::text)",
        sessionId, sessionId, sessionId, sessionId, sessionId, sessionId);
  }

  /**
   * Serialize concurrent releases: lock the session row + its attendance rows FOR
   * UPDATE inside the release transaction. Must be called before
   * {@link #lockEligibleEvaluations}.
   */
  public void lockSessionRoster(String sessionId) {
    jdbc.queryForList(
        "SELECT id FROM app.sessions WHERE id::text = ? FOR UPDATE", sessionId);
    jdbc.queryForList(
        "SELECT student_id FROM app.session_attendance WHERE session_id::text = ? FOR UPDATE",
        sessionId);
  }

  /** Eligible evaluations locked FOR UPDATE (SUBMITTED minus absent/excluded). */
  public List<Map<String, Object>> lockEligibleEvaluations(String sessionId) {
    return jdbc.queryForList(
        "SELECT e.id::text AS id, e.student_id::text AS studentId,"
            + " (SELECT id::text FROM app.evaluation_revisions r WHERE r.evaluation_id = e.id"
            + " ORDER BY revision_no DESC LIMIT 1) AS latestRevisionId"
            + " FROM app.evaluations e WHERE e.session_id::text = ? AND e.state = 'SUBMITTED'"
            + " AND e.archived_at IS NULL"
            + " AND NOT EXISTS (SELECT 1 FROM app.session_attendance a"
            + " WHERE a.session_id = e.session_id AND a.student_id = e.student_id"
            + " AND a.status IN ('ABSENT', 'EXCLUDED'))"
            + " FOR UPDATE OF e",
        sessionId);
  }

  /** Idempotent release insert (actor+key UNIQUE). Returns release id (new or existing). */
  public String insertRelease(
      String scope, String programId, String sessionId, String actorId, String idempotencyKey) {
    String id = java.util.UUID.randomUUID().toString();
    try {
      jdbc.update(
          "INSERT INTO app.report_releases"
              + " (id, scope, program_id, session_id, actor_id, idempotency_key)"
              + " VALUES (?::uuid, ?, "
              + (programId == null ? "NULL" : "?::uuid") + ", "
              + (sessionId == null ? "NULL" : "?::uuid") + ", "
              + (actorId == null ? "NULL" : "?::uuid") + ", ?)",
          buildArgs(id, scope, programId, sessionId, actorId, idempotencyKey));
      return id;
    } catch (org.springframework.dao.DuplicateKeyException e) {
      // Repeat with same (actor, key): return the prior release.
      Map<String, Object> prior = findReleaseByActorAndKey(actorId, idempotencyKey);
      if (prior != null) {
        return String.valueOf(prior.get("id"));
      }
      throw e;
    }
  }

  private static Object[] buildArgs(
      String id, String scope, String programId, String sessionId, String actorId, String key) {
    java.util.List<Object> args = new java.util.ArrayList<>();
    args.add(id);
    args.add(scope);
    if (programId != null) {
      args.add(programId);
    }
    if (sessionId != null) {
      args.add(sessionId);
    }
    if (actorId != null) {
      args.add(actorId);
    }
    args.add(key);
    return args.toArray();
  }

  public Map<String, Object> findReleaseByActorAndKey(String actorId, String idempotencyKey) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, session_id::text AS sessionId, released_at AS releasedAt"
                + " FROM app.report_releases WHERE actor_id::text = ? AND idempotency_key = ? LIMIT 1",
            actorId, idempotencyKey);
    return rows.isEmpty() ? null : rows.get(0);
  }

  /**
   * Flip exactly the validated eligible set SUBMITTED -&gt; LOCKED, pointing each at
   * its latest revision with a release timestamp. Takes the locked eligible ids so
   * a concurrent SUBMIT between lock and flip cannot leak into this release.
   */
  public int releaseEvaluationsByIds(List<String> evaluationIds) {
    if (evaluationIds == null || evaluationIds.isEmpty()) {
      return 0;
    }
    String placeholders = String.join(",", Collections.nCopies(evaluationIds.size(), "?"));
    return jdbc.update(
        "UPDATE app.evaluations e SET state = 'LOCKED',"
            + " released_revision_id = (SELECT r.id FROM app.evaluation_revisions r"
            + " WHERE r.evaluation_id = e.id ORDER BY r.revision_no DESC LIMIT 1),"
            + " released_at = now(), row_version = row_version + 1, updated_at = now()"
            + " WHERE e.id::text IN (" + placeholders + ") AND e.state = 'SUBMITTED'"
            + " AND e.archived_at IS NULL"
            + " AND NOT EXISTS (SELECT 1 FROM app.session_attendance a"
            + " WHERE a.session_id = e.session_id AND a.student_id = e.student_id"
            + " AND a.status IN ('ABSENT', 'EXCLUDED'))",
        evaluationIds.toArray());
  }

  /**
   * Legacy session-wide flip (same predicate as {@link #lockEligibleEvaluations}).
   * Prefer {@link #releaseEvaluationsByIds} for exact-set releases; kept for
   * backward-compatible callers and tests.
   */
  public int releaseEvaluations(String sessionId) {
    return jdbc.update(
        "UPDATE app.evaluations e SET state = 'LOCKED',"
            + " released_revision_id = (SELECT r.id FROM app.evaluation_revisions r"
            + " WHERE r.evaluation_id = e.id ORDER BY r.revision_no DESC LIMIT 1),"
            + " released_at = now(), row_version = row_version + 1, updated_at = now()"
            + " WHERE e.session_id::text = ? AND e.state = 'SUBMITTED' AND e.archived_at IS NULL"
            + " AND NOT EXISTS (SELECT 1 FROM app.session_attendance a"
            + " WHERE a.session_id = e.session_id AND a.student_id = e.student_id"
            + " AND a.status IN ('ABSENT', 'EXCLUDED'))",
        sessionId);
  }
}
