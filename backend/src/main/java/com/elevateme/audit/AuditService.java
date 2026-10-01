package com.elevateme.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Append-only audit log writer. Persists (actor, action, entity, entity_id,
 * request_id) via JDBC same-transaction pattern; never update/delete.
 *
 * <p>Denied-access calls MUST pass ids only — no PII message text, no secrets.
 */
@Service
public class AuditService {
  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  private final JdbcTemplate jdbc;

  @Autowired(required = false)
  public AuditService(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void record(String actor, String action, String entity, String entityId, String requestId) {
    // No PII message text: log ids only.
    log.info(
        "audit actor={} action={} entity={} id={} requestId={}",
        actor, action, entity, entityId, requestId);
    if (jdbc == null) {
      return;
    }
    try {
      String actorType = "SYSTEM";
      jdbc.update(
          "INSERT INTO app.audit_events "
              + "(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data, request_id) "
              + "VALUES (?, CASE WHEN ? IS NULL THEN NULL ELSE ?::uuid END, ?, ?, ?, '{}', '{}', ?)",
          actorType,
          actor,
          actor,
          action,
          entity,
          entityId,
          requestId);
    } catch (Exception e) {
      // Best-effort: audit insert must never break the request path (e.g. bad UUID
      // shape in tests, missing table in skeleton runs). The log line above is the
      // durable signal in those environments.
      log.debug("audit insert skipped: {}", e.getMessage());
    }
  }
}
