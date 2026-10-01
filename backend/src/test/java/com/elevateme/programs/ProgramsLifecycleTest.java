package com.elevateme.programs;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.web.GlobalExceptionHandler;
import com.elevateme.participation.ParticipationDtos;
import com.elevateme.participation.ParticipationRepository;
import com.elevateme.participation.ParticipationService;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * Phase 2 lifecycle tests (pure service tests, JUnit5 + Mockito, no DB).
 *
 * <p>Covers: create→submit→approve→publish, teacher cannot publish (403),
 * stale version (409), capacity concurrency outline, duplicate registration
 * (409), attendance recorded, roster scoped.
 */
@ExtendWith(MockitoExtension.class)
class ProgramsLifecycleTest {

  @Mock ProgramRepository programRepo;
  @Mock ParticipationRepository participationRepo;
  @Mock ScopeGuard guard;
  @Mock AuditService audit;
  @Mock OutboxService outbox;
  @Mock AuthContext auth;

  private static Map<String, Object> programMap(
      String id, String lifecycle, String ownerId, int version, String type) {
    Map<String, Object> m = new HashMap<>();
    m.put("id", id);
    m.put("slug", "slug-" + id);
    m.put("title", "MUN 101");
    m.put("description", "desc");
    m.put("type", type);
    m.put("lifecycle", lifecycle);
    m.put("ownerId", ownerId);
    m.put("version", version);
    m.put("capacity", 50);
    m.put("visibility", "PUBLIC");
    m.put("venue", "Hall A");
    return m;
  }

  private static ProgramDtos.CreateProgramRequest createReq() {
    Instant start = Instant.now().plusSeconds(86400);
    Instant end = start.plusSeconds(7200);
    return new ProgramDtos.CreateProgramRequest(
        "SingleEvent", "MUN", List.of("PublicSpeaking", "Leadership"),
        "MUN 101", "Intro MUN", "PUBLIC",
        start, end, start.minusSeconds(3600), end,
        "Colombo", "Hall A", 50, null, null);
  }

  // ------------------------------------------------------------------
  // 1. create → submit → approve → publish works
  // ------------------------------------------------------------------

  @Test
  void createSubmitApprovePublish_works() {
    var teacher = new ScopeGuard.CallerProfile("teacher-1", "coordinator", "Approved");
    var admin = new ScopeGuard.CallerProfile("admin-1", "admin", "Approved");
    IdempotencyService idem = new IdempotencyService();
    ProgramsService svc = new ProgramsService(auth, programRepo, guard, audit, outbox, idem);

    // --- create ---
    when(guard.loadCaller("teacher-sub")).thenReturn(teacher);
    when(programRepo.insertProgram(
        any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
        any(), any(), any(), any(), anyInt(), any(), any()))
        .thenReturn("prog-1");
    when(programRepo.insertSession(any(), any(), any(), any(), any(), any(), any(), any()))
        .thenReturn("sess-1");
    when(programRepo.findProgramFullById("prog-1"))
        .thenReturn(programMap("prog-1", "DRAFT", "teacher-1", 1, "SINGLE_EVENT"));

    Map<String, Object> created = svc.create("teacher-sub", createReq(), "req-create");
    assertEquals("prog-1", created.get("id"));
    assertEquals("DRAFT", created.get("lifecycle"));
    verify(audit).record(eq("teacher-1"), eq("PROGRAM_CREATED"), eq("program"), eq("prog-1"), eq("req-create"));

    // --- submit (DRAFT → PENDING_REVIEW, sessions >= 1) ---
    // Note: submit reads the program twice (guard + result), so chain the states.
    reset(programRepo);
    when(guard.loadCaller("teacher-sub")).thenReturn(teacher);
    when(programRepo.findProgramFullById("prog-1"))
        .thenReturn(programMap("prog-1", "DRAFT", "teacher-1", 1, "SINGLE_EVENT"))
        .thenReturn(programMap("prog-1", "PENDING_REVIEW", "teacher-1", 2, "SINGLE_EVENT"));
    when(programRepo.countSessions("prog-1")).thenReturn(1);
    when(programRepo.setLifecycle(eq("prog-1"), eq("DRAFT"), eq("CHANGES_REQUESTED"),
        eq("PENDING_REVIEW"), any(), isNull())).thenReturn(1);
    Map<String, Object> submitted = svc.submit("teacher-sub", "prog-1", "req-submit", "key-submit-1");
    assertEquals("PENDING_REVIEW", submitted.get("lifecycle"));
    verify(audit).record(eq("teacher-1"), eq("PROGRAM_SUBMITTED"), eq("program"), eq("prog-1"), eq("req-submit"));

    // --- approve (admin, PENDING_REVIEW → APPROVED) ---
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    when(guard.loadCaller("admin-sub")).thenReturn(admin);
    when(programRepo.findProgramFullById("prog-1"))
        .thenReturn(programMap("prog-1", "PENDING_REVIEW", "teacher-1", 2, "SINGLE_EVENT"))
        .thenReturn(programMap("prog-1", "APPROVED", "teacher-1", 3, "SINGLE_EVENT"));
    when(programRepo.setLifecycle(eq("prog-1"), eq("PENDING_REVIEW"), isNull(),
        eq("APPROVED"), any(), isNull())).thenReturn(1);
    Map<String, Object> approved = svc.approve("admin-sub", "prog-1",
        new ProgramDtos.ApproveRequest("APPROVED", null), "req-approve");
    assertEquals("APPROVED", approved.get("lifecycle"));

    // --- publish (admin, APPROVED → PUBLISHED only; PENDING_REVIEW must approve first) ---
    when(programRepo.findProgramFullById("prog-1"))
        .thenReturn(programMap("prog-1", "APPROVED", "teacher-1", 3, "SINGLE_EVENT"))
        .thenReturn(programMap("prog-1", "PUBLISHED", "teacher-1", 4, "SINGLE_EVENT"));
    when(programRepo.setLifecycle(eq("prog-1"), eq("APPROVED"), isNull(),
        eq("PUBLISHED"), any(), isNull())).thenReturn(1);
    Map<String, Object> published = svc.publish("admin-sub", "prog-1", "req-pub", "key-pub-1");
    assertEquals("PUBLISHED", published.get("lifecycle"));
    verify(audit).record(eq("admin-1"), eq("PROGRAM_PUBLISHED"), eq("program"), eq("prog-1"), eq("req-pub"));
  }

