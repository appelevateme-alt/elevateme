package com.elevateme.identity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.web.GlobalExceptionHandler;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 1a isolation: subject A can never read subject B — every query is scoped by the
 * verified subject, the service exposes no by-id/by-subject lookup, and missing rows 404
 * (never auto-created from browser metadata).
 */
@ExtendWith(MockitoExtension.class)
class MeIsolationTest {

  @Mock ProfileRepository repo;
  @Mock AuthContext auth;

  private static final String SUBJECT_A = "11111111-1111-1111-1111-111111111111";
  private static final String SUBJECT_B = "22222222-2222-2222-2222-222222222222";

  private static Profile profileA() {
    return new Profile(
        "profile-A", SUBJECT_A, "a@x.test", "Alice", "EM-00131",
        List.of("student"), "Approved", "inst-1", "ALL", null);
  }

  private static Profile profileB() {
    return new Profile(
        "profile-B", SUBJECT_B, "b@x.test", "Bob", "EM-00132",
        List.of("student"), "Approved", "inst-1", "ALL", null);
  }

  private ProfileService serviceFor(String subject, String email) {
    when(auth.currentSubject()).thenReturn(subject);
    // Fallback only (used when the DB row email is blank); lenient to keep strict-stubs green.
    lenient().when(auth.currentEmail()).thenReturn(email);
    return new ProfileService(repo, auth);
  }

  @Test
  void aReadsOnlyA_scopedBySubject() {
    when(repo.findBySupabaseSubject(SUBJECT_A)).thenReturn(Optional.of(profileA()));

    var res = serviceFor(SUBJECT_A, "a@x.test").getMe();

    assertEquals("profile-A", res.id());
    assertEquals("EM-00131", res.elevateMeId());
    assertEquals("a@x.test", res.email());
    assertNotEquals("profile-B", res.id());
    verify(repo).findBySupabaseSubject(SUBJECT_A);
    verify(repo, never()).findBySupabaseSubject(SUBJECT_B);
  }

  @Test
  void bReadsOnlyB_noLeakage() {
    when(repo.findBySupabaseSubject(SUBJECT_B)).thenReturn(Optional.of(profileB()));

    var res = serviceFor(SUBJECT_B, "b@x.test").getMe();

    assertEquals("profile-B", res.id());
    assertEquals(List.of("student"), res.roles());
    verify(repo, never()).findBySupabaseSubject(SUBJECT_A);
  }

  @Test
  void serviceExposesNoByIdLookup() {
    // A cannot address B's row: no method accepts an arbitrary id/subject argument.
    for (var m : ProfileService.class.getMethods()) {
      if (m.getDeclaringClass() == ProfileService.class) {
        for (var p : m.getParameters()) {
          assertNotEquals(
              "profileId", p.getName(),
              "ProfileService must not accept client-supplied profile ids");
        }
        assertFalse(
            m.getName().toLowerCase().contains("byid") || m.getName().toLowerCase().contains("bysubject"),
            "No by-id/by-subject lookup allowed: " + m.getName());
      }
    }
  }

  @Test
  void missingRow_throws404NeverAutoCreates() {
    when(repo.findBySupabaseSubject("unknown-subject")).thenReturn(Optional.empty());
    when(auth.currentSubject()).thenReturn("unknown-subject");
    var service = new ProfileService(repo, auth);

    var thrown = assertThrows(ProfileNotFoundException.class, service::getMe);
    assertInstanceOf(ResourceNotFoundException.class, thrown);

    // Canonical 404 body, no leakage.
    var res = new GlobalExceptionHandler().handleNotFound(thrown, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
    assertEquals("NOT_FOUND", res.getBody().code());

    // Never auto-created: no INSERT path exists on the repository for self reads.
    verify(repo, never()).updateSelf(anyString(), any(), any(), any());
  }

  @Test
  void patchWritesOnlyAllowlistedColumns() {
    when(repo.findBySupabaseSubject(SUBJECT_A)).thenReturn(Optional.of(profileA()));
    when(auth.currentSubject()).thenReturn(SUBJECT_A);
    lenient().when(auth.currentEmail()).thenReturn("a@x.test");
    var service = new ProfileService(repo, auth);

    service.patchMe("New Name", null, "SINGLE", Map.of());

    verify(repo).updateSelf(SUBJECT_A, "New Name", null, "SINGLE");
    assertFalse(ProfileRepository.UPDATE_SELF_SQL.toLowerCase().contains("role"));
    assertFalse(ProfileRepository.UPDATE_SELF_SQL.toLowerCase().contains("status"));
    assertFalse(ProfileRepository.UPDATE_SELF_SQL.toLowerCase().contains("elevate_me_id"));
  }

  @Test
  void summaryWithNoData_returnsNullsPlusStarterMessage() {
    when(repo.findBySupabaseSubject(SUBJECT_A)).thenReturn(Optional.of(profileA()));
    when(auth.currentSubject()).thenReturn(SUBJECT_A);
    when(repo.countDistinctProgramsAttended(SUBJECT_A)).thenReturn(0);
    when(repo.findReleasedTotalsChronological(SUBJECT_A)).thenReturn(List.of());
    var service = new ProfileService(repo, auth);

    var summary = service.getSummary();

    assertEquals(0, summary.programsAttended());
    assertNull(summary.personalBest());
    assertNull(summary.pointsGained());
    assertNull(summary.baseline());
    assertNotNull(summary.message());
  }

  @Test
  void summaryUsesReleasedOnly_derivesBestGainBaseline() {
    when(repo.findBySupabaseSubject(SUBJECT_A)).thenReturn(Optional.of(profileA()));
    when(auth.currentSubject()).thenReturn(SUBJECT_A);
    when(repo.countDistinctProgramsAttended(SUBJECT_A)).thenReturn(2);
    when(repo.findReleasedTotalsChronological(SUBJECT_A)).thenReturn(List.of(600, 830, 760));
    var service = new ProfileService(repo, auth);

    var summary = service.getSummary();

    assertEquals(2, summary.programsAttended());
    assertEquals(83, summary.personalBest());
    assertEquals(60, summary.baseline());
    assertEquals(23, summary.pointsGained());
  }
}
