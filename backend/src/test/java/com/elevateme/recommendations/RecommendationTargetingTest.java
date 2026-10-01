package com.elevateme.recommendations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.notifications.NotificationsService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 5 recommendation targeting (JUnit5 + Mockito, no DB).
 *
 * <p>Covers: preview unions individual/institution/criterion on latest released
 * (missing != zero, returns count), create dedupes overlapping batches, pin
 * budget max 3, teacher (non-admin) publish/preview -&gt; 403.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RecommendationTargetingTest {

  @Mock RecommendationsRepository repo;
  @Mock ScopeGuard guard;
  @Mock AuthContext auth;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock NotificationsService notifications;

  private RecommendationsService svc() {
    return new RecommendationsService(auth, repo, guard, audit, outbox, notifications);
  }

  private static RecommendationDtos.CriterionRule rule(String criterion, String cmp, int threshold) {
    return new RecommendationDtos.CriterionRule(criterion, cmp, threshold);
  }

  // ------------------------------------------------------------------
  // Preview: union + count, missing != zero
  // ------------------------------------------------------------------

  @Test
  void previewUnionsIndividualInstitutionAndCriterion_returnsCount() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(repo.findApprovedStudentsByIds(anyList())).thenReturn(List.of("stu-1", "stu-2"));
    when(repo.findApprovedStudentsByInstitution("inst-1")).thenReturn(List.of("stu-2", "stu-3"));
    when(repo.findStudentsByReleasedCriterion("clarity", "LT", 30)).thenReturn(List.of("stu-3", "stu-4"));

    var req =
        new RecommendationDtos.AudiencePreviewRequest(
            List.of("stu-1", "stu-2"), "inst-1", rule("clarity", "LT", 30), null);
    Map<String, Object> out = svc().previewAudience("admin-sub", req, "req-1");

    @SuppressWarnings("unchecked")
    List<String> ids = (List<String>) out.get("recipientIds");
    assertEquals(4, out.get("count"));
    assertEquals(List.of("stu-1", "stu-2", "stu-3", "stu-4"), ids);
  }

  @Test
  void missingScoreNeverMatchesZero_allComparators() {
    for (String cmp : List.of("LT", "LTE", "GT", "GTE", "EQ")) {
      assertFalse(RecommendationsService.matchesCriterion(null, cmp, 30), cmp);
    }
    // Zero is a real score, not a stand-in for missing.
    assertTrue(RecommendationsService.matchesCriterion(0, "LT", 30));
    assertFalse(RecommendationsService.matchesCriterion(0, "GT", 30));
    assertTrue(RecommendationsService.matchesCriterion(0, "EQ", 0));
  }

  @Test
  void criterionComparators_matchExplicitThreshold() {
    assertTrue(RecommendationsService.matchesCriterion(29, "LT", 30));
    assertFalse(RecommendationsService.matchesCriterion(30, "LT", 30));
    assertTrue(RecommendationsService.matchesCriterion(30, "LTE", 30));
    assertTrue(RecommendationsService.matchesCriterion(31, "GT", 30));
    assertTrue(RecommendationsService.matchesCriterion(30, "GTE", 30));
    assertTrue(RecommendationsService.matchesCriterion(30, "EQ", 30));
    assertFalse(RecommendationsService.matchesCriterion(29, "EQ", 30));
  }

  // ------------------------------------------------------------------
  // Dedupe (snapshot + overlapping batches)
  // ------------------------------------------------------------------

  @Test
  void dedupeIds_preservesFirstSeenOrder_dropsBlanks() {
    java.util.List<String> withBlanks =
        new java.util.ArrayList<>(java.util.Arrays.asList("a", "b", "a", " ", "c", null, "b"));
    assertEquals(List.of("a", "b", "c"), RecommendationsService.dedupeIds(withBlanks));
    assertEquals(List.of(), RecommendationsService.dedupeIds(null));
  }

  @Test
  void createDedupesOverlappingBatches_singleRecipientRow() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    // Overlapping explicit batches resolve to the same approved student twice.
    when(repo.findApprovedStudentsByIds(anyList())).thenReturn(List.of("stu-1"));
    when(repo.insertRecommendation(any(), any(), any(), any(), any(), any(), any(), any(), any()))
        .thenReturn("rec-1");
    when(repo.countPinnedByStudent("stu-1")).thenReturn(0);
    when(repo.insertRecipientDeduped("rec-1", "stu-1", null)).thenReturn(1);

    var req =
        new RecommendationDtos.CreateRecommendationsRequest(
            "Title", "Do X", "Because Y", "clarity", "HIGH", null,
            List.of("stu-1"), null, null, List.of("stu-1"), null, false);
    Map<String, Object> out = svc().create("admin-sub", req, "req-1");

    assertEquals("rec-1", out.get("id"));
    assertEquals(1, out.get("recipientCount"));
    verify(repo, times(1)).insertRecipientDeduped(eq("rec-1"), eq("stu-1"), any());
  }

  // ------------------------------------------------------------------
  // Pin budget: max 3
  // ------------------------------------------------------------------

  @Test
  void pinBudgetMax3_fourthPinRejected422() {
    assertEquals(3, RecommendationsService.MAX_PINS);
    Map<String, Object> recipient = new HashMap<>();
    recipient.put("id", "rr-1");
    recipient.put("studentId", "stu-1");
    recipient.put("pinnedOrder", null);
    when(repo.findRecipientById("rr-1")).thenReturn(recipient);
    Map<String, Object> caller = new HashMap<>();
    caller.put("id", "stu-1");
    caller.put("role", "student");
    caller.put("status", "Approved");
    when(repo.findCallerProfile("stu-sub")).thenReturn(caller);
    when(repo.countPinnedByStudent("stu-1")).thenReturn(3);

    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                svc()
                    .patchMine(
                        "stu-sub",
                        "rr-1",
                        new RecommendationDtos.PatchRecommendationRequest(null, true, null),
                        "req-pin"));
    assertTrue(ex.getMessage().contains("3"));
    var res = new GlobalExceptionHandler().handleIllegalArg(ex, new MockHttpServletRequest());
    assertEquals(422, res.getStatusCode().value());
    verify(repo, never()).setPinned(any(), anyInt());
  }

  // ------------------------------------------------------------------
  // Teacher (non-admin) cannot preview or publish -> 403
  // ------------------------------------------------------------------

  @Test
  void teacherCannotPreviewOrPublish_403() {
    doThrow(new AccessDeniedException("Admin only"))
        .when(guard)
        .requireAdmin(eq("teacher-sub"), any());

    var previewReq = new RecommendationDtos.AudiencePreviewRequest(List.of("stu-1"), null, null, null);
    AccessDeniedException deniedPreview =
        assertThrows(
            AccessDeniedException.class, () -> svc().previewAudience("teacher-sub", previewReq, "req-1"));
    var resPreview =
        new GlobalExceptionHandler().handleDenied(deniedPreview, new MockHttpServletRequest());
    assertEquals(403, resPreview.getStatusCode().value());
    assertEquals("FORBIDDEN", resPreview.getBody().code());

    var createReq =
        new RecommendationDtos.CreateRecommendationsRequest(
            "Title", "Do X", "Because Y", null, "MED", null,
            List.of("stu-1"), null, null, null, null, false);
    assertThrows(
        AccessDeniedException.class, () -> svc().create("teacher-sub", createReq, "req-2"));
    verify(repo, never()).insertRecommendation(any(), any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void patchMineOwnOnly_crossStudentIs404() {
    Map<String, Object> recipient = new HashMap<>();
    recipient.put("id", "rr-9");
    recipient.put("studentId", "stu-A");
    recipient.put("pinnedOrder", null);
    when(repo.findRecipientById("rr-9")).thenReturn(recipient);
    Map<String, Object> other = new HashMap<>();
    other.put("id", "stu-B");
    other.put("role", "student");
    other.put("status", "Approved");
    when(repo.findCallerProfile("other-sub")).thenReturn(other);

    var ex =
        assertThrows(
            com.elevateme.common.security.ResourceNotFoundException.class,
            () ->
                svc()
                    .patchMine(
                        "other-sub",
                        "rr-9",
                        new RecommendationDtos.PatchRecommendationRequest(true, null, null),
                        "req-1"));
    var res = new GlobalExceptionHandler().handleNotFound(ex, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
  }
}
