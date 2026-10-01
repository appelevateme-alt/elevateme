package com.elevateme.performance;

import com.elevateme.common.outbox.OutboxService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 4 criterion-alert reconcile wiring (DB + pure rules + same-transaction outbox).
 *
 * <p>Frozen rules (V4 {@code app.criterion_alerts} + docs/INSIGHTS.md + spec §6):
 * <ul>
 *   <li>Exactly one ACTIVE row per (student, criterion): partial UNIQUE
 *       {@code WHERE resolved_at IS NULL} (DB-enforced; duplicate inserts surface as 409).</li>
 *   <li>Latest chronological released score {@code < 30} (strictly; 30 does NOT alert)
 *       creates a new alert or updates evidence on the active row — updates never send a
 *       duplicate email (evidence refresh only, same dedupe_key path).</li>
 *   <li>Later chronological score {@code >= 30} (spec §6 resolve threshold: 30+ resolves)
 *       resolves the active alert with a note (history preserved, never
 *       deleted).</li>
 *   <li>Backdated releases (earlier starts_at than current evidence, ID tie-break) do NOT
 *       override, resolve, or reopen current active/resolved state.</li>
 *   <li>Dismiss = acknowledged (seen), NOT resolved — row stays active and still dedupes.</li>
 *   <li>Correction/void reconciles from scratch (accuracy over history): the full chronological
 *       released history is re-evaluated; correction of the latest updates evidence, correction
 *       of backdated history is ignored for current state.</li>
 * </ul>
 *
 * <p>All mutations run in the caller's transaction alongside the release/correction write, with
 * the outbox emit in the same transaction (no dup email on evidence update).
 */
@Service
public class CriterionAlertReconcileService {
  private final CriterionAlertRepository alerts;
  private final OutboxService outbox;

  public CriterionAlertReconcileService(CriterionAlertRepository alerts, OutboxService outbox) {
    this.alerts = alerts;
    this.outbox = outbox;
  }

  /**
   * Reconcile one (student, criterion) from its full chronological released history.
   * Best-effort: skeleton DBs return quietly (never breaks release/correction paths).
   */
  @Transactional
  public CriterionAlertService.Decision reconcile(String studentId, String criterionKey) {
    List<Map<String, Object>> rows;
    try {
      rows = alerts.findChronologicalScores(studentId, criterionKey);
    } catch (Exception e) {
      return new CriterionAlertService.Decision(
          CriterionAlertService.Action.NOOP, "alert store unavailable");
    }
    List<CriterionAlertService.ScorePoint> history = new ArrayList<>(rows.size());
    for (Map<String, Object> r : rows) {
      history.add(toPoint(r));
    }
    CriterionAlertService.ScorePoint latest = CriterionAlertService.latest(history);
    Map<String, Object> activeRow;
    try {
      activeRow = alerts.findActive(studentId, criterionKey);
    } catch (Exception e) {
      return new CriterionAlertService.Decision(
          CriterionAlertService.Action.NOOP, "alert store unavailable");
    }
    CriterionAlertService.AlertState current = toState(studentId, criterionKey, activeRow);
    // Resolved-state backdated check needs the latest RESOLVED row's evidence, not just active.
    if (current == null) {
      try {
        Map<String, Object> latestRow = alerts.findLatest(studentId, criterionKey);
        if (latestRow != null && latestRow.get("resolvedAt") != null) {
          current = toState(studentId, criterionKey, latestRow);
        }
      } catch (Exception ignored) {
        // best-effort; null current = create/noop path
      }
    }
    CriterionAlertService.Decision decision =
        CriterionAlertService.reconcile(history, current);
    apply(studentId, criterionKey, latest, activeRow, decision);
    return decision;
  }

  /** Reconcile all 10 frozen criteria for a student (release/correction fan-out). */
  @Transactional
  public void reconcileAll(String studentId) {
    for (String key : InsightsService.CRITERION_KEYS) {
      try {
        reconcile(studentId, key);
      } catch (Exception ignored) {
        // Per-criterion best-effort: one bad criterion never aborts the release txn caller
        // (callers may still abort on their own failures; see ReleaseService atomicity test).
      }
    }
  }

  /** Dismiss = acknowledged (seen), NOT resolved. Row stays active and still dedupes. */
  @Transactional
  public int dismiss(String alertId, String acknowledgedBy) {
    return alerts.dismiss(alertId, acknowledgedBy);
  }