  // ------------------------------------------------------------------
  // 2. teacher cannot publish (403)
  // ------------------------------------------------------------------

  @Test
  void teacherCannotPublish_403() {
    ProgramsService svc = new ProgramsService(auth, programRepo, guard, audit, outbox, null);
    doThrow(new AccessDeniedException("Admin only"))
        .when(guard).requireAdmin(eq("teacher-sub"), any());
    AccessDeniedException denied =
        assertThrows(AccessDeniedException.class,
            () -> svc.publish("teacher-sub", "prog-1", "req-1"));
    assertNotNull(denied);
    verify(programRepo, never()).setLifecycle(any(), any(), any(), any(), any(), any());
    verify(programRepo, never()).markPublished(any(), any());

    GlobalExceptionHandler h = new GlobalExceptionHandler();
    var res = h.handleDenied(denied, new MockHttpServletRequest());
    assertEquals(403, res.getStatusCode().value());
    assertEquals("FORBIDDEN", res.getBody().code());
  }

  // ------------------------------------------------------------------
  // 3. stale version → 409
  // ------------------------------------------------------------------

  @Test
  void patchStaleVersion_409() {
    ProgramsService svc = new ProgramsService(auth, programRepo, guard, audit, outbox, null);
    var owner = new ScopeGuard.CallerProfile("teacher-1", "coordinator", "Approved");
    when(guard.loadCaller("teacher-sub")).thenReturn(owner);
    when(programRepo.findProgramFullById("prog-1"))
        .thenReturn(programMap("prog-1", "DRAFT", "teacher-1", 5, "SINGLE_EVENT"));
    when(programRepo.updateProgramOptimistic(
        eq("prog-1"), eq(4), any(), any(), any(), any(), any(), any(), any(), any(),
        any(), any(), any(), any(), any()))
        .thenReturn(0);

    var patch = new ProgramDtos.PatchProgramRequest(
        null, null, null, "New title", null, null,
        null, null, null, null, null, null, null, null, 4);
    ConflictException conflict =
        assertThrows(ConflictException.class, () -> svc.patch("teacher-sub", "prog-1", patch, "req-patch"));
    assertEquals("VERSION_CONFLICT", conflict.getCode());

    GlobalExceptionHandler h = new GlobalExceptionHandler();
    var res = h.handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
    assertEquals("VERSION_CONFLICT", res.getBody().code());
  }

  // ------------------------------------------------------------------
  // 4. capacity concurrency outline (FOR UPDATE + COUNT → 409 CAPACITY)
  // ------------------------------------------------------------------

