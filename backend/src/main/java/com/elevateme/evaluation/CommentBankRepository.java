package com.elevateme.evaluation;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Comment bank persistence (no AI): reusable evaluator snippets.
 *
 * <p>Scopes: ADMIN_SHARED (all staff) vs TEACHER_PRIVATE (owner only; Java enforces owner
 * visibility, RLS stays deny-by-default). Archived rows retire without deleting history.
 */
@Repository
public class CommentBankRepository {
  private final JdbcTemplate jdbc;

  public CommentBankRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /** Visible entries: shared + own private (admins see all privates for moderation). */
  public List<Map<String, Object>> findVisible(
      String callerId, boolean isAdmin, String criterionKey) {
    StringBuilder sql =
        new StringBuilder(
            "SELECT id::text AS id, scope, owner_id::text AS ownerId,"
                + " criterion_key AS criterionKey, text FROM app.comment_bank_entries"
                + " WHERE archived_at IS NULL AND (scope = 'ADMIN_SHARED'");
    List<Object> args = new ArrayList<>();
    if (isAdmin) {
      sql.append(" OR scope = 'TEACHER_PRIVATE'");
    } else {
      sql.append(" OR (scope = 'TEACHER_PRIVATE' AND owner_id::text = ?)");
      args.add(callerId);
    }
    sql.append(")");
    if (criterionKey != null && !criterionKey.isBlank()) {
      sql.append(" AND (criterion_key = ? OR criterion_key IS NULL)");
      args.add(criterionKey.trim());
    }
    sql.append(" ORDER BY created_at DESC");
    return jdbc.queryForList(sql.toString(), args.toArray());
  }

  public String insert(String scope, String ownerId, String criterionKey, String text) {
    String id = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.comment_bank_entries (id, scope, owner_id, criterion_key, text)"
            + " VALUES (?::uuid, ?, "
            + (ownerId == null ? "NULL" : "?::uuid") + ", "
            + (criterionKey == null ? "NULL" : "?") + ", ?)",
        buildArgs(id, scope, ownerId, criterionKey, text));
    return id;
  }

  private static Object[] buildArgs(
      String id, String scope, String ownerId, String criterionKey, String text) {
    List<Object> args = new ArrayList<>();
    args.add(id);
    args.add(scope);
    if (ownerId != null) {
      args.add(ownerId);
    }
    if (criterionKey != null) {
      args.add(criterionKey);
    }
    args.add(text);
    return args.toArray();
  }

  public Map<String, Object> findById(String entryId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, scope, owner_id::text AS ownerId,"
                + " criterion_key AS criterionKey, text FROM app.comment_bank_entries"
                + " WHERE id::text = ? AND archived_at IS NULL LIMIT 1",
            entryId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }
}
