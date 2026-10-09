package com.diplomaticimpact.access;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class AccessRepositoryTest {
  @Test
  void sessionLockUsesTransactionAdvisoryLockWithoutSessionUpdateRights() {
    var database = new RecordingJdbcTemplate();
    var repository = new AccessRepository(database, new ObjectMapper());
    var sessionId = UUID.fromString("30000000-0000-0000-0000-000000000001");

    repository.lockSession(sessionId);

    assertEquals(List.of(
        "SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))",
        "SELECT id FROM public.sessions WHERE id=?"
    ), database.statements);
    assertArrayEquals(new Object[] { sessionId.toString() }, database.arguments.get(0));
    assertArrayEquals(new Object[] { sessionId }, database.arguments.get(1));
    assertTrue(database.statements.stream().noneMatch(sql -> sql.contains("FOR UPDATE")));
  }

  private static final class RecordingJdbcTemplate extends JdbcTemplate {
    private final List<String> statements = new ArrayList<>();
    private final List<Object[]> arguments = new ArrayList<>();

    @Override
    public List<Map<String, Object>> queryForList(String sql, Object... args) {
      statements.add(sql);
      arguments.add(args);
      if (sql.startsWith("SELECT id FROM public.sessions")) {
        return List.of(Map.of("id", args[0]));
      }
      return List.of(Map.of("lock_acquired", true));
    }
  }
}
