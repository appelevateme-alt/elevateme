package com.elevateme.notifications;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 4 notifications persistence (V4 {@code app.notifications}).
 *
 * <p>Rules:
 * <ul>
 *   <li>Rows are per-recipient, newest first ({@code created_at DESC}).</li>
 *   <li>Dedupe: UNIQUE(recipient, type, entity, entity_version) — re-emitted domain events use
 *       {@code ON CONFLICT DO NOTHING} so a retry never double-notifies.</li>
 *   <li>{@code read_at} = engagement; re-read is idempotent.</li>
 *   <li>Writes happen in the SAME transaction as the domain write via the outbox pattern
 *       (see {@link com.elevateme.common.outbox.OutboxService}); the relay worker publishes
 *       with retry + backoff (see {@link com.elevateme.common.outbox.OutboxWorker}).</li>
 * </ul>
 */
@Repository
public class NotificationsRepository {
  private final JdbcTemplate jdbc;

  public NotificationsRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Own inbox, newest first. Best-effort empty on skeleton DBs (never breaks /me/*). */
  public List<Map<String, Object>> findForRecipient(String recipientId, int limit) {
    try {
      return jdbc.queryForList(
          "SELECT id::text AS id, type, entity_type AS entityType, entity_id AS entityId,"
              + " entity_version AS entityVersion, payload, read_at AS readAt,"
              + " created_at AS createdAt FROM app.notifications"
              + " WHERE recipient_id::text = ? ORDER BY created_at DESC LIMIT ?",
          recipientId, limit);
    } catch (Exception e) {
      return List.of();
    }
  }

  public Map<String, Object> findById(String notificationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, recipient_id::text AS recipientId, type,"
                + " entity_type AS entityType, entity_id AS entityId,"
                + " entity_version AS entityVersion, payload, read_at AS readAt"
                + " FROM app.notifications WHERE id::text = ? LIMIT 1",
            notificationId);
    return rows.isEmpty() ? null : rows.get(0);
  }

  /**
   * Insert a notification row in the caller's transaction (same-transaction outbox fan-out).
   * Duplicate (recipient, type, entity, version) is ignored — no double-notify on retry.
   */
  public void insertDeduped(
      String recipientId, String type, String entityType, String entityId,
      int entityVersion, String payloadJson) {
    jdbc.update(
        "INSERT INTO app.notifications"
            + " (id, recipient_id, type, entity_type, entity_id, entity_version, payload)"
            + " VALUES (gen_random_uuid(), ?::uuid, ?, ?, ?, ?, ?::jsonb)"
            + " ON CONFLICT (recipient_id, type, entity_type, entity_id, entity_version)"
            + " DO NOTHING",
        recipientId, type, entityType, entityId, entityVersion,
        payloadJson == null ? "{}" : payloadJson);
  }

  /** Idempotent read: sets read_at when unread; re-read is a no-op. Returns rows updated. */
  public int markRead(String notificationId) {
    return jdbc.update(
        "UPDATE app.notifications SET read_at = COALESCE(read_at, now())"
            + " WHERE id::text = ?",
        notificationId);
  }
}
