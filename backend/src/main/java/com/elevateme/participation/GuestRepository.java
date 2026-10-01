package com.elevateme.participation;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Guest invitation + session persistence (hash-only tokens, scope + expiry).
 *
 * <p>Tokens are NEVER stored raw: {@code token_hash} / {@code session_hash} hold SHA-256 hex only.
 * Expiry default (session end + 7d, program-scoped fallback +30d) is enforced by the DB trigger
 * {@code trg_default_guest_expiry}; Java passes NULL expiry to inherit it and reads back the
 * computed value. Revocation via {@code revoked_at} (NULL = live) is immediate — session
 * validation joins the invitation and rejects revoked/expired rows with no grace window.
 */
@Repository
public class GuestRepository {
  private final JdbcTemplate jdbc;

  public GuestRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Map<String, Object> findSessionMeta(String sessionId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, program_id::text AS programId, ends_at AS endsAt"
                + " FROM app.sessions WHERE id::text = ? LIMIT 1",
            sessionId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public String insertInvitation(
      String scope, String programId, String sessionId, String tokenHash, String createdBy) {
    String id = java.util.UUID.randomUUID().toString();
    // expires_at NULL -> DB trigger defaults to session end+7d (or +30d for program scope).
    jdbc.update(
        "INSERT INTO app.guest_invitations (id, scope, program_id, session_id, token_hash, created_by)"
            + " VALUES (?::uuid, ?, "
            + (programId == null ? "NULL" : "?::uuid") + ", "
            + (sessionId == null ? "NULL" : "?::uuid") + ", ?, ?::uuid)",
        buildArgs(id, scope, programId, sessionId, tokenHash, createdBy));
    return id;
  }

  private static Object[] buildArgs(
      String id, String scope, String programId, String sessionId, String tokenHash, String createdBy) {
    java.util.List<Object> args = new java.util.ArrayList<>();
    args.add(id);
    args.add(scope);
    if (programId != null) {
      args.add(programId);
    }
    if (sessionId != null) {
      args.add(sessionId);
    }
    args.add(tokenHash);
    args.add(createdBy);
    return args.toArray();
  }

  public Map<String, Object> findInvitationByHash(String tokenHash) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, scope, program_id::text AS programId,"
                + " session_id::text AS sessionId, expires_at AS expiresAt,"
                + " revoked_at AS revokedAt FROM app.guest_invitations"
                + " WHERE token_hash = ? LIMIT 1",
            tokenHash);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public Map<String, Object> findInvitationById(String invitationId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, scope, program_id::text AS programId,"
                + " session_id::text AS sessionId, expires_at AS expiresAt,"
                + " revoked_at AS revokedAt FROM app.guest_invitations"
                + " WHERE id::text = ? LIMIT 1",
            invitationId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public int revokeInvitation(String invitationId) {
    return jdbc.update(
        "UPDATE app.guest_invitations SET revoked_at = now(), updated_at = now()"
            + " WHERE id::text = ? AND revoked_at IS NULL",
        invitationId);
  }

  public String insertGuestSession(String invitationId, String sessionHash) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.guest_sessions (id, invitation_id, session_hash)"
            + " VALUES (?::uuid, ?::uuid, ?)",
        id, invitationId, sessionHash);
    return id;
  }

  /** Session + live invitation join (null when unknown/expired/revoked — caller maps to 401). */
  public Map<String, Object> findLiveGuestSession(String sessionHash) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT gs.id::text AS id, gs.invitation_id::text AS invitationId,"
                + " gs.expires_at AS sessionExpiresAt, gi.scope AS scope,"
                + " gi.program_id::text AS programId, gi.session_id::text AS sessionId,"
                + " gi.expires_at AS inviteExpiresAt, gi.revoked_at AS revokedAt"
                + " FROM app.guest_sessions gs JOIN app.guest_invitations gi"
                + " ON gi.id = gs.invitation_id WHERE gs.session_hash = ? LIMIT 1",
            sessionHash);
    return rows.isEmpty() ? null : rows.get(0);
  }

  public void touchGuestSession(String sessionHash) {
    try {
      jdbc.update(
          "UPDATE app.guest_sessions SET last_seen_at = now() WHERE session_hash = ?", sessionHash);
    } catch (Exception ignored) {
      // Best-effort sliding TTL refresh.
    }
  }
}
