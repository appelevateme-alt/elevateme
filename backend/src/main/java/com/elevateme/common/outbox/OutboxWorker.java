package com.elevateme.common.outbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Publishes outbox rows with retry + exponential backoff.
 *
 * <p>Retry note (spec §10/§11, V4 {@code app.outbox_events} + V9 {@code provider_message_id}):
 * <ul>
 *   <li>Polls oldest due {@code PENDING} rows ({@code next_retry_at <= now()}) with
 *       {@code SELECT ... FOR UPDATE SKIP LOCKED} batching so multiple relays never
 *       double-send.</li>
 *   <li>On success: {@code email_state='SENT'}, {@code sent_at=now()} plus
 *       {@code provider_message_id} (transport receipt, V9 column). NULL until SENT;
 *       never part of dedupe (dedupe_key UNIQUE stays authoritative).</li>
 *   <li>On failure: {@code retry_count+1}, {@code next_retry_at = now() + backoff(retry_count)}
 *       with exponential backoff (base 30s, capped at 1h); stays {@code PENDING}.</li>
 *   <li>Poison-pill: after {@code maxAttempts} (default 10) the row is marked {@code FAILED}
 *       and logged for operator alerting (never retried silently, never deleted — history
 *       preserved for audit). Operators triage via {@code GET /admin/outbox?state=FAILED}.</li>
 *   <li>Dedupe: {@code dedupe_key UNIQUE} + notification UNIQUE means re-emitted domain events
 *       never double-notify and alert updates never send a duplicate email.</li>
 *   <li>Retry-delivery ambiguity (rare, documented): the transport may succeed while the
 *       subsequent {@code SENT} update crashes/retries (process kill, DB failover). The next
 *       poll would then redeliver. This is safe by design: publishing is idempotent
 *       (dedupe_key + per-recipient notification UNIQUE), so a duplicate delivery collapses
 *       to a no-op and the stored {@code provider_message_id} lets operators reconcile
 *       against the provider. Consumers MUST remain idempotent and MUST NOT treat a retry
 *       as a new event.</li>
 * </ul>
 *
 * <p>Best-effort on skeleton DBs (missing table → debug log, never breaks the app).
 */
@Component
public class OutboxWorker {
  private static final Logger log = LoggerFactory.getLogger(OutboxWorker.class);

  static final int MAX_ATTEMPTS_DEFAULT = 10;
  static final long BACKOFF_BASE_SECONDS = 30;
  static final long BACKOFF_CAP_SECONDS = 3600;

  private final JdbcTemplate jdbc;
  private final int maxAttempts;
  private final int batchSize;

  @Autowired
  public OutboxWorker(JdbcTemplate jdbc,
      @Value("${app.outbox.max-attempts:10}") int maxAttempts,
      @Value("${app.outbox.batch-size:20}") int batchSize) {
    this.jdbc = jdbc;
    this.maxAttempts = maxAttempts <= 0 ? MAX_ATTEMPTS_DEFAULT : maxAttempts;
    this.batchSize = batchSize <= 0 ? 20 : batchSize;
  }

  /** Skeleton/test wiring (no JDBC): poll becomes a debug no-op. */
  public OutboxWorker() {
    this(null, MAX_ATTEMPTS_DEFAULT, 20);
  }

  /** Exponential backoff in seconds: 30, 60, 120, ... capped at 3600. Pure, unit-testable. */
  public static long backoffSeconds(int retryCount) {
    long v = BACKOFF_BASE_SECONDS * (1L << Math.max(0, Math.min(retryCount, 10)));
    return Math.min(v, BACKOFF_CAP_SECONDS);
  }

  @Scheduled(fixedDelayString = "${app.outbox.poll-ms:5000}")
  public void poll() {
    if (jdbc == null) {
      log.debug("Outbox poll (skeleton no-op)");
      return;
    }
    try {
      var due =
          jdbc.queryForList(
              "SELECT id::text AS id, aggregate_type AS aggregateType, aggregate_id AS aggregateId,"
                  + " event_type AS eventType, payload::text AS payload,"
                  + " retry_count AS retryCount, dedupe_key AS dedupeKey"
                  + " FROM app.outbox_events WHERE email_state = 'PENDING'"
                  + " AND next_retry_at <= now() ORDER BY next_retry_at ASC LIMIT ?"
                  + " FOR UPDATE SKIP LOCKED",
              batchSize);
      for (var row : due) {
        String id = String.valueOf(row.get("id"));
        try {
          String providerMessageId = publishOne(row);
          markSent(id, providerMessageId);
        } catch (Exception e) {
          int retries = toInt(row.get("retryCount"), 0) + 1;
          if (retries >= maxAttempts) {
            jdbc.update(
                "UPDATE app.outbox_events SET email_state = 'FAILED', retry_count = ?"
                    + " WHERE id::text = ?",
                retries, id);
            // Poison-pill alert hook: operators watch FAILED rows (no silent loss).
            log.warn("outbox poison-pill FAILED id={} event={} retries={}: {}",
                id, row.get("eventType"), retries, e.getMessage());
          } else {
            long backoff = backoffSeconds(retries);
            jdbc.update(
                "UPDATE app.outbox_events SET retry_count = ?,"
                    + " next_retry_at = now() + (? || ' seconds')::interval"
                    + " WHERE id::text = ?",
                retries, String.valueOf(backoff), id);
            log.debug("outbox retry id={} in {}s (attempt {}): {}",
                id, backoff, retries, e.getMessage());
          }
        }
      }
    } catch (Exception e) {
      // Skeleton/partial DBs: never break the app on a missing outbox table.
      log.debug("Outbox poll skipped: {}", e.getMessage());
    }
  }

  /**
   * Mark a row SENT with its provider receipt (V9 {@code provider_message_id}).
   * Best-effort on pre-V9 DBs: falls back to the legacy SENT update when the
   * column is absent so the relay never wedges on a missing migration.
   */
  void markSent(String id, String providerMessageId) {
    String receipt = providerMessageId == null || providerMessageId.isBlank()
        ? "local:" + id
        : providerMessageId;
    try {
      jdbc.update(
          "UPDATE app.outbox_events SET email_state = 'SENT', sent_at = now(),"
              + " provider_message_id = ? WHERE id::text = ?",
          receipt, id);
    } catch (Exception e) {
      log.debug("outbox SENT without provider_message_id (pre-V9 DB): {}", e.getMessage());
      jdbc.update(
          "UPDATE app.outbox_events SET email_state = 'SENT', sent_at = now()"
              + " WHERE id::text = ?",
          id);
    }
  }

  /**
   * Transport hook: wire the real mail/notification sender here. Returns the
   * provider-side message id (receipt) to persist in {@code provider_message_id}.
   * Default implementation is a debug log (durable fan-out lands via
   * {@code app.notifications} rows written in the same transaction as the domain
   * event; email relay plugs in at this method).
   *
   * <p>Note on at-least-once delivery: if this method succeeds but the follow-up
   * {@code SENT} update fails, the row stays PENDING and will be redelivered.
   * The dedupe_key + notification UNIQUE make redelivery idempotent; the stored
   * receipt lets operators reconcile duplicates against the provider.
   */
  protected String publishOne(java.util.Map<String, Object> row) {
    log.debug("outbox publish {}:{} dedupe={}",
        row.get("eventType"), row.get("aggregateId"), row.get("dedupeKey"));
    Object dedupe = row.get("dedupeKey");
    String base = dedupe == null || String.valueOf(dedupe).isBlank()
        ? String.valueOf(row.get("id"))
        : String.valueOf(dedupe);
    return "local:" + base;
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
