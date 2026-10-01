package com.elevateme.common.outbox;

import java.time.Instant;
import java.util.UUID;

/**
 * Outbox envelope. TODO(revamp): persist in the SAME transaction as the business write
 * (insert into outbox table alongside domain insert/update); worker publishes with
 * retry + exponential backoff; mark published atomically; poison-pill handling.
 */
public record OutboxEvent(
    UUID id, String aggregateType, String aggregateId, String type, String payloadJson, Instant createdAt) {
  public static OutboxEvent of(String aggregateType, String aggregateId, String type, String payloadJson) {
    return new OutboxEvent(UUID.randomUUID(), aggregateType, aggregateId, type, payloadJson, Instant.now());
  }
}
