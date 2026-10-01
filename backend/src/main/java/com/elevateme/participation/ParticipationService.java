package com.elevateme.participation;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AccountPendingException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ScopeGuard;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 2 registration state machine + organizer-scoped roster/attendance
 * (spec §10 + §11). All reads enforce the Phase 1c scoping pattern
 * (authenticatedSubject + ids).
 *
 * <p>Rules:
 * <ul>
 *   <li>Registrations: student only (own studentId from subject), capacity via
 *       SELECT FOR UPDATE + COUNT confirmed, eligibility, deadline, dedupe via
 *       partial unique indexes → 409 DUPLICATE. Withdraw before deadline, own only.
 *       Confirmed attendance is recorded by staff separately — never inferred
 *       from registration rows.</li>
 *   <li>Attendance: staff scope via ScopeGuard.checkRosterAccess. Absence is NOT
 *       a zero score — this method never writes evaluation_scores.</li>
 *   <li>Roster: staff only, server-side search/filters, 10/page stable sort.</li>
 * </ul>
 * All writes emit same-transaction outbox + audit_event (actor, action, entity,
 * requestId, no PII). Idempotency-Key (actor+operation) for register/withdraw/attendance;
 * differing payload with the same key → 409.
 */
@Service
public class ParticipationService {
  private static final Set<String> ATTENDANCE_STATUSES =
      Set.of("ATTENDED", "ABSENT", "EXCLUDED");

  private final AuthContext auth;
  private final ParticipationRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;

  /** Signs a private photo_key to a 300s thumb URL (null when unset). Test-overridable. */
  private Function<String, String> photoSigner;

  /** Legacy 3-arg wiring (kept for Phase 1c callers). */
  public ParticipationService(
      AuthContext auth, ParticipationRepository repo, ScopeGuard guard) {
    this(auth, repo, guard, null, null, null);
  }

  public ParticipationService(
      AuthContext auth,
      ParticipationRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      IdempotencyService idempotency) {
    this.auth = auth;
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.idempotency = idempotency;
  }

  /** Test hook: override photo signing (e.g. return "signed:" + key). */
  public void setPhotoSigner(Function<String, String> signer) {
    this.photoSigner = signer;
  }

  public List<Map<String, Object>> getRoster(
      String authenticatedSubject, String sessionId, String requestId) {
    return repo.findRosterForSession(authenticatedSubject, sessionId, requestId);
  }

  public List<Map<String, Object>> getRegistrationsForStudent(
      String authenticatedSubject, String studentId, String requestId) {
    return repo.findRegistrationsForStudent(authenticatedSubject, studentId, requestId);
  }

  public String currentSubject() {
    return auth.currentSubject();
  }

  // ------------------------------------------------------------------
  // Register
  // ------------------------------------------------------------------

  /**
   * POST /programs/{id}/registrations {sessionId?, allocation?}.
   * Student only (own studentId from subject).
   */
  @Transactional
  public Map<String, Object> register(
      String authenticatedSubject,
      String programId,
      ParticipationDtos.RegisterRequest req,
      String requestId,
      String idempotencyKey) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String role = caller.get("role") == null ? "" : String.valueOf(caller.get("role"));
    String status = caller.get("status") == null ? "" : String.valueOf(caller.get("status"));
    if ("PendingReview".equals(status)) {
      if (audit != null) {
        audit.record(String.valueOf(caller.get("id")),
            "ACCESS_DENIED_PENDING", "registration_create", programId, requestId);
      }
      throw new AccountPendingException("Account pending review");
    }
    if (!"student".equalsIgnoreCase(role)) {
      if (audit != null) {
        audit.record(String.valueOf(caller.get("id")),
            "ACCESS_DENIED", "registration_create", programId, requestId);
      }
      throw new AccessDeniedException("Students only");
    }
    if (!"Approved".equals(status)) {
      if (audit != null) {
        audit.record(String.valueOf(caller.get("id")),
            "ACCESS_DENIED", "registration_create", programId, requestId);
      }
      throw new AccessDeniedException("Not permitted");
    }
    String studentId = String.valueOf(caller.get("id"));
    String sessionId = req == null ? null : emptyToNull(req.sessionId());
    String allocation = req == null ? null : emptyToNull(req.allocation());