  @Test
  void registerAtCapacity_409_capacityConcurrencyOutline() {
    // Outline for a Testcontainers concurrency test (two threads racing register):
    //   T1: BEGIN; SELECT ... FOR UPDATE (locks program row); COUNT confirmed = cap-1
    //   T2: BEGIN; SELECT ... FOR UPDATE (blocks on T1's lock)
    //   T1: INSERT confirmed; COMMIT (releases lock)
    //   T2: unblocks; COUNT confirmed = cap → 409 CAPACITY (no overbooking).
    // Below asserts the single-threaded guard that the concurrent test relies on.
    ParticipationService svc =
        new ParticipationService(auth, participationRepo, guard, audit, outbox, null);
    when(participationRepo.findCallerProfile("student-sub"))
        .thenReturn(Map.of("id", "student-1", "role", "student", "status", "Approved"));
    when(participationRepo.lockProgramRow("prog-1"))
        .thenReturn(Map.of("id", "prog-1", "capacity", 2));
    when(participationRepo.countConfirmed("prog-1")).thenReturn(2);

    var req = new ParticipationDtos.RegisterRequest(null, null, null);
    ConflictException conflict =
        assertThrows(ConflictException.class,
            () -> svc.register("student-sub", "prog-1", req, "req-cap", null));
    assertEquals("CAPACITY", conflict.getCode());
    verify(participationRepo, never()).insertRegistration(any(), any(), any(), any());

    GlobalExceptionHandler h = new GlobalExceptionHandler();
    var res = h.handleConflict(conflict, new MockHttpServletRequest());
    assertEquals(409, res.getStatusCode().value());
    assertEquals("CAPACITY", res.getBody().code());
  }

  // ------------------------------------------------------------------
  // 5. duplicate registration → 409 (pre-check + race)
  // ------------------------------------------------------------------

  @Test
  void duplicateRegistration_409() {
    ParticipationService svc =
        new ParticipationService(auth, participationRepo, guard, audit, outbox, null);
    when(participationRepo.findCallerProfile("student-sub"))
        .thenReturn(Map.of("id", "student-1", "role", "student", "status", "Approved"));
    when(participationRepo.lockProgramRow("prog-1"))
        .thenReturn(Map.of("id", "prog-1", "capacity", 50));
    when(participationRepo.countConfirmed("prog-1")).thenReturn(0);
    when(participationRepo.findProgramMeta("prog-1"))
        .thenReturn(Map.of("id", "prog-1", "capacity", 50));
    when(participationRepo.existsRegistration("student-1", "prog-1", null)).thenReturn(true);

    var req = new ParticipationDtos.RegisterRequest(null, null, null);
    ConflictException dup =
        assertThrows(ConflictException.class,
            () -> svc.register("student-sub", "prog-1", req, "req-dup", null));
    assertEquals("DUPLICATE", dup.getCode());

    // Race path: pre-check passes but unique index fires.
    when(participationRepo.existsRegistration("student-1", "prog-1", null)).thenReturn(false);
    when(participationRepo.insertRegistration(eq("student-1"), eq("prog-1"), isNull(), isNull()))
        .thenThrow(new DuplicateKeyException("registrations_program_level_unique"));
    ConflictException raced =
        assertThrows(ConflictException.class,
            () -> svc.register("student-sub", "prog-1", req, "req-dup2", null));
    assertEquals("DUPLICATE", raced.getCode());
  }

  // ------------------------------------------------------------------
  // 6. attendance recorded {saved, total}; absence is NOT a zero score
  // ------------------------------------------------------------------

  @Test
  void attendanceRecorded_savedCounts() {
    ParticipationService svc =
        new ParticipationService(auth, participationRepo, guard, audit, outbox, null);
    doNothing().when(guard).checkRosterAccess(eq("staff-sub"), eq("sess-1"), any());
    when(participationRepo.findCallerProfile("staff-sub"))
        .thenReturn(Map.of("id", "staff-1", "role", "coordinator", "status", "Approved"));
    when(participationRepo.upsertAttendance(any(), any(), any(), any(), any())).thenReturn(1);

    var body = new ParticipationDtos.AttendancePatchRequest(List.of(
        new ParticipationDtos.AttendanceRecord("student-1", "ATTENDED", null),
        new ParticipationDtos.AttendanceRecord("student-2", "ABSENT", null)));
    Map<String, Object> out = svc.markAttendance("staff-sub", "sess-1", body, "req-att");
    assertEquals(2, out.get("saved"));
    assertEquals(2, out.get("total"));
    // Absence never writes scores: no evaluation repo interaction exists on this path
    // (absence is a roster fact, not a zero — scoring stays untouched by design).
    verify(participationRepo, times(2)).upsertAttendance(eq("sess-1"), any(), any(), eq("staff-1"), isNull());

    // EXCLUDED without reason → 422 (IllegalArgumentException).
    var bad = new ParticipationDtos.AttendancePatchRequest(List.of(
        new ParticipationDtos.AttendanceRecord("student-3", "EXCLUDED", null)));
    assertThrows(IllegalArgumentException.class,
        () -> svc.markAttendance("staff-sub", "sess-1", bad, "req-bad"));
  }

