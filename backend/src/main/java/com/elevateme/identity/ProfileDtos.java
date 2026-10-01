package com.elevateme.identity;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;

/**
 * DTOs for /me. PATCH allowlist is exactly these fields — roles/status/elevateMeId can never be
 * bound here (see MeController forbidden-key 403 guard + AdminBootstrapClosedTest).
 */
public final class ProfileDtos {
  private ProfileDtos() {}

  public record ProfileResponse(
      String id,
      String elevateMeId,
      String email,
      String displayName,
      List<String> roles,
      String status,
      String instituteId,
      String parentViewPreference,
      String photoKey) {}

  public record PatchProfileRequest(
      @Size(max = 120) String displayName,
      @Size(max = 512) String photoKey,
      String parentViewPreference,
      Map<String, Boolean> emailPreferences) {}

  public record SummaryResponse(
      int programsAttended,
      Integer personalBest,
      Integer pointsGained,
      Integer baseline,
      String message,
      String photo,
      String elevateMeId,
      String institute,
      String baselineLabel,
      Boolean corrected) {
    /** Legacy 5-arg shape (Phase 1a callers/tests). New fields default to null. */
    public SummaryResponse(
        int programsAttended,
        Integer personalBest,
        Integer pointsGained,
        Integer baseline,
        String message) {
      this(programsAttended, personalBest, pointsGained, baseline, message, null, null, null, null, null);
    }
  }

  /**
   * Phase 1b private photo flow (Supabase Storage, private bucket only).
   * Init: {@code {contentType, contentLength}} in; {@code {uploadUrl, path, expiresIn:60}} out.
   * Complete: {@code {path}} in; {@code {photoUrl: signed 300s}} out.
   * {@code privatePath} is accepted as an alias of {@code path} for backward compat.
   */
  public record PhotoUploadInitRequest(String contentType, Long contentLength) {}

  public record PhotoUploadInitResponse(String uploadUrl, String path, long expiresIn) {}

  public record PhotoUploadCompleteRequest(
      @Size(max = 512) @JsonAlias("privatePath") String path) {}

  public record PhotoUploadCompleteResponse(@JsonProperty("photoUrl") String photoUrl) {}

  /** Legacy shape, retained (unused by controllers). */
  public record UpdateProfileRequest(
      @Size(max = 120) String displayName,
      @jakarta.validation.constraints.Email @Size(max = 320) String email) {}
}
