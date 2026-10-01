package com.elevateme.identity;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Profile + self-summary queries, always scoped by verified {@code supabase_subject}.
 *
 * <p>Never accepts a profile id / user id from the client: every query binds the subject from
 * {@link com.elevateme.common.security.AuthContext} (via the service layer).
 */
@Repository
public class ProfileRepository {

  static final String FIND_BY_SUBJECT_SQL =
      "SELECT id, supabase_subject, email, full_name, elevate_me_id, institute_id,"
          + " role, status, avatar_url, parent_view_mode"
          + " FROM app.profiles WHERE supabase_subject = ?::uuid";

  /** Best-effort read of the Phase 1b {@code photo_key} column (absent on pre-1b DBs). */
  static final String FIND_PHOTO_KEY_SQL =
      "SELECT photo_key FROM app.profiles WHERE supabase_subject = ?::uuid";

  /** Best-effort write of the Phase 1b {@code photo_key} column (absent on pre-1b DBs). */
  static final String UPDATE_PHOTO_KEY_SQL =
      "UPDATE app.profiles SET photo_key = ?, updated_at = now() WHERE supabase_subject = ?::uuid";

  /** Update allowlist: never touches role/status/elevate_me_id (see MeController 403 guard). */
  static final String UPDATE_SELF_SQL =
      "UPDATE app.profiles SET full_name = COALESCE(?, full_name),"
          + " avatar_url = COALESCE(?, avatar_url),"
          + " parent_view_mode = COALESCE(?, parent_view_mode),"
          + " updated_at = now() WHERE supabase_subject = ?::uuid";

  static final String COUNT_PROGRAMS_ATTENDED_SQL =
      "SELECT COUNT(DISTINCT s.program_id) FROM app.session_attendance a"
          + " JOIN app.sessions s ON s.id = a.session_id"
          + " JOIN app.profiles p ON p.id = a.student_id"
          + " WHERE p.supabase_subject = ?::uuid AND a.status = 'ATTENDED'";

  /**
   * Chronological released totals (0-1000 scale) for the subject. Released = state LOCKED with a
   * pinned revision; unreleased sheets are invisible to /me/* endpoints.
   *
   * <p>Phase 4: chronological by session starts_at ASC + evaluation ID ASC tie-break
   * (NOT release time, NOT created_at). Only released non-voided (archived_at IS NULL).
   * Distinct programs are counted via attendance only (see COUNT_PROGRAMS_ATTENDED_SQL),
   * never via evaluation count, never via registration alone.
   */
  static final String RELEASED_TOTALS_CHRONO_SQL =
      "SELECT COALESCE(SUM(sc.score), 0) AS total FROM app.evaluations e"
          + " JOIN app.evaluation_revisions r ON r.id = e.released_revision_id"
          + " JOIN app.evaluation_scores sc ON sc.revision_id = r.id"
          + " JOIN app.profiles p ON p.id = e.student_id"
          + " LEFT JOIN app.sessions s ON s.id = e.session_id"
          + " WHERE p.supabase_subject = ?::uuid"
          + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
          + " AND e.archived_at IS NULL"
          + " GROUP BY e.id, s.starts_at ORDER BY s.starts_at ASC NULLS LAST, e.id ASC";

  /** Institute display name for the subject (best-effort; null when unlinked/unknown). */
  static final String FIND_INSTITUTE_NAME_SQL =
      "SELECT i.name FROM app.institutes i"
          + " JOIN app.profiles p ON p.institute_id = i.id"
          + " WHERE p.supabase_subject = ?::uuid LIMIT 1";

  /** True when any released sheet carries a correction (accuracy-over-history recalc path). */
  static final String HAS_CORRECTIONS_SQL =
      "SELECT COUNT(*) FROM app.evaluations e"
          + " JOIN app.profiles p ON p.id = e.student_id"
          + " WHERE p.supabase_subject = ?::uuid"
          + " AND e.state = 'LOCKED' AND e.released_revision_id IS NOT NULL"
          + " AND e.archived_at IS NULL"
          + " AND (e.correction_reason IS NOT NULL"
          + " OR EXISTS (SELECT 1 FROM app.evaluation_revisions r"
          + " WHERE r.evaluation_id = e.id AND r.revision_no > 1))";