  // ------------------------------------------------------------------
  // 7. roster scoped (staff only) + search/filter/pagination shape
  // ------------------------------------------------------------------

  @Test
  void rosterScoped_staffOnlyAndShape() {
    ParticipationService svc =
        new ParticipationService(auth, participationRepo, guard, audit, outbox, null);
    svc.setPhotoSigner(k -> "signed:" + k);

    // Forbidden: non-owner staff → 403, no roster rows touched.
    doThrow(new AccessDeniedException("Not permitted"))
        .when(guard).checkRosterAccess(eq("outsider-sub"), eq("sess-1"), any());
    assertThrows(AccessDeniedException.class,
        () -> svc.getRosterDetailed("outsider-sub", "sess-1", null, null, null, 1, "req-denied"));
    verify(participationRepo, never())
        .findRosterDetailed(any(), any(), any(), any(), anyInt(), anyInt());

    // Allowed: owner sees server-filtered page with signed thumbs, stable sort done in SQL.
    doNothing().when(guard).checkRosterAccess(eq("owner-sub"), eq("sess-1"), any());
    Map<String, Object> row = new HashMap<>();
    row.put("studentId", "student-1");
    row.put("displayName", "A Perera");
    row.put("elevateMeId", "EM-00131");
    row.put("allocation", "Country: Japan");
    row.put("attendance", "ATTENDED");
    row.put("assignedEvaluator", "eval-1");
    row.put("evalStatus", "DRAFT");
    row.put("photoKey", "profiles/student-1/a.jpg");
    when(participationRepo.findRosterDetailed(eq("sess-1"), eq("Perera"), isNull(), isNull(), eq(10), eq(0)))
        .thenReturn(List.of(row));
    when(participationRepo.countRoster(eq("sess-1"), eq("Perera"), isNull(), isNull())).thenReturn(1);

    Map<String, Object> page =
        svc.getRosterDetailed("owner-sub", "sess-1", "Perera", null, null, 1, "req-roster");
    assertEquals(1, page.get("page"));
    assertEquals(10, page.get("pageSize"));
    assertEquals(1, page.get("total"));
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = (List<Map<String, Object>>) page.get("items");
    assertEquals(1, items.size());
    assertEquals("signed:profiles/student-1/a.jpg", items.get(0).get("photoThumbUrl"));
    assertEquals("EM-00131", items.get(0).get("elevateMeId"));
    assertEquals("DRAFT", items.get(0).get("evalStatus"));
  }

  // ------------------------------------------------------------------
  // 8. idempotency: same key + differing payload → 409
  // ------------------------------------------------------------------

  @Test
  void idempotencyDifferingPayload_409() {
    IdempotencyService idem = new IdempotencyService();
    String op = "POST /api/v1/programs/{id}/submit";
    String key = "key-1";
    Map<String, Object> first = Map.of("id", "prog-1", "lifecycle", "PENDING_REVIEW");
    Map<String, Object> stored = idem.execute("actor-1", op, key,
        IdempotencyService.hashPayload("submit:prog-1"), () -> first);
    assertEquals(first, stored);
    // Exact replay returns stored response.
    Map<String, Object> replay = idem.execute("actor-1", op, key,
        IdempotencyService.hashPayload("submit:prog-1"), () -> Map.of("other", true));
    assertEquals(first, replay);
    // Differing payload same key → 409 IDEMPOTENCY_CONFLICT.
    ConflictException conflict = assertThrows(ConflictException.class,
        () -> idem.execute("actor-1", op, key,
            IdempotencyService.hashPayload("submit:prog-2"), () -> first));
    assertEquals("IDEMPOTENCY_CONFLICT", conflict.getCode());
    // Different actor does NOT collide.
    Map<String, Object> other = idem.execute("actor-2", op, key,
        IdempotencyService.hashPayload("submit:prog-2"), () -> first);
    assertEquals(first, other);
  }

  // ------------------------------------------------------------------
  // 9. approve requires note for CHANGES_REQUESTED/REJECTED (422)
  // ------------------------------------------------------------------

  @Test
  void approveRequiresNote_422() {
    ProgramsService svc = new ProgramsService(auth, programRepo, guard, audit, outbox, null);
    doNothing().when(guard).requireAdmin(eq("admin-sub"), any());
    assertThrows(IllegalArgumentException.class,
        () -> svc.approve("admin-sub", "prog-1",
            new ProgramDtos.ApproveRequest("CHANGES_REQUESTED", null), "req-1"));
    assertThrows(IllegalArgumentException.class,
        () -> svc.approve("admin-sub", "prog-1",
            new ProgramDtos.ApproveRequest("REJECTED", "  "), "req-2"));
  }
}
