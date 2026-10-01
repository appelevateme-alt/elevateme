package com.elevateme.common.idempotency;

import com.elevateme.common.security.ConflictException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Idempotency-Key scoped to actor + operation.
 *
 * <p>Contract (spec §10/§11): for POST submit/publish/approve/archive/register/withdraw
 * and PATCH attendance the client sends {@code Idempotency-Key}.
 * Scope = (actorSubject, operation=method+path, key).
 * Same key + same payload hash → return stored response (repeat-safe).
 * Same key + differing payload hash → 409 IDEMPOTENCY_CONFLICT.
 * Different actor or operation MUST NOT collide (scope includes both).
 *
 * <p>Phase 2: in-memory store with 24h TTL eviction (see {@link #evictExpired}).
 * TODO (DB persistence): create {@code app.idempotency_keys
 * (actor_subject text, operation text, idem_key text, payload_hash text,
 * response jsonb, created_at timestamptz DEFAULT now(), PRIMARY KEY (actor_subject, operation, idem_key))}
 * and write it in the same transaction as the business write; alternatively reuse
 * the outbox {@code dedupe_key} (actor|operation|key → payload hash) as the
 * durability anchor. Add a TTL cleanup job (DELETE WHERE created_at &lt; now() - interval '24 hours').
 * In-memory is sufficient for single-instance correctness + pure service tests.
 */
@Service
public class IdempotencyService {
  private static final Logger log = LoggerFactory.getLogger(IdempotencyService.class);

  /** Idempotency window: stored responses expire after 24h (spec repeat-safe window). */
  static final java.time.Duration TTL = java.time.Duration.ofHours(24);

  private final ConcurrentHashMap<String, Entry> store = new ConcurrentHashMap<>();

  private record Entry(String payloadHash, Object response, java.time.Instant createdAt) {
    boolean expired(java.time.Instant now) {
      return createdAt == null || createdAt.plus(TTL).isBefore(now);
    }
  }

  /** Stable scope key: actor + operation + client key. */
  public static String scopeKey(String actor, String operation, String key) {
    return actor + "|" + operation + "|" + key;
  }

  /** SHA-256 hex of the canonical payload string (ids only, no PII beyond ids). */
  public static String hashPayload(String canonical) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] digest = md.digest((canonical == null ? "" : canonical).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      return Integer.toHexString(canonical == null ? 0 : canonical.hashCode());
    }
  }

  /**
   * Execute idempotently. When key is null/blank the action runs directly.
   *
   * @param actor verified subject (never client-supplied id)
   * @param operation e.g. "POST /api/v1/programs/{id}/submit"
   * @param key raw Idempotency-Key header (may be null)
   * @param payloadHash hash of the canonical request payload
   * @param action business write to run once
   * @return stored or fresh response
   * @throws ConflictException with code IDEMPOTENCY_CONFLICT on differing payload
   */
  @SuppressWarnings("unchecked")
  public <T> T execute(
      String actor, String operation, String key, String payloadHash, Supplier<T> action) {
    if (key == null || key.isBlank()) {
      return action.get();
    }
    evictExpiredIfNeeded();
    String scope = scopeKey(actor, operation, key);
    Entry existing = store.get(scope);
    if (existing != null) {
      if (existing.expired(java.time.Instant.now())) {
        store.remove(scope, existing);
      } else {
        if (!existing.payloadHash().equals(payloadHash == null ? "" : payloadHash)) {
          throw new ConflictException("IDEMPOTENCY_CONFLICT",
              "Idempotency-Key already used with a different payload");
        }
        log.debug("idempotency replay actor={} op={}", actor, operation);
        return (T) existing.response();
      }
    }
    T result = action.get();
    store.putIfAbsent(scope,
        new Entry(payloadHash == null ? "" : payloadHash, result, java.time.Instant.now()));
    return result;
  }

  /**
   * Pre-check without executing: throws on differing payload, returns stored response
   * on exact replay, or null when the key is unseen/expired. Callers that need to run the
   * write inside an existing @Transactional should use this + {@link #store}.
   */
  @SuppressWarnings("unchecked")
  public <T> T checkReplay(String actor, String operation, String key, String payloadHash) {
    if (key == null || key.isBlank()) {
      return null;
    }
    evictExpiredIfNeeded();
    Entry existing = store.get(scopeKey(actor, operation, key));
    if (existing == null) {
      return null;
    }
    if (existing.expired(java.time.Instant.now())) {
      store.remove(scopeKey(actor, operation, key), existing);
      return null;
    }
    if (!existing.payloadHash().equals(payloadHash == null ? "" : payloadHash)) {
      throw new ConflictException("IDEMPOTENCY_CONFLICT",
          "Idempotency-Key already used with a different payload");
    }
    return (T) existing.response();
  }

  public void store(String actor, String operation, String key, String payloadHash, Object response) {
    if (key == null || key.isBlank()) {
      return;
    }
    evictExpiredIfNeeded();
    store.putIfAbsent(
        scopeKey(actor, operation, key),
        new Entry(payloadHash == null ? "" : payloadHash, response, java.time.Instant.now()));
  }

  /**
   * TTL cleanup stub: evicts entries older than {@link #TTL} (24h).
   * TODO: when {@code app.idempotency_keys} lands, this becomes
   * {@code DELETE FROM app.idempotency_keys WHERE created_at < now() - interval '24 hours'}
   * (or rely on outbox {@code dedupe_key} retention); wire to a @Scheduled job.
   *
   * @return number of entries evicted
   */
  public int evictExpired() {
    java.time.Instant now = java.time.Instant.now();
    int[] removed = {0};
    store.forEach((k, v) -> {
      if (v.expired(now) && store.remove(k, v)) {
        removed[0]++;
      }
    });
    if (removed[0] > 0) {
      log.debug("idempotency evicted {} expired entries", removed[0]);
    }
    return removed[0];
  }

  private volatile long lastEvictAt = 0;

  private void evictExpiredIfNeeded() {
    // Opportunistic throttle: at most one sweep per minute on the hot path.
    long now = System.currentTimeMillis();
    if (now - lastEvictAt > 60_000) {
      lastEvictAt = now;
      evictExpired();
    }
  }

  /** Visible for tests. */
  Map<String, Entry> snapshot() {
    return Map.copyOf(store);
  }

  void clear() {
    store.clear();
  }
}
