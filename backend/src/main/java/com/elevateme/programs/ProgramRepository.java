package com.elevateme.programs;

import com.elevateme.common.security.ScopeGuard;
import java.sql.Array;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Phase 2 JDBC: programs lifecycle + sessions. All methods are called from
 * {@link ProgramsService} inside @Transactional boundaries (same-transaction
 * outbox + audit). Ownership checks live in the service via ScopeGuard.
 *
 * <p>V6 columns (starts_at, ends_at, registration_*, location, eligibility) are
 * used when present; every read degrades gracefully on pre-V6 DBs (skeleton
 * boot with only the placeholder keeps working — writes fall back to the V2
 * column set).
 */
@Repository
public class ProgramRepository {
  private final JdbcTemplate jdbc;
  private final ScopeGuard guard;

  public ProgramRepository(JdbcTemplate jdbc, ScopeGuard guard) {
    this.jdbc = jdbc;
    this.guard = guard;
  }

  // ------------------------------------------------------------------
  // Programs
  // ------------------------------------------------------------------

  public Map<String, Object> findProgramById(String programId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, title, lifecycle, owner_id::text AS ownerId "
                + "FROM app.programs WHERE id::text = ? LIMIT 1",
            programId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  /** Full projection for lifecycle guards + optimistic locking. */
  public Map<String, Object> findProgramFullById(String programId) {
    // Tiered by migration level: V7 column set → V6 set → V2 set (skeleton DBs).
    try {
      List<Map<String, Object>> rows =
          jdbc.queryForList(
              "SELECT id::text AS id, slug, title, description, program_type AS type,"
                  + " subtype, themes, visibility, lifecycle, row_version AS version,"
                  + " owner_id::text AS ownerId, capacity,"
                  + " starts_at AS startsAt, ends_at AS endsAt,"
                  + " registration_opens_at AS registrationOpensAt,"
                  + " registration_deadline AS registrationDeadline,"
                  + " location, venue, eligibility, institute_id::text AS instituteId"
                  + " FROM app.programs WHERE id::text = ? LIMIT 1",
              programId);
      if (rows.isEmpty()) {
        throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
      }
      return rows.get(0);
    } catch (org.springframework.jdbc.BadSqlGrammarException e1) {
      try {
        List<Map<String, Object>> rows =
            jdbc.queryForList(
                "SELECT id::text AS id, slug, title, description, program_type AS type,"
                    + " subtype, themes, visibility, lifecycle, row_version AS version,"
                    + " owner_id::text AS ownerId, capacity, venue,"
                    + " starts_at AS startsAt, registration_deadline AS registrationDeadline"
                    + " FROM app.programs WHERE id::text = ? LIMIT 1",
                programId);
        if (rows.isEmpty()) {
          throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
        }
        return rows.get(0);
      } catch (org.springframework.jdbc.BadSqlGrammarException e2) {
        List<Map<String, Object>> rows =
            jdbc.queryForList(
                "SELECT id::text AS id, slug, title, description, program_type AS type,"
                    + " subtype, themes, visibility, lifecycle, row_version AS version,"
                    + " owner_id::text AS ownerId, capacity, venue"
                    + " FROM app.programs WHERE id::text = ? LIMIT 1",
                programId);
        if (rows.isEmpty()) {
          throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
        }
        return rows.get(0);
      }
    }
  }

  // ------------------------------------------------------------------
  // Browse (list/get): visibility filter lives in ProgramsService via ScopeGuard.
  // Public slice = PUBLISHED + PUBLIC standard only (excludes targeted
  // development backing rows); owner sees own + public; admin sees all.
  // Stable pagination: ORDER BY created_at DESC, id ASC, 10/page.
  // Search: title/description ILIKE. Filters: theme (canonical 4), type
  // (SingleEvent|Continuous|Special), subtype (MUN|Debate|Competition|Special).
  // ------------------------------------------------------------------

  private static final String LIST_PROJECTION =
      "p.id::text AS id, p.slug, p.title, p.description, p.program_type AS type,"
          + " p.subtype, p.themes, p.lifecycle, p.visibility,"
          + " p.owner_id::text AS ownerId, p.capacity,"
          + " p.registered_count AS registeredCount";

  private static List<String> typeVariants(String dbType) {
    if (dbType == null) {
      return List.of();
    }
    return switch (dbType) {
      case "SINGLE_EVENT" -> List.of("SINGLE_EVENT", "SingleEvent");
      case "CONTINUOUS" -> List.of("CONTINUOUS", "Continuous");
      case "SPECIAL" -> List.of("SPECIAL", "Special");
      default -> List.of(dbType);
    };
  }

  private static List<String> subtypeVariants(String canonicalSubtype) {
    if (canonicalSubtype == null) {
      return List.of();
    }
    return switch (canonicalSubtype) {
      case "MUN" -> List.of("MUN", "MODEL_UN");
      case "Debate" -> List.of("Debate", "FRIENDLY_DEBATE", "DEBATE");
      case "Competition" -> List.of("Competition", "COMPETITION");
      case "Special" -> List.of("Special", "SPECIAL");
      default -> List.of(canonicalSubtype);
    };
  }

  private static List<String> themeVariants(String canonicalTheme) {
    if (canonicalTheme == null) {
      return List.of();
    }
    String noSpace = canonicalTheme.replace(" ", "");
    if (!noSpace.equals(canonicalTheme)) {
      return List.of(canonicalTheme, noSpace);
    }
    return List.of(canonicalTheme);
  }

  private static void appendDiscoveryFilters(
      StringBuilder sql, List<Object> params,
      String q, String theme, String dbType, String canonicalSubtype) {
    if (q != null && !q.isBlank()) {
      sql.append(" AND (p.title ILIKE ? OR p.description ILIKE ?)");
      String like = "%" + q.replace("%", "\\%").replace("_", "\\_") + "%";
      params.add(like);
      params.add(like);
    }
    if (theme != null && !theme.isBlank()) {
      List<String> variants = themeVariants(theme);
      if (variants.size() == 1) {
        sql.append(" AND (? = ANY(p.themes))");
        params.add(variants.get(0));
      } else {
        sql.append(" AND (? = ANY(p.themes) OR ? = ANY(p.themes))");
        params.add(variants.get(0));
        params.add(variants.get(1));
      }
    }
    if (dbType != null && !dbType.isBlank()) {
      List<String> variants = typeVariants(dbType);
      sql.append(" AND p.program_type IN (");
      for (int i = 0; i < variants.size(); i++) {
        if (i > 0) {
          sql.append(",");
        }
        sql.append("?");
        params.add(variants.get(i));
      }
      sql.append(")");
    }
    if (canonicalSubtype != null && !canonicalSubtype.isBlank()) {
      List<String> variants = subtypeVariants(canonicalSubtype);
      sql.append(" AND p.subtype IN (");
      for (int i = 0; i < variants.size(); i++) {
        if (i > 0) {
          sql.append(",");
        }
        sql.append("?");
        params.add(variants.get(i));
      }
      sql.append(")");
    }
  }

  private static final String DEV_EXCLUSION =
      " AND NOT EXISTS (SELECT 1 FROM app.development_events e"
          + " WHERE e.program_id = p.id AND e.archived_at IS NULL)";

  /** Public slice: PUBLISHED + PUBLIC visibility, newest first (stable). */
  public List<Map<String, Object>> findPublishedPrograms(int limit, int offset) {
    return findPublishedProgramsFiltered(limit, offset, null, null, null, null);
  }

  public List<Map<String, Object>> findPublishedProgramsFiltered(
      int limit, int offset, String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder(
        "SELECT " + LIST_PROJECTION + " FROM app.programs p"
            + " WHERE p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC'");
    List<Object> params = new java.util.ArrayList<>();
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    sql.append(DEV_EXCLUSION);
    sql.append(" ORDER BY p.created_at DESC, p.id ASC LIMIT ? OFFSET ?");
    params.add(limit);
    params.add(offset);
    try {
      return jdbc.queryForList(sql.toString(), params.toArray());
    } catch (org.springframework.jdbc.BadSqlGrammarException e) {
      // Skeleton DBs without development_events / themes: retry without dev exclusion.
      StringBuilder fallback = new StringBuilder(
          "SELECT " + LIST_PROJECTION + " FROM app.programs p"
              + " WHERE p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC'");
      List<Object> fp = new java.util.ArrayList<>();
      appendDiscoveryFilters(fallback, fp, q, theme, dbType, canonicalSubtype);
      fallback.append(" ORDER BY p.created_at DESC, p.id ASC LIMIT ? OFFSET ?");
      fp.add(limit);
      fp.add(offset);
      try {
        return jdbc.queryForList(fallback.toString(), fp.toArray());
      } catch (Exception ex) {
        // Pre-V6 DBs without themes/subtype: minimal projection.
        return jdbc.queryForList(
            "SELECT id::text AS id, slug, title, description, program_type AS type,"
                + " lifecycle, visibility, owner_id::text AS ownerId, capacity"
                + " FROM app.programs WHERE lifecycle = 'PUBLISHED' AND visibility = 'PUBLIC'"
                + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
            limit, offset);
      }
    }
  }

  public int countPublishedPrograms() {
    return countPublishedProgramsFiltered(null, null, null, null);
  }

  public int countPublishedProgramsFiltered(
      String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder(
        "SELECT COUNT(*) FROM app.programs p"
            + " WHERE p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC'");
    List<Object> params = new java.util.ArrayList<>();
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    sql.append(DEV_EXCLUSION);
    try {
      Integer n = jdbc.queryForObject(sql.toString(), Integer.class, params.toArray());
      return n == null ? 0 : n;
    } catch (Exception e) {
      try {
        StringBuilder fallback = new StringBuilder(
            "SELECT COUNT(*) FROM app.programs p"
                + " WHERE p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC'");
        List<Object> fp = new java.util.ArrayList<>();
        appendDiscoveryFilters(fallback, fp, q, theme, dbType, canonicalSubtype);
        Integer n = jdbc.queryForObject(fallback.toString(), Integer.class, fp.toArray());
        return n == null ? 0 : n;
      } catch (Exception ex) {
        return 0;
      }
    }
  }

  /** Owner-visible slice: own programs plus public PUBLISHED, newest first (stable). */
  public List<Map<String, Object>> findVisiblePrograms(String ownerId, int limit, int offset) {
    return findVisibleProgramsFiltered(ownerId, limit, offset, null, null, null, null);
  }

  public List<Map<String, Object>> findVisibleProgramsFiltered(
      String ownerId, int limit, int offset,
      String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder(
        "SELECT " + LIST_PROJECTION + " FROM app.programs p"
            + " WHERE ((p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC')"
            + " OR p.owner_id::text = ?)");
    List<Object> params = new java.util.ArrayList<>();
    params.add(ownerId);
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    sql.append(DEV_EXCLUSION);
    // Owners must still see their own dev-backed rows via workspace (get by id),
    // but discovery list hides targeted dev even for owners — re-include own rows:
    // the OR above already includes own; dev exclusion would hide own dev rows.
    // So for visible slice, exclude dev only when NOT owned:
    // Replace blanket exclusion with owned-or-not-dev.
    String withOwned = sql.toString().replace(DEV_EXCLUSION,
        " AND (p.owner_id::text = ? OR NOT EXISTS (SELECT 1 FROM app.development_events e"
            + " WHERE e.program_id = p.id AND e.archived_at IS NULL))");
    List<Object> withParams = new java.util.ArrayList<>(params);
    // params currently: [ownerId, ...filters]; need second ownerId before limit/offset
    // Insert second ownerId after filter params.
    withParams.add(ownerId);
    String finalSql = withOwned + " ORDER BY p.created_at DESC, p.id ASC LIMIT ? OFFSET ?";
    withParams.add(limit);
    withParams.add(offset);
    try {
      return jdbc.queryForList(finalSql, withParams.toArray());
    } catch (org.springframework.jdbc.BadSqlGrammarException e) {
      StringBuilder fallback = new StringBuilder(
          "SELECT " + LIST_PROJECTION + " FROM app.programs p"
              + " WHERE ((p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC')"
              + " OR p.owner_id::text = ?)");
      List<Object> fp = new java.util.ArrayList<>();
      fp.add(ownerId);
      appendDiscoveryFilters(fallback, fp, q, theme, dbType, canonicalSubtype);
      fallback.append(" ORDER BY p.created_at DESC, p.id ASC LIMIT ? OFFSET ?");
      fp.add(limit);
      fp.add(offset);
      try {
        return jdbc.queryForList(fallback.toString(), fp.toArray());
      } catch (Exception ex) {
        return jdbc.queryForList(
            "SELECT id::text AS id, slug, title, description, program_type AS type,"
                + " lifecycle, visibility, owner_id::text AS ownerId, capacity"
                + " FROM app.programs"
                + " WHERE ((lifecycle = 'PUBLISHED' AND visibility = 'PUBLIC')"
                + " OR owner_id::text = ?)"
                + " ORDER BY created_at DESC LIMIT ? OFFSET ?",
            ownerId, limit, offset);
      }
    }
  }

  public int countVisiblePrograms(String ownerId) {
    return countVisibleProgramsFiltered(ownerId, null, null, null, null);
  }

  public int countVisibleProgramsFiltered(
      String ownerId, String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder(
        "SELECT COUNT(*) FROM app.programs p"
            + " WHERE ((p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC')"
            + " OR p.owner_id::text = ?)");
    List<Object> params = new java.util.ArrayList<>();
    params.add(ownerId);
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    // Same owned-or-not-dev rule as the list path.
    String withOwned = sql.toString()
        + " AND (p.owner_id::text = ? OR NOT EXISTS (SELECT 1 FROM app.development_events e"
        + " WHERE e.program_id = p.id AND e.archived_at IS NULL))";
    List<Object> withParams = new java.util.ArrayList<>(params);
    withParams.add(ownerId);
    try {
      Integer n = jdbc.queryForObject(withOwned, Integer.class, withParams.toArray());
      return n == null ? 0 : n;
    } catch (Exception e) {
      try {
        StringBuilder fallback = new StringBuilder(
            "SELECT COUNT(*) FROM app.programs p"
                + " WHERE ((p.lifecycle = 'PUBLISHED' AND p.visibility = 'PUBLIC')"
                + " OR p.owner_id::text = ?)");
        List<Object> fp = new java.util.ArrayList<>();
        fp.add(ownerId);
        appendDiscoveryFilters(fallback, fp, q, theme, dbType, canonicalSubtype);
        Integer n = jdbc.queryForObject(fallback.toString(), Integer.class, fp.toArray());
        return n == null ? 0 : n;
      } catch (Exception ex) {
        return 0;
      }
    }
  }

  /** Admin slice: all programs, newest first (stable). */
  public List<Map<String, Object>> findAllPrograms(int limit, int offset) {
    return findAllProgramsFiltered(limit, offset, null, null, null, null);
  }

  public List<Map<String, Object>> findAllProgramsFiltered(
      int limit, int offset, String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder(
        "SELECT " + LIST_PROJECTION + " FROM app.programs p WHERE 1=1");
    List<Object> params = new java.util.ArrayList<>();
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    sql.append(" ORDER BY p.created_at DESC, p.id ASC LIMIT ? OFFSET ?");
    params.add(limit);
    params.add(offset);
    try {
      return jdbc.queryForList(sql.toString(), params.toArray());
    } catch (org.springframework.jdbc.BadSqlGrammarException e) {
      return jdbc.queryForList(
          "SELECT id::text AS id, slug, title, description, program_type AS type,"
              + " lifecycle, visibility, owner_id::text AS ownerId, capacity"
              + " FROM app.programs ORDER BY created_at DESC LIMIT ? OFFSET ?",
          limit, offset);
    }
  }

  public int countAllPrograms() {
    return countAllProgramsFiltered(null, null, null, null);
  }

  public int countAllProgramsFiltered(
      String q, String theme, String dbType, String canonicalSubtype) {
    StringBuilder sql = new StringBuilder("SELECT COUNT(*) FROM app.programs p WHERE 1=1");
    List<Object> params = new java.util.ArrayList<>();
    appendDiscoveryFilters(sql, params, q, theme, dbType, canonicalSubtype);
    try {
      Integer n = jdbc.queryForObject(sql.toString(), Integer.class, params.toArray());
      return n == null ? 0 : n;
    } catch (Exception e) {
      try {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM app.programs", Integer.class);
        return n == null ? 0 : n;
      } catch (Exception ex) {
        return 0;
      }
    }
  }

  /** True when the program backs a targeted development event (never publicly listed). */
  public boolean isDevelopmentBacked(String programId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.development_events"
              + " WHERE program_id::text = ? AND archived_at IS NULL",
          Integer.class, programId);
      return n != null && n > 0;
    } catch (Exception e) {
      return false;
    }
  }

  /** Row lock for capacity-gated writes (registrations confirm path uses this too). */
  public Map<String, Object> findProgramForUpdate(String programId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT id::text AS id, lifecycle, owner_id::text AS ownerId,"
                + " capacity, registered_count AS registeredCount, row_version AS version"
                + " FROM app.programs WHERE id::text = ? FOR UPDATE LIMIT 1",
            programId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public String insertProgram(
      String ownerProfileId,
      String slug,
      String title,
      String description,
      String programType,
      String subtype,
      String[] themes,
      String visibility,
      Instant startsAt,
      Instant endsAt,
      Instant registrationOpensAt,
      Instant registrationDeadline,
      String location,
      String venue,
      int capacity,
      String eligibility,
      String instituteId) {
    String id = UUID.randomUUID().toString();
    // Prefer the V7 column set (V6 starts_at/deadline + V7 ends_at/opens/location/
    // eligibility); fall back to the V2 set when the migrations haven't run.
    // Themes passed as a Postgres text[] literal ("{a,b}") to avoid holding a
    // JDBC Connection for createArrayOf (leak-prone under pooled datasources).
    String themesLiteral = toTextArrayLiteral(themes);
    try {
      jdbc.update(
          "INSERT INTO app.programs (id, slug, title, description, program_type, subtype,"
              + " themes, visibility, lifecycle, owner_id, capacity,"
              + " starts_at, ends_at, registration_opens_at, registration_deadline,"
              + " location, venue, eligibility, institute_id, row_version)"
              + " VALUES (?::uuid, ?, ?, ?, ?, ?, ?::text[], ?, 'DRAFT', ?::uuid, ?,"
              + " ?, ?, ?, ?, ?, ?, ?, ?, 1)",
          id, slug, title, description == null ? "" : description, programType, subtype,
          themesLiteral, visibility,
          ownerProfileId, capacity,
          startsAt == null ? null : java.sql.Timestamp.from(startsAt),
          endsAt == null ? null : java.sql.Timestamp.from(endsAt),
          registrationOpensAt == null ? null : java.sql.Timestamp.from(registrationOpensAt),
          registrationDeadline == null ? null : java.sql.Timestamp.from(registrationDeadline),
          location, venue, eligibility,
          instituteId == null || instituteId.isBlank() ? null : instituteId);
      return id;
    } catch (Exception e) {
      // Missing V6/V7 columns (or skeleton DB): fall back to the V2 column set.
      try {
        jdbc.update(
            "INSERT INTO app.programs (id, slug, title, description, program_type, subtype,"
                + " visibility, lifecycle, owner_id, capacity, venue, row_version)"
                + " VALUES (?::uuid, ?, ?, ?, ?, ?, ?, 'DRAFT', ?::uuid, ?, ?, 1)",
            id, slug, title, description == null ? "" : description, programType, subtype,
            visibility, ownerProfileId, capacity, venue);
        return id;
      } catch (Exception retryEx) {
        throw new IllegalStateException("Program insert failed", retryEx);
      }
    }
  }

  private static String toTextArrayLiteral(String[] themes) {
    if (themes == null || themes.length == 0) {
      return "{}";
    }
    StringBuilder sb = new StringBuilder("{");
    for (int i = 0; i < themes.length; i++) {
      if (i > 0) {
        sb.append(",");
      }
      sb.append('"').append(themes[i].replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
    }
    return sb.append("}").toString();
  }

  /**
   * Optimistic patch: only DRAFT/CHANGES_REQUESTED callers reach here (service guard).
   * Returns updated rowcount (0 → stale version → 409).
   */
  public int updateProgramOptimistic(
      String programId,
      int expectedVersion,
      String title,
      String description,
      String programType,
      String subtype,
      String visibility,
      Integer capacity,
      String location,
      String venue,
      String eligibility,
      Instant startsAt,
      Instant endsAt,
      Instant registrationOpensAt,
      Instant registrationDeadline) {
    try {
      return jdbc.update(
          "UPDATE app.programs SET"
              + " title = COALESCE(?, title),"
              + " description = COALESCE(?, description),"
              + " program_type = COALESCE(?, program_type),"
              + " subtype = COALESCE(CAST(? AS text), subtype),"
              + " visibility = COALESCE(?, visibility),"
              + " capacity = COALESCE(?, capacity),"
              + " location = COALESCE(?, location),"
              + " venue = COALESCE(?, venue),"
              + " eligibility = COALESCE(?, eligibility),"
              + " starts_at = COALESCE(?, starts_at),"
              + " ends_at = COALESCE(?, ends_at),"
              + " registration_opens_at = COALESCE(?, registration_opens_at),"
              + " registration_deadline = COALESCE(?, registration_deadline),"
              + " updated_at = now()"
              + " WHERE id::text = ? AND row_version = ?",
          title, description, programType, subtype, visibility, capacity,
          location, venue, eligibility,
          startsAt == null ? null : java.sql.Timestamp.from(startsAt),
          endsAt == null ? null : java.sql.Timestamp.from(endsAt),
          registrationOpensAt == null ? null : java.sql.Timestamp.from(registrationOpensAt),
          registrationDeadline == null ? null : java.sql.Timestamp.from(registrationDeadline),
          programId, expectedVersion);
    } catch (org.springframework.jdbc.BadSqlGrammarException e) {
      return jdbc.update(
          "UPDATE app.programs SET"
              + " title = COALESCE(?, title),"
              + " description = COALESCE(?, description),"
              + " program_type = COALESCE(?, program_type),"
              + " visibility = COALESCE(?, visibility),"
              + " capacity = COALESCE(?, capacity),"
              + " venue = COALESCE(?, venue),"
              + " updated_at = now()"
              + " WHERE id::text = ? AND row_version = ?",
          title, description, programType, visibility, capacity, venue,
          programId, expectedVersion);
    }
  }

  public int updateProgramThemes(String programId, String[] themes) {
    if (themes == null) {
      return 0;
    }
    try {
      return jdbc.update(
          "UPDATE app.programs SET themes = ?::text[], updated_at = now() WHERE id::text = ?",
          toTextArrayLiteral(themes), programId);
    } catch (Exception e) {
      return 0;
    }
  }

  public int setLifecycle(
      String programId, String from1, String from2, String to,
      String actorProfileId, String approvalNote) {
    if (from2 == null) {
      return jdbc.update(
          "UPDATE app.programs SET lifecycle = ?,"
              + " approval_decided_by = CASE WHEN ? IS NULL THEN approval_decided_by ELSE ?::uuid END,"
              + " approval_decided_at = CASE WHEN ? IS NULL THEN approval_decided_at ELSE now() END,"
              + " approval_note = COALESCE(?, approval_note),"
              + " archived_at = CASE WHEN ? = 'ARCHIVED' THEN COALESCE(archived_at, now()) ELSE archived_at END,"
              + " updated_at = now() WHERE id::text = ? AND lifecycle = ?",
          to, actorProfileId, actorProfileId, actorProfileId, approvalNote, to, programId, from1);
    }
    return jdbc.update(
        "UPDATE app.programs SET lifecycle = ?,"
            + " approval_decided_by = CASE WHEN ? IS NULL THEN approval_decided_by ELSE ?::uuid END,"
            + " approval_decided_at = CASE WHEN ? IS NULL THEN approval_decided_at ELSE now() END,"
            + " approval_note = COALESCE(?, approval_note),"
            + " archived_at = CASE WHEN ? = 'ARCHIVED' THEN COALESCE(archived_at, now()) ELSE archived_at END,"
            + " updated_at = now() WHERE id::text = ? AND lifecycle IN (?, ?)",
        to, actorProfileId, actorProfileId, actorProfileId, approvalNote, to, programId, from1, from2);
  }

  public int markPublished(String programId, String actorProfileId) {
    return jdbc.update(
        "UPDATE app.programs SET lifecycle = 'PUBLISHED', approval_decided_by = ?::uuid, "
            + "approval_decided_at = now() WHERE id::text = ?",
        actorProfileId, programId);
  }

  public int countSessions(String programId) {
    try {
      Integer n = jdbc.queryForObject(
          "SELECT COUNT(*) FROM app.sessions WHERE program_id::text = ? AND archived_at IS NULL",
          Integer.class, programId);
      return n == null ? 0 : n;
    } catch (Exception e) {
      return 0;
    }
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  public String insertSession(
      String programId, String slug, String title,
      Instant startsAt, Instant endsAt,
      String committee, String topic, String venue) {
    String id = UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO app.sessions (id, program_id, slug, title, starts_at, ends_at,"
            + " committee, topic, venue) VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?)",
        id, programId, slug, title,
        startsAt == null ? null : java.sql.Timestamp.from(startsAt),
        endsAt == null ? null : java.sql.Timestamp.from(endsAt),
        committee, topic, venue);
    return id;
  }

  public Map<String, Object> findSessionById(String sessionId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT s.id::text AS id, s.program_id::text AS programId,"
                + " p.owner_id::text AS ownerId, s.title, s.starts_at AS startsAt,"
                + " s.ends_at AS endsAt, s.committee, s.topic, s.venue"
                + " FROM app.sessions s JOIN app.programs p ON p.id = s.program_id"
                + " WHERE s.id::text = ? AND s.archived_at IS NULL LIMIT 1",
            sessionId);
    if (rows.isEmpty()) {
      throw new com.elevateme.common.security.ResourceNotFoundException("Not found");
    }
    return rows.get(0);
  }

  public List<Map<String, Object>> listSessionsForProgram(String programId) {
    return jdbc.queryForList(
        "SELECT id::text AS id, title, starts_at AS startsAt, ends_at AS endsAt,"
            + " committee, topic, venue FROM app.sessions"
            + " WHERE program_id::text = ? AND archived_at IS NULL ORDER BY starts_at NULLS LAST, created_at",
        programId);
  }

  /**
   * Immutable evaluation linkage: true when any evaluation or assignment
   * references the session (DB trigger also enforces on re-parenting).
   */
  public boolean hasEvaluationLinkage(String sessionId) {
    try {
      Integer a = null;
      Integer e = null;
      try {
        a = jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.evaluation_assignments WHERE session_id::text = ?",
            Integer.class, sessionId);
      } catch (Exception ignored) {
        // table may not exist on skeleton DBs
      }
      try {
        e = jdbc.queryForObject(
            "SELECT COUNT(*) FROM app.evaluations WHERE session_id::text = ? AND archived_at IS NULL",
            Integer.class, sessionId);
      } catch (Exception ignored) {
        // table may not exist on skeleton DBs
      }
      return (a != null && a > 0) || (e != null && e > 0);
    } catch (EmptyResultDataAccessException ex) {
      return false;
    }
  }
}
