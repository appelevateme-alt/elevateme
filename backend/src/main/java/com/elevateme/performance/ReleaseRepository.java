package com.elevateme.performance;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 3 release persistence: preview counts, row locking, idempotent release insert.
 *
 * <p>Releasing is atomic (single transaction in {@link ReleaseService}): preview counts -&gt;
 * lock eligible -&gt; insert release -&gt; flip evaluations -&gt; outbox per recipient. Absent /
 * excluded attendance is excluded with reason (never released as zero).
 */
@Repository
public class ReleaseRepository {
  private final JdbcTemplate jdbc;

  public ReleaseRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** SUBMITTED (releasable) evaluations in the session. */
  public int countSubmitted(String sessionId) {
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM app.evaluations WHERE session_id::text = ? AND state = 'SUBMITTED'"
                  + " AND archived_at IS NULL",
              Integer.class, sessionId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Expected = live assignments (UNIQUE student+session) in the session. */
  public int countExpected(String sessionId) {
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM app.evaluation_assignments WHERE session_id::text = ?"
                  + " AND archived_at IS NULL",
              Integer.class, sessionId);
      if (n != null && n > 0) {
        return n;
      }
    } catch (Exception ignored) {
      // fall through to registrations fallback
    }
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM app.registrations WHERE (session_id::text = ?"
                  + " OR session_id IS NULL) AND archived_at IS NULL",
              Integer.class, sessionId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Already LOCKED (released) evaluations in the session. */
  public int countReleased(String sessionId) {
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM app.evaluations WHERE session_id::text = ? AND state = 'LOCKED'"
                  + " AND archived_at IS NULL",
              Integer.class, sessionId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  /** Absent/excluded attendance rows (excluded from release, reason required for EXCLUDED). */
  public List<Map<String, Object>> findExcludedWithReason(String sessionId) {
    try {
      return jdbc.queryForList(
          "SELECT student_id::text AS studentId, status, reason FROM app.session_attendance"
              + " WHERE session_id::text = ? AND status IN ('ABSENT', 'EXCLUDED')",
          sessionId);
    } catch (Exception e) {
      return List.of();
    }
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

  /** Flip eligible evaluations SUBMITTED -> LOCKED, pointing at their latest revision. */
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