    String operation = "POST /api/v1/programs/{id}/registrations";
    String payloadHash = IdempotencyService.hashPayload(
        "register:" + programId + ":" + sessionId + ":" + allocation + ":" + studentId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }

    // Capacity: SELECT FOR UPDATE on programs row, then COUNT confirmed.
    Map<String, Object> locked = repo.lockProgramRow(programId);
    int capacity = toInt(locked.get("capacity"), 0);
    int confirmed = repo.countConfirmed(programId);
    if (capacity > 0 && confirmed >= capacity) {
      if (audit != null) {
        audit.record(studentId, "CAPACITY_EXCEEDED", "registration", programId, requestId);
      }
      throw new ConflictException("CAPACITY", "Program is at capacity");
    }

    // Deadline: now < registration_deadline (when set).
    Map<String, Object> meta = repo.findProgramMeta(programId);
    Instant deadline = toInstant(meta.get("registrationDeadline"));
    if (deadline != null && !Instant.now().isBefore(deadline)) {
      throw new ConflictException("REGISTRATION_CLOSED", "Registration window has closed");
    }

    // Eligibility: when the program pins an institute, the student's institute must match.
    String eligibility = meta.get("eligibility") == null ? null : String.valueOf(meta.get("eligibility"));
    if (eligibility != null && !eligibility.isBlank()) {
      checkEligibility(eligibility, caller, programId, requestId);
    }

    // Dedupe: partial unique (program-level + session-level).
    if (repo.existsRegistration(studentId, programId, sessionId)) {
      throw new ConflictException("DUPLICATE", "Already registered");
    }

    String regId;
    try {
      regId = repo.insertRegistration(studentId, programId, sessionId, allocation);
    } catch (DuplicateKeyException e) {
      // Race lost: unique index fired → 409 DUPLICATE.
      throw new ConflictException("DUPLICATE", "Already registered");
    }

