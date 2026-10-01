package com.elevateme.notifications;

import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 4 notifications: subject-scoped reads; read marks own only.
 *
 * <p>Same-transaction outbox rule (spec §10/§11): domain writes that notify (report release,
 * correction, alert create) insert the {@code app.notifications} row AND the
 * {@code app.outbox_events} row in the SAME {@code @Transactional} business method. The relay
 * worker ({@link com.elevateme.common.outbox.OutboxWorker}) publishes with retry + exponential
 * backoff; dedupe keys / UNIQUE constraints make retries safe (no dup email, no double-notify).
 */
@Service
public class NotificationsService {
  private final AuthContext auth;
  private final NotificationsRepository repo;
  private final ScopeGuard guard;
  private final OutboxService outbox;

  @Autowired
  public NotificationsService(
      AuthContext auth, NotificationsRepository repo, ScopeGuard guard, OutboxService outbox) {
    this.auth = auth;
    this.repo = repo;
    this.guard = guard;
    this.outbox = outbox;
  }

  /** Legacy wiring (tests/skeleton): repo-only behavior with caller-supplied subject. */
  public NotificationsService(AuthContext auth) {
    this(auth, null, null, null);
  }

  /** Resolve caller's own profile id (recipient id) from verified subject. */
  public String ownRecipientId(String authenticatedSubject) {
    if (guard == null) {
      return authenticatedSubject;
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    return caller == null ? authenticatedSubject : caller.id();
  }

  /** Own inbox, newest first (default cap 50). */
  public List<Map<String, Object>> listOwn(String authenticatedSubject, int limit) {
    String recipientId = ownRecipientId(authenticatedSubject);
    return repo.findForRecipient(recipientId, limit <= 0 ? 50 : limit);
  }

  /**
   * Mark own notification read. Cross-user ids map to 404 (no enumeration); re-read is
   * idempotent (read_at kept on first read).
   */
  @Transactional
  public Map<String, Object> markRead(String authenticatedSubject, String notificationId) {
    String recipientId = ownRecipientId(authenticatedSubject);
    Map<String, Object> row = repo.findById(notificationId);
    if (row == null || !recipientId.equals(String.valueOf(row.get("recipientId")))) {
      throw new ResourceNotFoundException("Not found");
    }
    repo.markRead(notificationId);
    Map<String, Object> updated = repo.findById(notificationId);
    return updated == null ? row : updated;
  }

  /**
   * Same-transaction fan-out: notification row + outbox event in the caller's transaction.
   * Retries are deduped (UNIQUE recipient/type/entity/version + outbox dedupe_key), so an
   * alert update never sends a duplicate email — evidence refresh only.
   */
  @Transactional
  public void notify(
      String recipientId, String type, String entityType, String entityId,
      int entityVersion, String payloadJson, String dedupeKey) {
    repo.insertDeduped(recipientId, type, entityType, entityId, entityVersion, payloadJson);
    if (outbox != null) {
      outbox.emit(entityType, entityId, type,
          payloadJson == null ? "{}" : payloadJson,
          dedupeKey == null ? type + ":" + entityId + ":" + entityVersion : dedupeKey);
    }
  }

  public String currentSubject() {
    return auth.currentSubject();
  }
}
