package com.elevateme.queries;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.notifications.NotificationsService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 5 query exchange (JUnit5 + Mockito, no DB).
 *
 * <p>Covers: POST /queries validates title 120 / body 5000 before any write
 * (422 preserves input) + idempotency key, first admin reply IN_REVIEW -&gt;
 * ANSWERED, comments on both sides, close/reopen (admin flips state; student
 * reopen on CLOSED is a request — state unchanged, DI notified).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QueryExchangeTest {

  @Mock QueriesRepository repo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock NotificationsService notifications;
  @Mock AuthContext auth;

  private IdempotencyService idempotency;
  private QueriesService svc;

  @BeforeEach
  void setUp() {
    idempotency = new IdempotencyService();
    svc = new QueriesService(auth, repo, guard, audit, outbox, idempotency, notifications);
  }

  private static Map<String, Object> studentCaller(String id) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("role", "student");
    m.put("status", "Approved");
    return m;
  }

  private static Map<String, Object> thread(String id, String studentId, String status) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("studentId", studentId);
    m.put("subject", "Subject");
    m.put("status", status);
    m.put("rowVersion", 1);
    m.put("awaitingAdminReply", true);
    return m;
  }

  // ------------------------------------------------------------------
  // Validation: title 120 / body 5000, validated before any write
  // ------------------------------------------------------------------

  @Test
  void createValidatesTitle120_body5000_beforeAnyWrite() {
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));

    String longTitle = "t".repeat(121);
    IllegalArgumentException titleEx =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                svc.create(
                    "stu-sub",
                    new QueryDtos.CreateQueryRequest(longTitle, "body", null, null, null),
                    null,
                    "req-1"));
    var titleRes =
        new GlobalExceptionHandler().handleIllegalArg(titleEx, new MockHttpServletRequest());
    assertEquals(422, titleRes.getStatusCode().value());

    String longBody = "b".repeat(5001);
    IllegalArgumentException bodyEx =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                svc.create(
                    "stu-sub",
                    new QueryDtos.CreateQueryRequest("Title", longBody, null, null, null),
                    null,
                    "req-2"));
    var bodyRes =
        new GlobalExceptionHandler().handleIllegalArg(bodyEx, new MockHttpServletRequest());
    assertEquals(422, bodyRes.getStatusCode().value());

    // 422 preserves input: no thread/message write happened.
    verify(repo, never()).insertThread(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
    verify(repo, never()).insertMessage(any(), any(), any(), any(), anyInt(), any());
  }

  @Test
  void sanitize_stripsHtml_trims_caps5000() {
    assertEquals("hello world", QueriesService.sanitize("<b>hello</b> world"));
    assertEquals("a & b", QueriesService.sanitize("a &amp; b"));
    assertEquals("", QueriesService.sanitize(null));
    String capped = QueriesService.sanitize("x".repeat(6000));
    assertEquals(5000, capped.length());
  }

  @Test
  void create_startsInReview_withIdempotencyKey() {
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));
    when(repo.findRecentDuplicate(any(), any(), any())).thenReturn(null);
    when(repo.insertThread(
            eq("stu-1"), eq("Title"), any(), eq("STUDENT"), eq("stu-1"),
            any(), any(), eq("key-1"), eq("IN_REVIEW"), eq(true)))
        .thenReturn("th-1");
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-1", "IN_REVIEW"));
    when(repo.findMessagesChronological("th-1")).thenReturn(List.of());
    when(repo.findAdminIds()).thenReturn(List.of("admin-1"));

    Map<String, Object> out =
        svc.create(
            "stu-sub",
            new QueryDtos.CreateQueryRequest("Title", "Body", null, null, null),
            "key-1",
            "req-1");
    assertEquals("IN_REVIEW", out.get("status"));

    // Same key + same payload replays the stored response without a second insert.
    Map<String, Object> replay =
        svc.create(
            "stu-sub",
            new QueryDtos.CreateQueryRequest("Title", "Body", null, null, null),
            "key-1",
            "req-2");
    assertEquals(out.get("id"), replay.get("id"));
    verify(repo, times(1)).insertThread(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean());
  }

  @Test
  void sameKeyDifferingPayload_409() {
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));
    when(repo.findRecentDuplicate(any(), any(), any())).thenReturn(null);
    when(repo.insertThread(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
        .thenReturn("th-1");
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-1", "IN_REVIEW"));
    when(repo.findMessagesChronological("th-1")).thenReturn(List.of());
    when(repo.findAdminIds()).thenReturn(List.of());

    svc.create(
        "stu-sub", new QueryDtos.CreateQueryRequest("Title", "Body", null, null, null), "key-1", "req-1");
    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () ->
                svc.create(
                    "stu-sub",
                    new QueryDtos.CreateQueryRequest("Title", "Different", null, null, null),
                    "key-1",
                    "req-2"));
    assertEquals("IDEMPOTENCY_CONFLICT", conflict.getCode());
    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
  }

  // ------------------------------------------------------------------
  // Reply: first official reply IN_REVIEW -> ANSWERED; comments both sides
  // ------------------------------------------------------------------

  @Test
  void firstReply_inReviewToAnswered_clearsQueue() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(repo.lockThread("th-1")).thenReturn(thread("th-1", "stu-1", "IN_REVIEW"));
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    when(repo.insertMessage(eq("th-1"), eq("admin-1"), eq("ADMIN"), any(), eq(1), isNull()))
        .thenReturn("msg-1");
    when(repo.setStatus("th-1", 1, "ANSWERED", false)).thenReturn(1);

    Map<String, Object> out =
        svc.reply("admin-sub", "th-1", new QueryDtos.ReplyRequest("Official answer"), "req-1");
    assertEquals("ANSWERED", out.get("status"));
    verify(repo).setStatus("th-1", 1, "ANSWERED", false);
  }

  @Test
  void commentOnClosedThread_409() {
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));
    when(repo.lockThread("th-1")).thenReturn(thread("th-1", "stu-1", "CLOSED"));

    ConflictException conflict =
        assertThrows(
            ConflictException.class,
            () -> svc.comment("stu-sub", "th-1", new QueryDtos.CommentRequest("follow-up"), "req-1"));
    assertEquals("INVALID_STATE", conflict.getCode());
    var res = new GlobalExceptionHandler().handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
    verify(repo, never()).insertMessage(any(), any(), any(), any(), anyInt(), any());
  }

  // ------------------------------------------------------------------
  // Close / reopen: admin flips state; student reopen is a request
  // ------------------------------------------------------------------

  @Test
  void adminClose_answeredToClosed() {
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(repo.lockThread("th-1")).thenReturn(thread("th-1", "stu-1", "ANSWERED"));
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    when(repo.markClosed("th-1", 1)).thenReturn(1);
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-1", "CLOSED"));
    when(repo.findMessagesChronological("th-1")).thenReturn(List.of());

    Map<String, Object> out = svc.close("admin-sub", "th-1", "req-1");
    assertEquals("CLOSED", out.get("status"));
  }

  @Test
  void studentReopenOnClosed_isRequest_stateUnchanged() {
    // Non-admin caller: no admin flip; must own the thread.
    when(guard.loadCaller("stu-sub")).thenReturn(new ScopeGuard.CallerProfile("stu-1", "student", "Approved"));
    when(repo.lockThread("th-1")).thenReturn(thread("th-1", "stu-1", "CLOSED"));
    when(repo.findCallerProfile("stu-sub")).thenReturn(studentCaller("stu-1"));
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-1", "CLOSED"));
    when(repo.findMessagesChronological("th-1")).thenReturn(List.of());
    when(repo.findAdminIds()).thenReturn(List.of("admin-1"));

    Map<String, Object> out = svc.reopen("stu-sub", "th-1", "req-1");
    assertEquals("CLOSED", out.get("status"));
    assertEquals(true, out.get("reopenRequested"));
    verify(repo, never()).markReopened(any(), anyInt());
  }

  @Test
  void adminReopen_closedToInReview() {
    when(guard.loadCaller("admin-sub"))
        .thenReturn(new ScopeGuard.CallerProfile("admin-1", "admin", "Approved"));
    when(repo.lockThread("th-1")).thenReturn(thread("th-1", "stu-1", "CLOSED"));
    when(repo.markReopened("th-1", 1)).thenReturn(1);
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-1", "IN_REVIEW"));
    when(repo.findMessagesChronological("th-1")).thenReturn(List.of());
    when(repo.findAdminIds()).thenReturn(List.of("admin-1"));

    Map<String, Object> out = svc.reopen("admin-sub", "th-1", "req-1");
    assertEquals("IN_REVIEW", out.get("status"));
    verify(repo).markReopened("th-1", 1);
  }

  @Test
  void crossStudentThread_is404() {
    when(repo.findThreadById("th-1")).thenReturn(thread("th-1", "stu-A", "IN_REVIEW"));
    when(repo.findCallerProfile("other-sub")).thenReturn(studentCaller("stu-B"));

    assertThrows(ResourceNotFoundException.class, () -> svc.getThread("other-sub", "th-1", "req-1"));
  }

  @Test
  void replyRequiresAdmin_teacherGets403() {
    doThrow(new AccessDeniedException("Admin only"))
        .when(guard)
        .requireAdmin(eq("teacher-sub"), any());
    AccessDeniedException denied =
        assertThrows(
            AccessDeniedException.class,
            () -> svc.reply("teacher-sub", "th-1", new QueryDtos.ReplyRequest("hi"), "req-1"));
    var res = new GlobalExceptionHandler().handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
  }
}
