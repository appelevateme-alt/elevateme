package com.elevateme.isolation;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AccountPendingException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.programs.ProgramRepository;
import com.elevateme.programs.ProgramsService;
import com.elevateme.common.security.AuthContext;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 1c exit criteria: Student A vs B isolation proof + staff approval gate.
 *
 * <ul>
 *   <li>Teacher (non-admin) cannot publish (403).
 *   <li>Student B cannot GET Student A /me/reports/:id (404, no enumeration).
 *   <li>Pending staff roster access yields ACCOUNT_PENDING (403).
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class IsolationTest {

  @Mock JdbcTemplate jdbc;
  @Mock AuditService audit;

  private ScopeGuard guard() {
    return new ScopeGuard(jdbc, audit);
  }

  private void stubCaller(String subject, String profileId, String role, String status) {
    when(jdbc.queryForList(anyString(), eq(subject), eq(subject)))
        .thenReturn(List.of(Map.of("id", profileId, "role", role, "status", status)));
  }

  @Test
  void teacherCannotPublish_programPublishIsAdminOnly() {
    String teacherSubject = "teacher-subject-1";
    stubCaller(teacherSubject, "teacher-profile-1", "coordinator", "Approved");

    ScopeGuard scopeGuard = guard();
    ProgramRepository repo = mock(ProgramRepository.class);
    AuthContext auth = mock(AuthContext.class);
    ProgramsService service = new ProgramsService(auth, repo, scopeGuard, audit);

    AccessDeniedException denied =
        assertThrows(
            AccessDeniedException.class,
            () -> service.publish(teacherSubject, "program-1", "req-1"));
    assertNotNull(denied);

    // Denial is audited with ids only (no PII message text).
    verify(audit)
        .record(eq("teacher-profile-1"), eq("ACCESS_DENIED"), eq("admin_action"), isNull(), eq("req-1"));
    verify(repo, never()).markPublished(anyString(), anyString());

    // Exception maps to 403 FORBIDDEN.
    GlobalExceptionHandler handler = new GlobalExceptionHandler();
    HttpServletRequest req = new MockHttpServletRequest();
    var res = handler.handleDenied(denied, req);
    assertEquals(403, res.getStatusCode().value());
    assertEquals("FORBIDDEN", res.getBody().code());
  }

  @Test
  void studentBCannotReadStudentAReport_returns404() {
    String subjectB = "subject-B";
    String profileB = "profile-B";
    String profileA = "profile-A";
    stubCaller(subjectB, profileB, "student", "Approved");
    // No program ownership / assignment linkage for B -> A.
    when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any()))
        .thenThrow(new EmptyResultDataAccessException(1));

    ScopeGuard scopeGuard = guard();

    ResourceNotFoundException notFound =
        assertThrows(
            ResourceNotFoundException.class,
            () -> scopeGuard.checkStudentRead(subjectB, profileA, "req-B-A"));
    assertNotNull(notFound);

    verify(audit)
        .record(eq(profileB), eq("ACCESS_DENIED"), eq("student_read"), eq(profileA), eq("req-B-A"));

    GlobalExceptionHandler handler = new GlobalExceptionHandler();
    var res = handler.handleNotFound(notFound, new MockHttpServletRequest());
    assertEquals(404, res.getStatusCode().value());
    assertEquals("NOT_FOUND", res.getBody().code());
  }

  @Test
  void pendingTeacherRosterAccess_yieldsAccountPending() {
    String pendingSubject = "pending-teacher";
    stubCaller(pendingSubject, "pending-profile-1", "coordinator", "PendingReview");

    ScopeGuard scopeGuard = guard();

    AccountPendingException pending =
        assertThrows(
            AccountPendingException.class,
            () -> scopeGuard.checkRosterAccess(pendingSubject, "session-1", "req-pending"));
    assertNotNull(pending);

    verify(audit)
        .record(
            eq("pending-profile-1"),
            eq("ACCESS_DENIED_PENDING"),
            eq("roster_read"),
            eq("session-1"),
            eq("req-pending"));

    GlobalExceptionHandler handler = new GlobalExceptionHandler();
    var res = handler.handlePending(pending, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("ACCOUNT_PENDING", res.getBody().code());
  }

  @Test
  void scopeGuardPureDecision_selfAdminLinkedOnly() {
    var self = new ScopeGuard.CallerProfile("A", "student", "Approved");
    assertTrue(ScopeGuard.canReadStudent(self, "A", false));

    var otherStudent = new ScopeGuard.CallerProfile("B", "student", "Approved");
    assertFalse(ScopeGuard.canReadStudent(otherStudent, "A", false));

    var admin = new ScopeGuard.CallerProfile("admin-1", "admin", "Approved");
    assertTrue(ScopeGuard.canReadStudent(admin, "A", false));

    var teacherLinked = new ScopeGuard.CallerProfile("T", "coordinator", "Approved");
    assertTrue(ScopeGuard.canReadStudent(teacherLinked, "A", true));
    assertFalse(ScopeGuard.canReadStudent(teacherLinked, "A", false));

    var pendingTeacher = new ScopeGuard.CallerProfile("T2", "coordinator", "PendingReview");
    assertFalse(ScopeGuard.canReadStudent(pendingTeacher, "A", true));
  }

  @Test
  void requestIdResolves_forAuditTracing() {
    MockHttpServletRequest req = new MockHttpServletRequest();
    req.setAttribute(RequestIdFilter.REQUEST_ID_ATTR, "req-123");
    assertEquals("req-123", RequestIdFilter.resolve(req));
  }
}