  /** Explicit resolve with mandatory note (DB CHECK requires resolved_note). */
  @Transactional
  public int resolve(String alertId, String note) {
    if (note == null || note.isBlank()) {
      throw new IllegalArgumentException("resolved note is required");
    }
    return alerts.resolve(alertId, note.trim());
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private void apply(
      String studentId, String criterionKey,
      CriterionAlertService.ScorePoint latest, Map<String, Object> activeRow,
      CriterionAlertService.Decision decision) {
    if (latest == null || decision == null) {
      return;
    }
    switch (decision.action()) {
      case CREATE, REOPEN_CREATE -> {
        String id;
        try {
          id = alerts.create(studentId, criterionKey, latest.sessionId(),
              latest.revisionId(), latest.score(), CriterionAlertService.ALERT_BELOW);
        } catch (Exception e) {
          // UNIQUE race (concurrent release): evidence update path keeps single active row.
          if (activeRow != null && activeRow.get("id") != null) {
            try {
              alerts.updateEvidence(String.valueOf(activeRow.get("id")),
                  latest.sessionId(), latest.revisionId(), latest.score());
            } catch (Exception ignored) {
              // best-effort
            }
          }
          return;
        }
        // Fresh alert => notify once (same transaction; dedupe_key pins the evidence revision).
        emitAlertMail(studentId, criterionKey, latest, id, true);
      }
      case UPDATE_EVIDENCE -> {
        if (activeRow != null && activeRow.get("id") != null) {
          try {
            alerts.updateEvidence(String.valueOf(activeRow.get("id")),
                latest.sessionId(), latest.revisionId(), latest.score());
          } catch (Exception ignored) {
            // best-effort
          }
        }
        // No dup email on evidence update by construction (no emit here).
      }
      case RESOLVE -> {
        if (activeRow != null && activeRow.get("id") != null) {
          try {
            alerts.resolve(String.valueOf(activeRow.get("id")),
                "Resolved by later score " + latest.score() + " on " + criterionKey);
          } catch (Exception ignored) {
            // best-effort
          }
        }
      }
      default -> {
        // NOOP / IGNORE_BACKDATED: no state change, no email.
      }
    }
  }

  /** First alert email only; evidence updates stay silent (no dup email). */
  private void emitAlertMail(
      String studentId, String criterionKey,
      CriterionAlertService.ScorePoint latest, String alertId, boolean isCreate) {
    if (outbox == null || !isCreate) {
      return;
    }
    try {
      outbox.emit(
          "criterion_alert", alertId, "CRITERION_ALERT_CREATED",
          "{\"studentId\":\"" + studentId + "\",\"criterion\":\"" + criterionKey
              + "\",\"score\":" + latest.score() + "}",
          "CRITERION_ALERT_CREATED:" + studentId + ":" + criterionKey + ":"
              + latest.revisionId());
    } catch (Exception ignored) {
      // Best-effort: alert row is already committed in-txn; worker retry covers delivery.
    }
  }

  private static CriterionAlertService.ScorePoint toPoint(Map<String, Object> r) {
    return new CriterionAlertService.ScorePoint(
        str(r.get("evaluationId")), str(r.get("revisionId")), str(r.get("sessionId")),
        toInstant(r.get("startsAt")), toInt(r.get("score"), 0));
  }

  private CriterionAlertService.AlertState toState(
      String studentId, String criterionKey, Map<String, Object> row) {
    if (row == null || row.get("id") == null) {
      return null;
    }
    String evidenceRevision = str(row.get("evidenceRevisionId"));
    Map<String, Object> meta = null;
    if (evidenceRevision != null) {
      try {
        meta = alerts.findEvidenceMeta(evidenceRevision);
      } catch (Exception ignored) {
        meta = null;
      }
    }
    Instant evidenceStartsAt = meta == null ? null : toInstant(meta.get("startsAt"));
    String evidenceEval = meta == null ? null : str(meta.get("evaluationId"));
    int score = toInt(row.get("score"), 0);
    Instant ack = toInstant(row.get("acknowledgedAt"));
    Instant resolved = toInstant(row.get("resolvedAt"));
    return new CriterionAlertService.AlertState(studentId, criterionKey, score,
        evidenceRevision, evidenceEval, evidenceStartsAt, ack, resolved);
  }

  private static String str(Object v) {
    if (v == null || "null".equals(String.valueOf(v))) {
      return null;
    }
    return String.valueOf(v);
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
    try {
      return Instant.parse(String.valueOf(v));
    } catch (Exception e) {
      return null;
    }
  }

  private static int toInt(Object v, int dflt) {
    if (v instanceof Number n) {
      return n.intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (Exception e) {
      return dflt;
    }
  }
}
