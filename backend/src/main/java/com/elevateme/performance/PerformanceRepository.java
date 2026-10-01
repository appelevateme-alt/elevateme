package com.elevateme.performance;

import com.elevateme.common.security.ScopeGuard;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 4 released-only reads (/me/reports, /me/performance, /me/insights).
 * Every method takes authenticatedSubject + studentId and enforces the Phase 1c
 * scoping pattern via {@link ScopeGuard} (self / admin / teacher-linked).
 * Cross-student violations surface as 404 (no enumeration).
 *
 * <p>Rules:
 * <ul>
 *   <li>Only released non-voided (LOCKED + released_revision_id + archived_at IS NULL).</li>
 *   <li>Chronological by session starts_at ASC + evaluation ID ASC (NOT release time).
 *       Same-day sessions stay separate; sessions are never averaged into programs.</li>
 *   <li>Time filter on session starts_at (half-open UTC; display Asia/Colombo).</li>
 *   <li>Reports expose 10 marks + total/1000 + normalized/100 + typed remarks +
 *       correction version, Sound label, evaluator attribution. Staff-private notes
 *       are NEVER included in the payload.</li>
 * </ul>
 */
@Repository
public class PerformanceRepository {
  private final JdbcTemplate jdbc;
  private final ScopeGuard guard;

  public PerformanceRepository(JdbcTemplate jdbc, ScopeGuard guard) {
    this.jdbc = jdbc;
    this.guard = guard;
  }

  /** Filters for /me/performance + /me/insights (all optional, validated upstream). */
  public record Filters(
      String criterion,
      TimeWindow.Window window,
      String programId,
      String subtype,
      String sessionId) {}

  // ------------------------------------------------------------------
  // Reports (released only, full payload, chronological)
  // ------------------------------------------------------------------

  /**
   * Released reports for a student. Scope-checked before any row access.
   *
   * @param authenticatedSubject verified JWT sub (never client-supplied)
   * @param studentId target student profile id
   * @param requestId tracing id (audit on denial, no PII)
   */
  public List<Map<String, Object>> findReleasedReportsForStudent(
      String authenticatedSubject, String studentId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    List<Map<String, Object>> base = findReleasedBase(studentId, null);
    List<Map<String, Object>> out = new ArrayList<>(base.size());
    for (Map<String, Object> row : base) {
      out.add(toReportPayload(row));
    }
    return out;
  }