  private final JdbcTemplate jdbc;

  public ProfileRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public Optional<Profile> findBySupabaseSubject(String subject) {
    try {
      Profile p =
          jdbc.queryForObject(
              FIND_BY_SUBJECT_SQL,
              (rs, n) -> {
                String role = rs.getString("role");
                List<String> roles = role == null ? List.of() : List.of(role);
                Object instituteId = rs.getObject("institute_id");
                return new Profile(
                    String.valueOf(rs.getObject("id")),
                    String.valueOf(rs.getObject("supabase_subject")),
                    rs.getString("email"),
                    rs.getString("full_name"),
                    rs.getString("elevate_me_id"),
                    roles,
                    rs.getString("status"),
                    instituteId == null ? null : String.valueOf(instituteId),
                    rs.getString("parent_view_mode"),
                    rs.getString("avatar_url"));
              },
              subject);
      if (p == null) {
        return Optional.empty();
      }
      // Prefer the Phase 1b photo_key column when present (private photo flow persists there).
      String photoKey = p.photoKey();
      try {
        String stored = jdbc.queryForObject(FIND_PHOTO_KEY_SQL, String.class, subject);
        if (stored != null && !stored.isBlank()) {
          photoKey = stored;
        }
      } catch (Exception ignored) {
        // Pre-1b DB without photo_key: avatar_url stands in.
      }
      if (photoKey != p.photoKey()) {
        p =
            new Profile(
                p.id(), p.supabaseSubject(), p.email(), p.displayName(), p.elevateMeId(),
                p.roles(), p.status(), p.instituteId(), p.parentViewPreference(), photoKey);
      }
      return Optional.of(p);
    } catch (EmptyResultDataAccessException e) {
      return Optional.empty();
    }
  }

  /** Updates only the self-editable columns; nulls leave the column unchanged. */
  public int updateSelf(String subject, String displayName, String photoKey, String parentViewMode) {
    int updated = jdbc.update(UPDATE_SELF_SQL, displayName, photoKey, parentViewMode, subject);
    // Mirror photo_key for the Phase 1b private photo flow when the column exists.
    if (photoKey != null) {
      try {
        jdbc.update(UPDATE_PHOTO_KEY_SQL, photoKey, subject);
      } catch (Exception ignored) {
        // Pre-1b DB without photo_key: avatar_url (updated above) stands in.
      }
    }
    return updated;
  }

  public int countDistinctProgramsAttended(String subject) {
    try {
      Integer n = jdbc.queryForObject(COUNT_PROGRAMS_ATTENDED_SQL, Integer.class, subject);
      return n == null ? 0 : n;
    } catch (EmptyResultDataAccessException e) {
      return 0;
    }
  }

  public List<Integer> findReleasedTotalsChronological(String subject) {
    try {
      List<Integer> totals = jdbc.query(RELEASED_TOTALS_CHRONO_SQL, (rs, n) -> rs.getInt("total"), subject);
      return totals == null ? new ArrayList<>() : totals;
    } catch (EmptyResultDataAccessException e) {
      return new ArrayList<>();
    } catch (Exception e) {
      // Skeleton/partial DBs (missing sessions join, etc.): fall back to empty, never break /me/*.
      return new ArrayList<>();
    }
  }

  /** Best-effort institute display name (null when unlinked or on skeleton DBs). */
  public String findInstituteName(String subject) {
    try {
      return jdbc.queryForObject(FIND_INSTITUTE_NAME_SQL, String.class, subject);
    } catch (Exception e) {
      return null;
    }
  }

  /** True when any released non-voided sheet carries a correction (recalc + notice flag). */
  public boolean hasCorrections(String subject) {
    try {
      Integer n = jdbc.queryForObject(HAS_CORRECTIONS_SQL, Integer.class, subject);
      return n != null && n > 0;
    } catch (Exception e) {
      return false;
    }
  }
}