    if (audit != null) {
      audit.record(studentId, "REGISTRATION_CREATED", "registration", regId, requestId);
    }
    if (outbox != null) {
      outbox.emit("registration", regId, "REGISTRATION_CREATED",
          "{\"programId\":\"" + programId + "\"}",
          "REGISTRATION_CREATED:" + studentId + ":" + programId + ":" + sessionId);
    }
    Map<String, Object> result = repo.findRegistrationById(regId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Withdraw
  // ------------------------------------------------------------------

  /** POST /registrations/{id}/withdraw before deadline (own only). */
  @Transactional
  public Map<String, Object> withdraw(
      String authenticatedSubject, String registrationId, String requestId) {
    return withdraw(authenticatedSubject, registrationId, requestId, null);
  }

  /**
   * Withdraw with Idempotency-Key (actor+operation scoped; differing payload → 409).
   */
  @Transactional
  public Map<String, Object> withdraw(
      String authenticatedSubject, String registrationId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/registrations/{id}/withdraw";
    String payloadHash = IdempotencyService.hashPayload("withdraw:" + registrationId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    Map<String, Object> reg = repo.findRegistrationById(registrationId);
    String ownerId = String.valueOf(reg.get("studentId"));
    boolean isAdmin = "admin".equalsIgnoreCase(String.valueOf(caller.get("role")))
        && "Approved".equals(String.valueOf(caller.get("status")));
    if (!ownerId.equals(callerId) && !isAdmin) {
      if (audit != null) {
        audit.record(callerId, "ACCESS_DENIED", "registration_withdraw", registrationId, requestId);
      }
      throw new AccessDeniedException("Own registrations only");
    }
    String programId = String.valueOf(reg.get("programId"));
    Map<String, Object> meta = repo.findProgramMeta(programId);
    Instant deadline = toInstant(meta.get("registrationDeadline"));
    if (deadline != null && !Instant.now().isBefore(deadline)) {
      throw new ConflictException("REGISTRATION_CLOSED", "Withdraw window has closed");
    }
    int updated = repo.markWithdrawn(registrationId);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Registration cannot be withdrawn");
    }
    if (audit != null) {
      audit.record(callerId, "REGISTRATION_WITHDRAWN", "registration", registrationId, requestId);
    }
    if (outbox != null) {
      outbox.emit("registration", registrationId, "REGISTRATION_WITHDRAWN", "{}",
          "REGISTRATION_WITHDRAWN:" + registrationId + ":" + requestId);
    }
    Map<String, Object> result = repo.findRegistrationById(registrationId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Attendance
  // ------------------------------------------------------------------

  /**
   * PATCH /sessions/{id}/attendance. Staff scope via checkRosterAccess.
   * Absence is NOT a zero score — never writes evaluation_scores.
   */
  @Transactional
  public Map<String, Object> markAttendance(
      String authenticatedSubject,
      String sessionId,
      ParticipationDtos.AttendancePatchRequest req,
      String requestId) {
    return markAttendance(authenticatedSubject, sessionId, req, requestId, null);
  }

  /**
   * Attendance with Idempotency-Key (actor+operation scoped; differing payload → 409).
   */
  @Transactional
  public Map<String, Object> markAttendance(
      String authenticatedSubject,
      String sessionId,
      ParticipationDtos.AttendancePatchRequest req,
      String requestId,
      String idempotencyKey) {
    String operation = "PATCH /api/v1/sessions/{id}/attendance";
    String payloadHash = IdempotencyService.hashPayload("attendance:" + sessionId + ":" + canonicalAttendance(req));
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    if (req == null || req.records() == null || req.records().isEmpty()) {
      throw new IllegalArgumentException("records must not be empty");
    }
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : String.valueOf(caller.get("id"));
    int saved = 0;
    for (ParticipationDtos.AttendanceRecord r : req.records()) {
      if (r.studentId() == null || r.studentId().isBlank()) {
        throw new IllegalArgumentException("studentId is required");
      }
      String st = r.status() == null ? "" : r.status().trim().toUpperCase();
      if (!ATTENDANCE_STATUSES.contains(st)) {
        throw new IllegalArgumentException("Unknown attendance status: " + r.status());
      }
      if ("EXCLUDED".equals(st) && (r.reason() == null || r.reason().isBlank())) {
        throw new IllegalArgumentException("reason is required for EXCLUDED");
      }
      repo.upsertAttendance(sessionId, r.studentId().trim(), st, actorId, emptyToNull(r.reason()));
      saved++;
    }
    if (audit != null) {
      audit.record(actorId, "ATTENDANCE_MARKED", "session", sessionId, requestId);
    }
    if (outbox != null) {
      outbox.emit("attendance", sessionId, "ATTENDANCE_MARKED",
          "{\"saved\":" + saved + "}", "ATTENDANCE_MARKED:" + sessionId + ":" + requestId);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("saved", saved);
    out.put("total", req.records().size());
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, out);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Roster (detailed)
  // ------------------------------------------------------------------

  /**
   * GET /sessions/{id}/roster: staff only. Server-side search (q=name|ID) +
   * filters (committee, status), paginated 10/page, stable sort (name, id).
   */
  public Map<String, Object> getRosterDetailed(
      String authenticatedSubject, String sessionId,
      String q, String committee, String status, int page, String requestId) {
    guard.checkRosterAccess(authenticatedSubject, sessionId, requestId);
    return rosterPage(sessionId, q, committee, status, page);
  }

  /**
   * Guest scoped roster: scope already verified via {@code GuestService#requireGuestScope}
   * (unrelated =&gt; 404). No staff guard here — the invitation scope is the gate.
   */
  public Map<String, Object> getRosterDetailedForGuest(
      String sessionId, String q, String committee, String status, int page) {
    return rosterPage(sessionId, q, committee, status, page);
  }

  private Map<String, Object> rosterPage(
      String sessionId, String q, String committee, String status, int page) {
    int safePage = Math.max(1, page);
    int limit = 10;
    int offset = (safePage - 1) * limit;
    List<Map<String, Object>> rows =
        repo.findRosterDetailed(sessionId, emptyToNull(q), emptyToNull(committee),
            emptyToNull(status), limit, offset);
    int total = repo.countRoster(sessionId, emptyToNull(q), emptyToNull(committee), emptyToNull(status));
    List<Map<String, Object>> items = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      Map<String, Object> item = new HashMap<>(r);
      Object photoKey = r.get("photoKey");
      if (photoKey == null || String.valueOf(photoKey).isBlank()) {
        item.put("photoThumbUrl", null);
      } else if (photoSigner != null) {
        try {
          item.put("photoThumbUrl", photoSigner.apply(String.valueOf(photoKey)));
        } catch (Exception e) {
          item.put("photoThumbUrl", null);
        }
      } else {
        // No signer wired (skeleton): null rather than a permanent public URL.
        // Wire SupabaseStorageClient.createSignedReadUrl(photoKey, 300) here.
        item.put("photoThumbUrl", null);
      }
      item.remove("photoKey");
      items.add(item);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("items", items);
    out.put("page", safePage);
    out.put("pageSize", limit);
    out.put("total", total);
    return out;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private void checkEligibility(
      String eligibility, Map<String, Object> caller, String programId, String requestId) {
    // Convention: "INSTITUTE=<uuid>" pins registration to one institute.
    // Free-text eligibility is informational (TODO: rule engine); only the
    // institute pin is enforced here.
    String upper = eligibility.toUpperCase();
    if (upper.contains("INSTITUTE=")) {
      String required = eligibility.substring(eligibility.toUpperCase().indexOf("INSTITUTE=") + 10)
          .trim().split("[\\s,}]+")[0];
      Object mine = caller.get("instituteId");
      String mineStr = mine == null ? null : String.valueOf(mine);
      if (mineStr == null || !mineStr.equalsIgnoreCase(required)) {
        if (audit != null) {
          audit.record(String.valueOf(caller.get("id")),
              "ACCESS_DENIED", "registration_eligibility", programId, requestId);
        }
        throw new AccessDeniedException("Not eligible for this program");
      }
    }
  }

  private static String emptyToNull(String s) {
    return s == null || s.isBlank() ? null : s.trim();
  }

  private static String canonicalAttendance(ParticipationDtos.AttendancePatchRequest req) {
    if (req == null || req.records() == null) {
      return "empty";
    }
    StringBuilder sb = new StringBuilder();
    for (ParticipationDtos.AttendanceRecord r : req.records()) {
      sb.append(r.studentId() == null ? "" : r.studentId().trim()).append(":")
          .append(r.status() == null ? "" : r.status().trim().toUpperCase()).append(":")
          .append(r.reason() == null ? "" : r.reason().trim()).append(";");
    }
    return sb.toString();
  }

  private static int toInt(Object v, int dflt) {
    if (v == null) {
      return dflt;
    }
    if (v instanceof Number n) {
      return n.intValue();
    }
    try {
      return Integer.parseInt(String.valueOf(v));
    } catch (Exception e) {
      return dflt;
    }
  }

  private static Instant toInstant(Object v) {
    if (v == null) {
      return null;
    }
    if (v instanceof Instant i) {
      return i;
    }
    if (v instanceof java.sql.Timestamp ts) {
      return ts.toInstant();
    }
    if (v instanceof java.util.Date d) {
      return d.toInstant();
    }
    if (v instanceof String s && !s.isBlank()) {
      try {
        return Instant.parse(s);
      } catch (Exception ignored) {
        return null;
      }
    }
    return null;
  }
}