  /**
   * Single released report. Out-of-scope (including unreleased or another
   * student's row) maps to 404 to avoid enumeration.
   */
  public Map<String, Object> findReleasedReportById(
      String authenticatedSubject, String studentId, String reportId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT e.id::text AS evaluationId, e.session_id::text AS sessionId,"
                + " s.title AS sessionName, p.title AS programName,"
                + " e.program_id::text AS programId, p.subtype AS subtype,"
                + " s.starts_at AS startsAt, e.evaluator_id::text AS evaluatorId,"
                + " COALESCE(ev.full_name, '') AS evaluatorName,"
                + " e.released_revision_id::text AS revisionId,"
                + " r.revision_no AS revisionNo, e.correction_reason AS correctionReason,"
                + " r.correction_reason AS revisionCorrectionReason,"
                + " e.released_at AS releasedAt"
                + " FROM app.evaluations e"
                + " LEFT JOIN app.sessions s ON s.id = e.session_id"
                + " LEFT JOIN app.programs p ON p.id = e.program_id"
                + " LEFT JOIN app.evaluation_revisions r ON r.id = e.released_revision_id"
                + " LEFT JOIN app.profiles ev ON ev.id = e.evaluator_id"
                + " WHERE e.id::text = ? AND e.student_id::text = ?"
                + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
                + " AND e.archived_at IS NULL LIMIT 1",
            reportId, studentId);
    if (rows.isEmpty() || rows.get(0).get("evaluationId") == null) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return toReportPayload(rows.get(0));
  }

  // ------------------------------------------------------------------
  // Performance rows (released, filtered, chronological, never averaged)
  // ------------------------------------------------------------------

  /** Released performance rows for /me/performance (filtered, chronological). */
  public List<Map<String, Object>> findPerformanceRows(
      String authenticatedSubject, String studentId, Filters filters, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    List<Map<String, Object>> base = findReleasedBase(studentId, filters);
    List<Map<String, Object>> out = new ArrayList<>(base.size());
    for (Map<String, Object> row : base) {
      out.add(toPerformanceRow(row));
    }
    return out;
  }

  /** Raw chronological points for insights (released, filtered, with 10 scores each). */
  public List<InsightsService.EvalPoint> findInsightPoints(
      String authenticatedSubject, String studentId, Filters filters, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    List<Map<String, Object>> base = findReleasedBase(studentId, filters);
    List<InsightsService.EvalPoint> out = new ArrayList<>(base.size());
    for (Map<String, Object> row : base) {
      String evalId = String.valueOf(row.get("evaluationId"));
      Object startsAt = row.get("startsAt");
      Instant instant = toInstant(startsAt);
      @SuppressWarnings("unchecked")
      Map<String, Integer> scores = (Map<String, Integer>) row.get("_scoresMap");
      if (scores == null) {
        scores = loadScores(String.valueOf(row.get("revisionId")));
      }
      // Criterion filter narrows the evidence to that criterion for insights copy,
      // but rows still carry all 10 (frontend charts the selected criterion).
      out.add(new InsightsService.EvalPoint(evalId, instant, scores));
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Summary (released-only, chronological, attendance-based programs)
  // ------------------------------------------------------------------

  /**
   * Phase 4 summary support for {@code GET /me/summary} logic.
   *
   * <ul>
   *   <li>Released-only non-voided totals (LOCKED + released_revision_id + archived_at IS NULL),
   *       chronological by session starts_at ASC + evaluation ID ASC (NOT release time).</li>
   *   <li>Distinct programs via attendance (ATTENDED) only — never via evaluation count,
   *       never via registration alone.</li>
   * </ul>
   */
  /** Scope-checked totals used by PerformanceService summary (guard applied here). */
  public List<Integer> findReleasedTotalsChronologicalByStudent(
      String authenticatedSubject, String studentId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    return findReleasedTotalsChronologicalByStudentNoScope(studentId);
  }

  private List<Integer> findReleasedTotalsChronologicalByStudentNoScope(String studentId) {
    try {
      List<Integer> totals =
          jdbc.query(
              "SELECT COALESCE(SUM(sc.score), 0) AS total FROM app.evaluations e"
                  + " JOIN app.evaluation_revisions r ON r.id = e.released_revision_id"
                  + " JOIN app.evaluation_scores sc ON sc.revision_id = r.id"
                  + " LEFT JOIN app.sessions s ON s.id = e.session_id"
                  + " WHERE e.student_id::text = ?"
                  + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
                  + " AND e.archived_at IS NULL"
                  + " GROUP BY e.id, s.starts_at ORDER BY s.starts_at ASC NULLS LAST, e.id ASC",
              (rs, n) -> rs.getInt("total"), studentId);
      return totals == null ? List.of() : totals;
    } catch (Exception e) {
      return List.of();
    }
  }

  /** Distinct program IDs with >=1 ATTENDED session (attendance only). */
  public int countDistinctProgramsAttendedByStudent(
      String authenticatedSubject, String studentId, String requestId) {
    guard.checkStudentRead(authenticatedSubject, studentId, requestId);
    try {
      Integer n =
          jdbc.queryForObject(
              "SELECT COUNT(DISTINCT s.program_id) FROM app.session_attendance a"
                  + " JOIN app.sessions s ON s.id = a.session_id"
                  + " WHERE a.student_id::text = ? AND a.status = 'ATTENDED'",
              Integer.class, studentId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  /** Base released rows (evaluations + session/program/evaluator/revision meta), chronological. */
  private List<Map<String, Object>> findReleasedBase(String studentId, Filters filters) {
    StringBuilder sql = new StringBuilder(
        "SELECT e.id::text AS evaluationId, e.session_id::text AS sessionId,"
            + " s.title AS sessionName, p.title AS programName,"
            + " e.program_id::text AS programId, p.subtype AS subtype,"
            + " s.starts_at AS startsAt, e.evaluator_id::text AS evaluatorId,"
            + " COALESCE(ev.full_name, '') AS evaluatorName,"
            + " e.released_revision_id::text AS revisionId,"
            + " r.revision_no AS revisionNo, e.correction_reason AS correctionReason,"
            + " r.correction_reason AS revisionCorrectionReason,"
            + " e.released_at AS releasedAt"
            + " FROM app.evaluations e"
            + " LEFT JOIN app.sessions s ON s.id = e.session_id"
            + " LEFT JOIN app.programs p ON p.id = e.program_id"
            + " LEFT JOIN app.evaluation_revisions r ON r.id = e.released_revision_id"
            + " LEFT JOIN app.profiles ev ON ev.id = e.evaluator_id"
            + " WHERE e.student_id::text = ?"
            + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
            + " AND e.archived_at IS NULL");
    List<Object> args = new ArrayList<>();
    args.add(studentId);
    if (filters != null) {
      if (filters.programId() != null && !filters.programId().isBlank()) {
        sql.append(" AND e.program_id::text = ?");
        args.add(filters.programId());
      }
      if (filters.subtype() != null && !filters.subtype().isBlank()) {
        sql.append(" AND p.subtype = ?");
        args.add(filters.subtype());
      }
      if (filters.sessionId() != null && !filters.sessionId().isBlank()) {
        sql.append(" AND e.session_id::text = ?");
        args.add(filters.sessionId());
      }
      if (filters.window() != null) {
        sql.append(" AND s.starts_at >= ? AND s.starts_at < ?");
        args.add(java.sql.Timestamp.from(filters.window().startInclusive()));
        args.add(java.sql.Timestamp.from(filters.window().endExclusive()));
      }
    }
    sql.append(" ORDER BY s.starts_at ASC NULLS LAST, e.id ASC");
    List<Map<String, Object>> rows;
    try {
      rows = jdbc.queryForList(sql.toString(), args.toArray());
    } catch (Exception e) {
      // Skeleton/partial DBs: fall back to minimal released list (never break /me/*).
      try {
        rows =
            jdbc.queryForList(
                "SELECT e.id::text AS evaluationId, e.session_id::text AS sessionId,"
                    + " e.released_revision_id::text AS revisionId,"
                    + " e.evaluator_id::text AS evaluatorId, e.released_at AS releasedAt"
                    + " FROM app.evaluations e WHERE e.student_id::text = ?"
                    + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
                    + " ORDER BY e.id ASC",
                studentId);
      } catch (Exception ex) {
        return List.of();
      }
    }
    // Attach 10-score maps (released revision only; blank != zero so missing = incomplete,
    // but released rows are always complete by submit validation).
    for (Map<String, Object> row : rows) {
      Object rev = row.get("revisionId");
      if (rev != null) {
        try {
          row.put("_scoresMap", loadScores(String.valueOf(rev)));
        } catch (Exception ignored) {
          row.put("_scoresMap", Map.of());
        }
      } else {
        row.put("_scoresMap", Map.of());
      }
    }
    return rows;
  }

  private Map<String, Integer> loadScores(String revisionId) {
    List<Map<String, Object>> scoreRows =
        jdbc.queryForList(
            "SELECT criterion_key AS k, score FROM app.evaluation_scores"
                + " WHERE revision_id::text = ?",
            revisionId);
    Map<String, Integer> out = new LinkedHashMap<>();
    for (Map<String, Object> r : scoreRows) {
      Object k = r.get("k");
      Object v = r.get("score");
      if (k != null && v != null) {
        int iv;
        if (v instanceof Number n) {
          iv = n.intValue();
        } else {
          try {
            iv = Integer.parseInt(String.valueOf(v));
          } catch (Exception e) {
            continue;
          }
        }
        out.put(String.valueOf(k), iv);
      }
    }
    return out;
  }

  /** Full report payload: 10 marks + total/1000 + normalized/100 + remarks + version. */
  private Map<String, Object> toReportPayload(Map<String, Object> row) {
    @SuppressWarnings("unchecked")
    Map<String, Integer> scores =
        row.get("_scoresMap") instanceof Map
            ? (Map<String, Integer>) row.get("_scoresMap")
            : Map.of();
    int total = scores.values().stream().mapToInt(Integer::intValue).sum();
    double normalized = total / 10.0;
    // Typed remarks: correction reason is the only typed free-text on released sheets
    // in V3 (no separate remarks column); staff-private notes are never included.
    String correctionReason =
        firstNonBlank(
            row.get("revisionCorrectionReason"), row.get("correctionReason"), "");
    Object revisionNo = row.get("revisionNo");
    int version = revisionNo instanceof Number n ? n.intValue() : 1;
    boolean corrected = version > 1 || !String.valueOf(correctionReason).isBlank();

    List<Map<String, Object>> marks = new ArrayList<>(10);
    for (String key : InsightsService.CRITERION_KEYS) {
      // Sound label MUST stay Sound (never Vocal Delivery) per docs/SCORING.md.
      String label = InsightsService.labelFor(key);
      Integer score = scores.get(key);
      Map<String, Object> mark = new LinkedHashMap<>();
      mark.put("criterionKey", key);
      mark.put("label", label);
      mark.put("score", score);
      marks.add(mark);
    }

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", String.valueOf(row.get("evaluationId")));
    out.put("evaluationId", String.valueOf(row.get("evaluationId")));
    out.put("sessionId", row.get("sessionId") == null ? null : String.valueOf(row.get("sessionId")));
    out.put("sessionName", row.get("sessionName"));
    out.put("programName", row.get("programName"));
    out.put("programId", row.get("programId") == null ? null : String.valueOf(row.get("programId")));
    out.put("starts_at", toIso(row.get("startsAt")));
    out.put("startsAt", toIso(row.get("startsAt")));
    out.put("marks", marks);
    out.put("scores", new LinkedHashMap<>(scores));
    out.put("total", total);
    out.put("normalized", normalized);
    out.put("remarks", "");
    out.put("correctionReason", String.valueOf(correctionReason));
    out.put("correctionVersion", version);
    out.put("revisionNo", version);
    out.put("corrected", corrected);
    out.put("evaluatorId", row.get("evaluatorId") == null ? null : String.valueOf(row.get("evaluatorId")));
    out.put("evaluatorName", row.get("evaluatorName"));
    out.put("releasedAt", toIso(row.get("releasedAt")));
    // NO staff-private notes in payload by construction (no such key is ever put).
    return out;
  }

  /** Performance row: evaluation + session/program + starts_at + 10 scores + total/normalized. */
  private Map<String, Object> toPerformanceRow(Map<String, Object> row) {
    @SuppressWarnings("unchecked")
    Map<String, Integer> scores =
        row.get("_scoresMap") instanceof Map
            ? (Map<String, Integer>) row.get("_scoresMap")
            : Map.of();
    int total = scores.values().stream().mapToInt(Integer::intValue).sum();
    double normalized = total / 10.0;
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("evaluationId", String.valueOf(row.get("evaluationId")));
    out.put("sessionId", row.get("sessionId") == null ? null : String.valueOf(row.get("sessionId")));
    out.put("sessionName", row.get("sessionName"));
    out.put("programName", row.get("programName"));
    out.put("programId", row.get("programId") == null ? null : String.valueOf(row.get("programId")));
    out.put("starts_at", toIso(row.get("startsAt")));
    out.put("startsAt", toIso(row.get("startsAt")));
    out.put("scores", new LinkedHashMap<>(scores));
    out.put("total", total);
    out.put("normalized", normalized);
    return out;
  }

  private static Instant toInstant(Object v) {
    if (v == null) {
      return null;
    }
    if (v instanceof Instant i) {
      return i;
    }
    if (v instanceof java.sql.Timestamp ts) {
      return ts.toInstant();
    }
    if (v instanceof java.util.Date d) {
      return d.toInstant();
    }
    if (v instanceof Number n) {
      return Instant.ofEpochMilli(n.longValue());
    }
    try {
      return Instant.parse(String.valueOf(v));
    } catch (Exception e) {
      return null;
    }
  }

  private static String toIso(Object v) {
    Instant i = toInstant(v);
    return i == null ? null : i.toString();
  }

  private static String firstNonBlank(Object... candidates) {
    for (Object c : candidates) {
      if (c != null && !String.valueOf(c).isBlank() && !"null".equals(String.valueOf(c))) {
        return String.valueOf(c);
      }
    }
    return "";
  }
}
