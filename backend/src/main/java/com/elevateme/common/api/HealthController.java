package com.elevateme.common.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Readiness probe. Contract path is /api/health (DB check included).
 * TODO: fail closed (503) when Flyway pending or DB unreachable.
 */
@RestController
@RequestMapping("/api")
public class HealthController {
  private final JdbcTemplate jdbc;

  public HealthController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @GetMapping("/health")
  public ResponseEntity<Map<String, String>> health(HttpServletRequest req) {
    try {
      jdbc.queryForObject("SELECT 1", Integer.class);
    } catch (Exception e) {
      return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
    }
    return ResponseEntity.ok(Map.of("status", "UP"));
  }
}
