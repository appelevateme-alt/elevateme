package com.elevateme.common.outbox;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Same-transaction outbox hook (spec §10/§11).
 *
 * <p>All program/session/registration/attendance writes call {@link #emit} inside
 * the same @Transactional business method as the domain write. The insert targets
 * {@code app.outbox_events} (V4) with a deterministic {@code dedupe_key}; the
 * relay worker ({@link OutboxWorker}) publishes with retry + backoff.
 *
 * <p>Best-effort on skeleton DBs (missing table → debug log, never breaks the
 * request path). Callers must still record an {@code audit_event} via
 * {@code AuditService} with (actor, action, entity, requestId) and no PII.
 *
 * <p>TODO hook: wire a real mail/notification sender in OutboxWorker; add TTL +
 * poison-pill alerting. Published edits affecting attendees also create a
 * notification row best-effort (see emitAttendeeNotification).
 */
@Service
public class OutboxService {
  private static final Logger log = LoggerFactory.getLogger(OutboxService.class);

  private final OutboxRepository repo;

  public OutboxService(OutboxRepository repo) {
    this.repo = repo;
  }

  /**
   * Emit an outbox event in the caller's transaction.
   *
   * @param aggregateType e.g. "program", "session", "registration", "attendance"
   * @param aggregateId entity id (text)
   * @param eventType e.g. "PROGRAM_PUBLISHED", "SESSION_CREATED"
   * @param payloadJson small JSON payload (ids only, no PII message text)
   * @param dedupeKey stable dedupe key, e.g. eventType + ":" + aggregateId + ":" + version
   */
  public void emit(
      String aggregateType, String aggregateId, String eventType, String payloadJson, String dedupeKey) {
    try {
      OutboxEvent event = OutboxEvent.of(aggregateType, aggregateId, eventType,
          payloadJson == null ? "{}" : payloadJson);
      repo.appendWithDedupe(event, dedupeKey);
    } catch (UnsupportedOperationException e) {
      log.debug("outbox skipped (skeleton): {}", e.getMessage());
    } catch (Exception e) {
      // Best-effort: outbox must never break the domain write on skeleton/partial DBs.
      log.debug("outbox insert skipped: {}", e.getMessage());
    }
  }

  /**
   * TODO hook: published edits affecting attendees should fan out a notification
   * outbox record per affected scope. Currently emits a single aggregate event;
   * per-recipient notification rows land with the notifications worker.
   */
  public void emitAttendeeNotification(
      String programId, String eventType, String payloadJson, String dedupeKey) {
    emit("program", programId, eventType, payloadJson, dedupeKey);
  }
}
