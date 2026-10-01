package com.elevateme.common.outbox;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Outbox persistence. Call {@code append*} inside the same @Transactional business method
 * as the domain write (same-transaction rule). Worker publishes with retry/backoff.
 */
@Repository
public class OutboxRepository {
  private final JdbcTemplate jdbc;

  public OutboxRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void append(OutboxEvent event) {
    appendWithDedupe(event, event.type() + ":" + event.aggregateId() + ":" + event.id());
  }

  /**
   * Insert into {@code app.outbox_events} with an explicit dedupe_key.
   * Duplicate dedupe_key is ignored (ON CONFLICT DO NOTHING) so re-emitted
   * domain events do not double-notify. Best-effort: missing table on
   * skeleton DBs surfaces as an exception for OutboxService to swallow.
   */
  public void appendWithDedupe(OutboxEvent event, String dedupeKey) {
    jdbc.update(
        "INSERT INTO app.outbox_events "
            + "(id, aggregate_type, aggregate_id, event_type, payload, dedupe_key) "
            + "VALUES (?::uuid, ?, ?, ?, ?::jsonb, ?) ON CONFLICT (dedupe_key) DO NOTHING",
        event.id().toString(),
        event.aggregateType(),
        event.aggregateId(),
        event.type(),
        event.payloadJson(),
        dedupeKey);
  }

  /**
   * Admin triage read: latest rows by state (PENDING|SENT|FAILED|SKIPPED).
   * Returns ids + transport state + retry/backoff + provider receipt; payload
   * is ids-only per {@link OutboxService} (no PII message text).
   */
  public java.util.List<java.util.Map<String, Object>> listByState(String state, int limit) {
    String norm = state == null || state.isBlank() ? "FAILED" : state.trim().toUpperCase();
    if (!java.util.Set.of("PENDING", "SENT", "FAILED", "SKIPPED").contains(norm)) {
      throw new IllegalArgumentException("Unknown outbox state: " + state + " (expected PENDING|SENT|FAILED|SKIPPED)");
    }
    int safeLimit = Math.max(1, Math.min(limit <= 0 ? 100 : limit, 200));
    try {
      return jdbc.queryForList(
          "SELECT id::text AS id, aggregate_type AS aggregateType, aggregate_id AS aggregateId,"
              + " event_type AS eventType, email_state AS state, retry_count AS retryCount,"
              + " next_retry_at AS nextRetryAt, provider_message_id AS providerMessageId,"
              + " sent_at AS sentAt, created_at AS createdAt"
              + " FROM app.outbox_events WHERE email_state = ?"
              + " ORDER BY created_at DESC LIMIT ?",
          norm, safeLimit);
    } catch (Exception e) {
      // Pre-V9 DBs lack provider_message_id: retry without the receipt column.
      return jdbc.queryForList(
          "SELECT id::text AS id, aggregate_type AS aggregateType, aggregate_id AS aggregateId,"
              + " event_type AS eventType, email_state AS state, retry_count AS retryCount,"
              + " next_retry_at AS nextRetryAt, NULL AS providerMessageId,"
              + " sent_at AS sentAt, created_at AS createdAt"
              + " FROM app.outbox_events WHERE email_state = ?"
              + " ORDER BY created_at DESC LIMIT ?",
          norm, safeLimit);
    }
  }
}
