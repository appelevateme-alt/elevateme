package com.elevateme.identity;

import com.elevateme.common.security.AccessDeniedException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.Set;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Self identity endpoints, all scoped by the verified JWT subject (never browser metadata).
 *
 * <ul>
 *   <li>{@code GET /api/v1/me} — profile from DB; 404 when the signup trigger hasn't created it.</li>
 *   <li>{@code PATCH /api/v1/me} — allowlist only: {@code display_name}, {@code photo_key},
 *       {@code parent_view_preference}, {@code email_preferences}. Any privilege key
 *       ({@code roles}, {@code status}, {@code elevateMeId}, …) is rejected with 403, so an
 *       admin can never self-register through this public endpoint.</li>
 *   <li>{@code GET /api/v1/me/summary} — server-derived aggregates over released sheets only.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/me")
public class MeController {

  /** Top-level keys that would escalate privilege or rewrite server-assigned identity. */
  static final Set<String> FORBIDDEN_PATCH_KEYS =
      Set.of(
          "roles", "role", "active_role", "activerole",
          "status", "elevatemeid", "elevate_me_id",
          "institute_id", "instituteid", "supabase_subject", "supabasesubject",
          "requested_role", "requestedrole", "id");

  private final ProfileService service;
  private final ObjectMapper mapper = new ObjectMapper();

  public MeController(ProfileService service) {
    this.service = service;
  }

  @GetMapping
  public ResponseEntity<ProfileDtos.ProfileResponse> me() {
    return ResponseEntity.ok(service.getMe());
  }

  @PatchMapping
  public ResponseEntity<ProfileDtos.ProfileResponse> patchMe(@RequestBody JsonNode raw) {
    if (raw != null && raw.isObject()) {
      var it = raw.fieldNames();
      while (it.hasNext()) {
        String key = it.next();
        String norm = key.replaceAll("[_\\-\\s]", "").toLowerCase();
        if (FORBIDDEN_PATCH_KEYS.contains(norm)) {
          throw new AccessDeniedException("Only admins may change " + key);
        }
      }
    }
    ProfileDtos.PatchProfileRequest req = mapper.convertValue(raw, ProfileDtos.PatchProfileRequest.class);
    Map<String, Boolean> prefs = req == null ? null : req.emailPreferences();
    ProfileDtos.ProfileResponse updated =
        service.patchMe(
            req == null ? null : req.displayName(),
            req == null ? null : req.photoKey(),
            req == null ? null : req.parentViewPreference(),
            prefs);
    return ResponseEntity.ok(updated);
  }

  @GetMapping("/summary")
  public ResponseEntity<ProfileDtos.SummaryResponse> summary() {
    return ResponseEntity.ok(service.getSummary());
  }
}
