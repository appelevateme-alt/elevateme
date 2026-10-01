package com.elevateme.identity;

import com.elevateme.common.security.AuthContext;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Self profile service. All reads/writes scoped by the verified subject from {@link AuthContext}.
 *
 * <p>Never auto-creates a profile from browser metadata: when the signup trigger has not created
 * a row, {@link #getMe} throws {@link ProfileNotFoundException} (404) so the client routes to
 * signup/pending-approval instead of fabricating identity.
 */
@Service
public class ProfileService {

  static final String STARTER_MESSAGE =
      "Your first report will start your progress record";

  static final String SINGLE_RESULT_MESSAGE = "Starting point recorded";

  static final String NO_BASELINE_LABEL = "No baseline yet";

  private final ProfileRepository repo;
  private final AuthContext auth;

  public ProfileService(ProfileRepository repo, AuthContext auth) {
    this.repo = repo;
    this.auth = auth;
  }

  @Transactional(readOnly = true)
  public ProfileDtos.ProfileResponse getMe() {
    String subject = auth.currentSubject();
    Profile p = repo.findBySupabaseSubject(subject).orElseThrow(() -> new ProfileNotFoundException(subject));
    String email = p.email() != null && !p.email().isBlank() ? p.email() : auth.currentEmail();
    return new ProfileDtos.ProfileResponse(
        p.id(),
        p.elevateMeId(),
        email,
        p.displayName(),
        p.roles(),
        p.status(),
        p.instituteId(),
        p.parentViewPreference(),
        p.photoKey());
  }

  /**
   * Updates only the allowlisted self fields. Privilege fields are unbindable (DTO has no such
   * fields; MeController rejects them with 403 before reaching here).
   *
   * @param emailPreferences accepted for forward-compat; not yet persisted (V1 has no column).
   */
  @Transactional
  public ProfileDtos.ProfileResponse patchMe(
      String displayName, String photoKey, String parentViewPreference, java.util.Map<String, Boolean> emailPreferences) {
    String subject = auth.currentSubject();
    repo.findBySupabaseSubject(subject).orElseThrow(() -> new ProfileNotFoundException(subject));
    String mode = null;
    if (parentViewPreference != null && !parentViewPreference.isBlank()) {
      String upper = parentViewPreference.trim().toUpperCase();
      if (!upper.equals("ALL") && !upper.equals("SINGLE")) {
        throw new IllegalArgumentException("parent_view_preference must be ALL or SINGLE");
      }
      mode = upper;
    }
    String name = displayName != null && !displayName.isBlank() ? displayName.trim() : null;
    if (name != null && name.length() > 120) {
      throw new IllegalArgumentException("display_name must be at most 120 characters");
    }
    String photo = photoKey != null && !photoKey.isBlank() ? photoKey.trim() : null;
    if (photo != null && photo.length() > 512) {
      throw new IllegalArgumentException("photo_key must be at most 512 characters");
    }
    // emailPreferences: validated as a map when present; persistence lands with the V5
    // profile-extras migration (TODO). Until then the write is accepted and ignored.
    repo.updateSelf(subject, name, photo, mode);
    return getMe();
  }

  /**
   * Server-derived summary over released sheets only.
   *
   * <ul>
   *   <li>Only released non-voided (LOCKED + released_revision_id + archived_at IS NULL),
   *       chronological by session starts_at + evaluation ID (NOT release time).</li>
   *   <li>programsAttended = distinct program IDs with &gt;=1 ATTENDED session
   *       (attendance only, never registration alone, never evaluation count).</li>
   *   <li>personalBest (/100) = max normalized; baseline = first chronological;
   *       pointsGained = best - baseline, min 0.</li>
   *   <li>0 results =&gt; nulls + "Your first report will start your progress record".</li>
   *   <li>1 result =&gt; best (= baseline) + "Starting point recorded", gain 0.</li>
   *   <li>Corrections/voids recalc from scratch (accuracy over history); corrected flag
   *       signals a correction notice.</li>
   * </ul>
   */
  @Transactional(readOnly = true)
  public ProfileDtos.SummaryResponse getSummary() {
    String subject = auth.currentSubject();
    Profile profile =
        repo.findBySupabaseSubject(subject).orElseThrow(() -> new ProfileNotFoundException(subject));
    int programsAttended = repo.countDistinctProgramsAttended(subject);
    List<Integer> totals = repo.findReleasedTotalsChronological(subject);
    String photo = profile.photoKey();
    String elevateMeId = profile.elevateMeId();
    String institute = repo.findInstituteName(subject);
    boolean corrected = repo.hasCorrections(subject);
    if (totals == null || totals.isEmpty()) {
      return new ProfileDtos.SummaryResponse(
          programsAttended, null, null, null, STARTER_MESSAGE,
          photo, elevateMeId, institute, NO_BASELINE_LABEL, corrected);
    }
    int baseline = totals.get(0) / 10;
    int best = totals.stream().mapToInt(t -> t / 10).max().orElse(baseline);
    int gain = Math.max(0, best - baseline);
    if (totals.size() == 1) {
      return new ProfileDtos.SummaryResponse(
          programsAttended, best, 0, baseline, SINGLE_RESULT_MESSAGE,
          photo, elevateMeId, institute, "Baseline " + baseline, corrected);
    }
    return new ProfileDtos.SummaryResponse(
        programsAttended, best, gain, baseline, null,
        photo, elevateMeId, institute, "Baseline " + baseline, corrected);
  }
}
