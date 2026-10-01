package com.elevateme.programs;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Phase 1E public discovery: anonymous list only PUBLISHED+PUBLIC standard,
 * private ID 404 for anon + non-owner (no enumeration), canonical themes (exact 4),
 * search/filter/pagination (10 stable), unknown vocab ⇒ 422.
 */
@ExtendWith(MockitoExtension.class)
class PublicDiscoveryTest {

  @Mock ProgramRepository programRepo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock AuthContext auth;

  private ProgramsService svc() {
    return new ProgramsService(auth, programRepo, guard, audit, null, null);
  }

  private static Map<String, Object> row(
      String id, String lifecycle, String visibility, String ownerId) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("title", "Open MUN");
    m.put("description", "Public speaking intensive");
    m.put("type", "SINGLE_EVENT");
    m.put("subtype", "MODEL_UN");
    m.put("themes", List.of("PublicSpeaking"));
    m.put("lifecycle", lifecycle);
    m.put("visibility", visibility);
    m.put("ownerId", ownerId);
    m.put("capacity", 50);
    return m;
  }

  @Test
  void canonicalThemes_exactFour() {
    assertEquals(
        List.of("Public Speaking", "Communication", "Negotiation", "Leadership"),
        ProgramDtos.CANONICAL_THEMES);
    assertEquals(List.of("SingleEvent", "Continuous", "Special"), ProgramDtos.CANONICAL_TYPES);
    assertEquals(
        List.of("MUN", "Debate", "Competition", "Special"), ProgramDtos.CANONICAL_SUBTYPES);
    assertEquals(4, ProgramDtos.CANONICAL_THEMES.size());
  }

  @Test
  void themes_rejectUnknown_422() {
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeTheme("Diplomacy"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeTheme("model-un"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeTheme(""));
    // Legacy alias accepted and canonicalized.
    assertEquals("Public Speaking", ProgramsService.normalizeTheme("PublicSpeaking"));
    assertEquals("Public Speaking", ProgramsService.normalizeTheme("public speaking"));
    assertEquals("Communication", ProgramsService.normalizeTheme("Communication"));
  }

  @Test
  void types_rejectUnknown_422() {
    assertEquals("SINGLE_EVENT", ProgramsService.normalizeType("SingleEvent"));
    assertEquals("CONTINUOUS", ProgramsService.normalizeType("Continuous"));
    assertEquals("MUN", ProgramsService.normalizeSubtype("MUN"));
    assertEquals("Debate", ProgramsService.normalizeSubtype("Debate"));
    assertEquals("MUN", ProgramsService.normalizeSubtype("MODEL_UN"));
    assertEquals("Debate", ProgramsService.normalizeSubtype("FRIENDLY_DEBATE"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeType("Workshop"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeSubtype("Workshop"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeSubtype("League"));
    assertThrows(IllegalArgumentException.class, () -> ProgramsService.normalizeSubtype("Unknown"));
  }

  @Test
  void anonList_onlyPublishedPublic_pagination10Stable() {
    ProgramsService s = svc();
    Map<String, Object> pub = row("pub-1", "PUBLISHED", "PUBLIC", "owner-1");
    when(programRepo.findPublishedProgramsFiltered(eq(10), eq(0), isNull(), isNull(), isNull(), isNull()))
        .thenReturn(List.of(pub));
    when(programRepo.countPublishedProgramsFiltered(isNull(), isNull(), isNull(), isNull()))
        .thenReturn(1);

    Map<String, Object> out = s.list(null, 1, "req-anon");
    assertEquals(1, out.get("page"));
    assertEquals(10, out.get("pageSize"));
    assertEquals(1, out.get("total"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
    assertEquals(1, items.size());
    // Canonical mapping: SINGLE_EVENT ⇒ SingleEvent, MODEL_UN ⇒ MUN, PublicSpeaking ⇒ Public Speaking.
    assertEquals("SingleEvent", items.get(0).get("type"));
    assertEquals("MUN", items.get(0).get("subtype"));
    verify(programRepo, never()).findAllProgramsFiltered(anyInt(), anyInt(), any(), any(), any(), any());
    verify(programRepo, never())
        .findVisibleProgramsFiltered(any(), anyInt(), anyInt(), any(), any(), any(), any());
  }

  @Test
  void anonList_searchFilterPagination_paramsForwarded() {
    ProgramsService s = svc();
    when(programRepo.findPublishedProgramsFiltered(
            eq(10), eq(10), eq("mun"), eq("Public Speaking"), eq("SINGLE_EVENT"), eq("MUN")))
        .thenReturn(List.of());
    when(programRepo.countPublishedProgramsFiltered(
            eq("mun"), eq("Public Speaking"), eq("SINGLE_EVENT"), eq("MUN")))
        .thenReturn(0);

    Map<String, Object> out =
        s.list(null, "mun", "Public Speaking", "SingleEvent", "MUN", 2, "req-2");
    assertEquals(2, out.get("page"));
    assertEquals(10, out.get("pageSize"));

    // Page clamps to >= 1 (stable pagination).
    when(programRepo.findPublishedProgramsFiltered(
            eq(10), eq(0), isNull(), isNull(), isNull(), isNull()))
        .thenReturn(List.of());
    when(programRepo.countPublishedProgramsFiltered(isNull(), isNull(), isNull(), isNull()))
        .thenReturn(0);
    Map<String, Object> clamped = s.list(null, 0, "req-0");
    assertEquals(1, clamped.get("page"));
  }

  @Test
  void anonList_unknownFilter_422() {
    ProgramsService s = svc();
    assertThrows(
        IllegalArgumentException.class,
        () -> s.list(null, null, "Diplomacy", null, null, 1, "req-bad-theme"));
    assertThrows(
        IllegalArgumentException.class,
        () -> s.list(null, null, null, "Workshop", null, 1, "req-bad-type"));
    assertThrows(
        IllegalArgumentException.class,
        () -> s.list(null, null, null, null, "League", 1, "req-bad-subtype"));
  }

  @Test
  void privateId_404_anon() {
    ProgramsService s = svc();
    when(programRepo.findProgramFullById("priv-1"))
        .thenReturn(row("priv-1", "DRAFT", "PUBLIC", "owner-1"));
    when(programRepo.findProgramFullById("priv-2"))
        .thenReturn(row("priv-2", "PUBLISHED", "PRIVATE", "owner-1"));
    when(programRepo.findProgramFullById("priv-3"))
        .thenReturn(row("priv-3", "APPROVED", "PUBLIC", "owner-1"));
    when(programRepo.findProgramFullById("priv-4"))
        .thenReturn(row("priv-4", "PENDING_REVIEW", "PUBLIC", "owner-1"));

    assertThrows(ResourceNotFoundException.class, () -> s.get(null, "priv-1", "req-1"));
    assertThrows(ResourceNotFoundException.class, () -> s.get(null, "priv-2", "req-2"));
    assertThrows(ResourceNotFoundException.class, () -> s.get(null, "priv-3", "req-3"));
    assertThrows(ResourceNotFoundException.class, () -> s.get(null, "priv-4", "req-4"));
  }

  @Test
  void privateId_404_nonOwner_noEnumeration() {
    ProgramsService s = svc();
    var other = new ScopeGuard.CallerProfile("other-1", "student", "Approved");
    when(guard.loadCaller("other-sub")).thenReturn(other);
    when(programRepo.findProgramFullById("priv-1"))
        .thenReturn(row("priv-1", "PUBLISHED", "PRIVATE", "owner-1"));
    when(programRepo.findProgramFullById("draft-1"))
        .thenReturn(row("draft-1", "DRAFT", "PUBLIC", "owner-1"));

    assertThrows(ResourceNotFoundException.class, () -> s.get("other-sub", "priv-1", "req-1"));
    assertThrows(ResourceNotFoundException.class, () -> s.get("other-sub", "draft-1", "req-2"));
    verify(programRepo, never()).findProgramForUpdate(any());
  }

  @Test
  void publicId_200_anon_and_owner() {
    ProgramsService s = svc();
    when(programRepo.findProgramFullById("pub-1"))
        .thenReturn(row("pub-1", "PUBLISHED", "PUBLIC", "owner-1"));
    when(programRepo.isDevelopmentBacked("pub-1")).thenReturn(false);

    Map<String, Object> anon = s.get(null, "pub-1", "req-anon");
    assertEquals("pub-1", anon.get("id"));

    var owner = new ScopeGuard.CallerProfile("owner-1", "coordinator", "Approved");
    when(guard.loadCaller("owner-sub")).thenReturn(owner);
    when(programRepo.findProgramFullById("own-draft"))
        .thenReturn(row("own-draft", "DRAFT", "INTERNAL", "owner-1"));
    Map<String, Object> own = s.get("owner-sub", "own-draft", "req-own");
    assertEquals("own-draft", own.get("id"));
  }

  @Test
  void developmentBacked_404_anonEvenIfPublishedPublic() {
    ProgramsService s = svc();
    when(programRepo.findProgramFullById("dev-1"))
        .thenReturn(row("dev-1", "PUBLISHED", "PUBLIC", "owner-1"));
    when(programRepo.isDevelopmentBacked("dev-1")).thenReturn(true);
    assertThrows(ResourceNotFoundException.class, () -> s.get(null, "dev-1", "req-dev"));
  }
}
