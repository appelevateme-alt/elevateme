package com.elevateme.opportunities;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.notifications.NotificationsService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 5 development opportunities + offline payment verification
 * (spec §10 + §11).
 *
 * <ul>
 *   <li>Admin creates an opportunity (details/date/capacity, FREE|PAID,
 *       price/currency, EXTERNAL https payment URL, partner, deadline).
 *       Paid rows never touch card data — only the external URL + reference.</li>
 *   <li>Assignment is targeted only: assignees see the event (reason, date,
 *       price/free, eligibility, availability); non-assignees get 404 on UI +
 *       API. Overlapping batches dedupe. Removal flips the assignment to
 *       REMOVED (blocks new registration) but NEVER silently cancels a
 *       confirmed registration — cancellation is the separate audited +
 *       notified withdraw flow.</li>
 *   <li>Student registration: FREE confirms subject to capacity; PAID creates a
 *       Pending registration + PENDING verification and returns
 *       AWAITING_PAYMENT_VERIFICATION with the external link (flagged
 *       external) and the hold expiry (48h or deadline, whichever first,
 *       displayed upfront).</li>
 *   <li>"I have paid" (payment-reference) only submits the reference for
 *       review — it does NOT confirm. Admin VERIFIED confirms (records admin +
 *       time); REJECTED needs a reason. Late (EXPIRED) payments stay open for
 *       manual review — never a silent refund. Expiry frees the hold +
 *       notifies; staff may extend before expiry.</li>
 * </ul>
 *
 * <p>Every write emits same-transaction outbox + audit (actor, action, entity,
 * requestId, no PII).
 */
@Service
public class DevelopmentService {
  /** Default payment hold: 48 hours or the event deadline, whichever first. */
  public static final Duration HOLD = Duration.ofHours(48);

  private static final Set<String> BILLING = Set.of("FREE", "PAID");
  private static final Set<String> DECISIONS = Set.of("VERIFIED", "REJECTED");

  private final AuthContext auth;
  private final DevelopmentRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;
  private final NotificationsService notifications;

  /** Legacy wiring (skeleton callers/tests). */
  public DevelopmentService(AuthContext auth) {
    this(auth, null, null, null, null, null, null);
  }

  @Autowired
  public DevelopmentService(
      AuthContext auth,
      DevelopmentRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      IdempotencyService idempotency,
      NotificationsService notifications) {
    this.auth = auth;
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.idempotency = idempotency;
    this.notifications = notifications;
  }

  public String currentSubject() {
    return auth.currentSubject();
  }

  // ------------------------------------------------------------------
  // Pure helpers (unit-testable)
  // ------------------------------------------------------------------

  public static String normalizeBilling(String raw) {
    if (raw == null || raw.isBlank()) {
      return "FREE";
    }
    String n = raw.trim().toUpperCase();
    if (!BILLING.contains(n)) {
      throw new IllegalArgumentException("Unknown billingType: " + raw + " (expected FREE|PAID)");
    }
    return n;
  }

  public static String normalizeDecision(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("decision is required (VERIFIED|REJECTED)");
    }
    String n = raw.trim().toUpperCase();
    if (!DECISIONS.contains(n)) {
      throw new IllegalArgumentException("Unknown decision: " + raw);
    }
    return n;
  }

  public static void requireHttpsUrl(String url) {
    if (url == null || !url.trim().toLowerCase().startsWith("https://")) {
      throw new IllegalArgumentException("paymentUrl must be an external https:// URL");
    }
  }

  /**
   * Hold expiry: 48h from {@code now} or the event deadline, whichever first.
   * Displayed upfront on every paid response.
   */
  public static Instant computeHoldExpiry(Instant now, Instant deadline) {
    Instant hold = now.plus(HOLD);
    if (deadline != null && deadline.isBefore(hold)) {
      return deadline;
    }
    return hold;
  }

  public static List<String> dedupeIds(List<String> ids) {
    if (ids == null) {
      return List.of();
    }
    LinkedHashSet<String> out = new LinkedHashSet<>();
    for (String id : ids) {
      if (id != null && !id.isBlank()) {
        out.add(id.trim());
      }
    }
    return new ArrayList<>(out);
  }

  // ------------------------------------------------------------------
  // Admin: create
  // ------------------------------------------------------------------

  /**
   * POST /admin/development: admin creates the opportunity (backed by a
   * SPECIAL program row so registrations/payments reuse the V4 tables).
   */
  @Transactional
  public Map<String, Object> create(
      String authenticatedSubject, DevelopmentDtos.CreateDevelopmentRequest req,
      String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    if (req.details() == null || req.details().isBlank()) {
      throw new IllegalArgumentException("details are required");
    }
    if (req.capacity() == null || req.capacity() < 1) {
      throw new IllegalArgumentException("capacity must be >= 1");
    }
    String billing = normalizeBilling(req.billingType());
    if ("PAID".equals(billing)) {
      if (req.price() == null || req.price() <= 0) {
        throw new IllegalArgumentException("price is required for paid development");
      }
      if (req.currency() == null || req.currency().isBlank()) {
        throw new IllegalArgumentException("currency is required for paid development");
      }
      if (req.paymentUrl() == null || req.paymentUrl().isBlank()) {
        throw new IllegalArgumentException("paymentUrl is required for paid development");
      }
      requireHttpsUrl(req.paymentUrl());
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    String title = titleFrom(req.details());
    String programId = repo.insertBackingProgram(
        "dev-" + UUID.randomUUID().toString().substring(0, 8), title,
        req.details().trim(), req.capacity(), req.date(), req.deadline(),
        emptyToNull(req.partner()), actorId);
    String eventId = repo.insertEvent(
        programId, req.details().trim(), req.date(), req.capacity(), billing,
        req.price(), emptyToNull(req.currency()),
        "PAID".equals(billing) ? req.paymentUrl().trim() : null,
        emptyToNull(req.partner()), req.deadline(), actorId);
    audit(actorId, "DEVELOPMENT_CREATED", "development_event", eventId, requestId);
    emit(programId, "DEVELOPMENT_CREATED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", eventId);
    out.put("programId", programId);
    out.put("title", title);
    out.put("billingType", billing);
    return out;
  }

  // ------------------------------------------------------------------
  // Admin: targeted assign (+ removal)
  // ------------------------------------------------------------------

  /**
   * POST /admin/development/{id}/assign: targeted only. Overlapping batches
   * dedupe (active-unique). Returns assigned + skippedDuplicates.
   */
  @Transactional
  public Map<String, Object> assign(
      String authenticatedSubject, String eventId,
      DevelopmentDtos.AssignRequest req, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    String programId = repo.findProgramIdForEvent(eventId);
    LinkedHashSet<String> targets = new LinkedHashSet<>();
    if (req.recipientIds() != null && !req.recipientIds().isEmpty()) {
      targets.addAll(repo.findApprovedStudentsByIds(dedupeIds(req.recipientIds())));
    }
    if (req.audienceRule() != null && req.audienceRule().institutionId() != null
        && !req.audienceRule().institutionId().isBlank()) {
      targets.addAll(repo.findApprovedStudentsByInstitution(
          req.audienceRule().institutionId().trim()));
    }
    if (targets.isEmpty()) {
      throw new IllegalArgumentException("no matching recipients to assign");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    String reason = req.reason() == null ? "" : req.reason();
    int assigned = 0;
    int skipped = 0;
    for (String studentId : targets) {
      int n = repo.insertAssignmentDeduped(studentId, programId, reason, actorId);
      if (n == 0) {
        skipped++;
      } else {
        assigned++;
        notifyStudent(studentId, programId, "DEVELOPMENT_ASSIGNED", requestId);
      }
    }
    audit(actorId, "DEVELOPMENT_ASSIGNED", "development_event", eventId, requestId);
    emit(programId, "DEVELOPMENT_ASSIGNED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", eventId);
    out.put("assigned", assigned);
    out.put("skippedDuplicates", skipped);
    return out;
  }

  /**
   * Remove an assignee: flips ASSIGNED/IN_PROGRESS -&gt; REMOVED (blocks new
   * registration) + notifies. Registration rows are NEVER touched here —
   * confirmed registrations are cancelled only via the separate audited +
   * notified withdraw flow.
   */
  @Transactional
  public Map<String, Object> removeAssignee(
      String authenticatedSubject, String eventId, String studentId, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    String programId = repo.findProgramIdForEvent(eventId);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    int updated = repo.markAssignmentRemoved(studentId, programId);
    if (updated == 0) {
      throw new ResourceNotFoundException("Not found");
    }
    audit(actorId, "DEVELOPMENT_UNASSIGNED", "development_event", eventId, requestId);
    notifyStudent(studentId, programId, "DEVELOPMENT_UNASSIGNED", requestId);
    emit(programId, "DEVELOPMENT_UNASSIGNED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", eventId);
    out.put("studentId", studentId);
    out.put("state", "REMOVED");
    return out;
  }

  // ------------------------------------------------------------------
  // Student: assigned-only reads
  // ------------------------------------------------------------------

  /**
   * GET /me/development: assigned events only (reason, date, price/free,
   * eligibility, availability, hold info). Non-assignees see nothing here and
   * get 404 on direct fetch.
   */
  public List<Map<String, Object>> listMine(String authenticatedSubject, String requestId) {
    String studentId = ownStudentId(authenticatedSubject, requestId);
    List<Map<String, Object>> rows = repo.findEventsForStudent(studentId);
    List<Map<String, Object>> out = new ArrayList<>(rows.size());
    for (Map<String, Object> row : rows) {
      out.add(enrichWithAvailability(row));
    }
    return out;
  }

  /** Direct fetch: 404 unless assigned (or admin). */
  public Map<String, Object> getMine(
      String authenticatedSubject, String eventId, String requestId) {
    Map<String, Object> event = repo.findEventById(eventId);
    String programId = String.valueOf(event.get("programId"));
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    boolean admin = "admin".equalsIgnoreCase(String.valueOf(caller.get("role")))
        && "Approved".equals(String.valueOf(caller.get("status")));
    if (!admin) {
      String studentId = callerId;
      if ("parent".equalsIgnoreCase(String.valueOf(caller.get("role")))) {
        String child = repo.findLinkedChildId(callerId);
        if (child == null) {
          throw new ResourceNotFoundException("Not found");
        }
        studentId = child;
      }
      if (repo.findActiveAssignment(studentId, programId) == null) {
        throw new ResourceNotFoundException("Not found");
      }
    }
    return enrichWithAvailability(event);
  }

  // ------------------------------------------------------------------
  // Student: register (FREE confirm vs PAID hold)
  // ------------------------------------------------------------------

  /**
   * FREE confirms subject to capacity; PAID creates a Pending registration +
   * PENDING verification and returns AWAITING_PAYMENT_VERIFICATION with the
   * external link (flagged external) + hold expiry (48h or deadline first,
   * displayed upfront).
   */
  @Transactional
  public Map<String, Object> register(
      String authenticatedSubject, String eventId, String requestId) {
    return register(authenticatedSubject, eventId, requestId, null);
  }

  @Transactional
  public Map<String, Object> register(
      String authenticatedSubject, String eventId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/me/development/{id}/register";
    String payloadHash = IdempotencyService.hashPayload("dev-register:" + eventId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    String studentId = ownStudentId(authenticatedSubject, requestId);
    Map<String, Object> event = repo.findEventById(eventId);
    String programId = String.valueOf(event.get("programId"));
    if (repo.findActiveAssignment(studentId, programId) == null) {
      // Removed or never assigned: 404 (targeted invisibility, no enumeration).
      throw new ResourceNotFoundException("Not found");
    }
    if (repo.existsRegistration(studentId, programId)) {
      throw new ConflictException("DUPLICATE", "Already registered");
    }
    Map<String, Object> locked = repo.lockProgramRow(programId);
    int capacity = toInt(locked.get("capacity"), toInt(event.get("capacity"), 0));
    int taken = repo.countConfirmed(programId) + repo.countActiveHolds(programId);
    if (capacity > 0 && taken >= capacity) {
      audit(studentId, "CAPACITY_EXCEEDED", "development_event", eventId, requestId);
      throw new ConflictException("CAPACITY", "Development is at capacity");
    }
    String billing = String.valueOf(event.get("billingType"));
    Map<String, Object> out = new LinkedHashMap<>();
    if ("PAID".equalsIgnoreCase(billing)) {
      String regId = repo.insertRegistration(studentId, programId, "Pending");
      Instant holdExpiry = computeHoldExpiry(Instant.now(), toInstant(event.get("deadline")));
      repo.insertVerification(regId, "", holdExpiry);
      audit(studentId, "DEVELOPMENT_REGISTERED_PENDING_PAYMENT", "registration", regId, requestId);
      emit(programId, "DEVELOPMENT_REGISTERED_PENDING_PAYMENT", requestId);
      out.put("registrationId", regId);
      out.put("status", "AWAITING_PAYMENT_VERIFICATION");
      out.put("paymentUrl", String.valueOf(event.get("paymentUrl")));
      out.put("external", true);
      out.put("externalNotice",
          "You will pay on an external site. ElevateMe never sees your card details.");
      out.put("price", event.get("price"));
      out.put("currency", event.get("currency"));
      out.put("holdExpiresAt", holdExpiry.toString());
    } else {
      String regId = repo.insertRegistration(studentId, programId, "CONFIRMED");
      audit(studentId, "DEVELOPMENT_REGISTERED", "registration", regId, requestId);
      emit(programId, "DEVELOPMENT_REGISTERED", requestId);
      out.put("registrationId", regId);
      out.put("status", "CONFIRMED");
    }
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, out);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Payments: claim (never confirms) / verify / extend / expire
  // ------------------------------------------------------------------

  /**
   * POST /registrations/{id}/payment-reference: "I have paid" submits the
   * reference for review. State stays PENDING and the registration is NOT
   * confirmed by this write. A REJECTED verification re-opens to PENDING.
   */
  @Transactional
  public Map<String, Object> submitPaymentReference(
      String authenticatedSubject, String registrationId, String reference, String requestId) {
    if (reference == null || reference.isBlank()) {
      throw new IllegalArgumentException("reference is required");
    }
    if (reference.trim().length() > 128) {
      throw new IllegalArgumentException("reference must be at most 128 characters");
    }
    Map<String, Object> reg = repo.findRegistrationById(registrationId);
    String studentId = ownStudentId(authenticatedSubject, requestId);
    if (!studentId.equals(String.valueOf(reg.get("studentId")))) {
      audit(studentId, "ACCESS_DENIED", "payment_claim", registrationId, requestId);
      throw new AccessDeniedException("Own registrations only");
    }
    Map<String, Object> verification = repo.findVerificationByRegistration(registrationId);
    if (verification == null) {
      throw new ConflictException("INVALID_STATE",
          "This registration does not require payment verification");
    }
    String state = String.valueOf(verification.get("state"));
    String verificationId = String.valueOf(verification.get("id"));
    if ("VERIFIED".equals(state)) {
      throw new ConflictException("INVALID_STATE", "Payment is already verified");
    }
    if ("REJECTED".equals(state)) {
      repo.reopenToPending(verificationId, reference.trim());
    } else {
      repo.claimVerification(verificationId, reference.trim());
    }
    // Claim NEVER confirms: registration stays Pending; verification PENDING.
    audit(studentId, "PAYMENT_CLAIMED", "payment_verification", verificationId, requestId);
    notifyAdmins(String.valueOf(reg.get("programId")), "PAYMENT_AWAITING_REVIEW", requestId);
    emit(String.valueOf(reg.get("programId")), "PAYMENT_CLAIMED", requestId);
    Map<String, Object> out = new LinkedHashMap<>(repo.findVerificationById(verificationId));
    out.put("confirmed", false);
    return out;
  }

  /** GET /admin/payments?state=PENDING: student, event, reference, pending age. */
  public List<Map<String, Object>> listPayments(
      String authenticatedSubject, String state, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    String norm = state == null || state.isBlank() ? "PENDING" : state.trim().toUpperCase();
    return repo.findVerificationsByState(norm, 100);
  }

  /**
   * POST /admin/payments/{id}/verify: VERIFIED confirms the registration
   * (records admin + time); REJECTED needs a reason. EXPIRED rows stay open
   * for manual review here — never a silent refund. Only the external
   * reference is stored; card data is never accepted.
   */
  @Transactional
  public Map<String, Object> verifyPayment(
      String authenticatedSubject, String paymentId,
      DevelopmentDtos.VerifyPaymentRequest req, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    String decision = normalizeDecision(req.decision());
    if ("REJECTED".equals(decision) && (req.reason() == null || req.reason().isBlank())) {
      throw new IllegalArgumentException("reason is required for REJECTED");
    }
    sweepExpired(requestId);
    Map<String, Object> verification = repo.findVerificationById(paymentId);
    String state = String.valueOf(verification.get("state"));
    if ("VERIFIED".equals(state)) {
      throw new ConflictException("INVALID_STATE", "Payment is already verified");
    }
    if (!"PENDING".equals(state) && !"EXPIRED".equals(state)) {
      throw new ConflictException("INVALID_STATE",
          "Only PENDING or EXPIRED (late manual review) can be decided");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    String registrationId = String.valueOf(verification.get("registrationId"));
    String studentId = String.valueOf(verification.get("studentId"));
    String programId = String.valueOf(verification.get("programId"));
    if ("VERIFIED".equals(decision)) {
      // Re-check capacity at confirm time (holds + confirmed).
      repo.lockProgramRow(programId);
      Map<String, Object> event = repo.findEventByProgramId(programId);
      int capacity = event == null ? 0 : toInt(event.get("capacity"), 0);
      int taken = repo.countConfirmed(programId) + repo.countActiveHolds(programId);
      // This verification's own hold is counted in taken; confirming it keeps
      // occupancy identical, so allow taken <= capacity... but a stricter
      // reading (confirmed-only) risks overbooking. Confirming converts this
      // hold into a confirmed seat: allow while taken <= capacity.
      if (capacity > 0 && taken > capacity) {
        throw new ConflictException("CAPACITY", "Development is at capacity");
      }
      int updated = repo.verifyVerification(paymentId, "VERIFIED", actorId, null);
      if (updated == 0) {
        throw new ConflictException("INVALID_STATE", "Verify race; refresh and retry");
      }
      repo.markRegistrationConfirmed(registrationId);
      audit(actorId, "PAYMENT_VERIFIED", "payment_verification", paymentId, requestId);
      notifyStudent(studentId, programId, "PAYMENT_VERIFIED", requestId);
      emit(programId, "PAYMENT_VERIFIED", requestId);
    } else {
      int updated =
          repo.verifyVerification(paymentId, "REJECTED", actorId, req.reason().trim());
      if (updated == 0) {
        throw new ConflictException("INVALID_STATE", "Verify race; refresh and retry");
      }
      audit(actorId, "PAYMENT_REJECTED", "payment_verification", paymentId, requestId);
      notifyStudent(studentId, programId, "PAYMENT_REJECTED", requestId);
      emit(programId, "PAYMENT_REJECTED", requestId);
    }
    return repo.findVerificationById(paymentId);
  }

  /** Staff extend before expiry (PENDING only). */
  @Transactional
  public Map<String, Object> extendHold(
      String authenticatedSubject, String paymentId, Instant newExpiresAt, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (newExpiresAt == null || !newExpiresAt.isAfter(Instant.now())) {
      throw new IllegalArgumentException("expiresAt must be in the future");
    }
    Map<String, Object> verification = repo.findVerificationById(paymentId);
    if (!"PENDING".equals(String.valueOf(verification.get("state")))) {
      throw new ConflictException("INVALID_STATE", "Only PENDING holds can be extended");
    }
    int updated = repo.extendVerification(paymentId, newExpiresAt);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Extend race; refresh and retry");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    audit(actorId, "PAYMENT_HOLD_EXTENDED", "payment_verification", paymentId, requestId);
    return repo.findVerificationById(paymentId);
  }

  /**
   * Expiry sweep: PENDING past expiry -&gt; EXPIRED, freeing the hold +
   * notifying the student. Called lazily on verify paths; wire to a scheduler
   * for prompt frees.
   */
  @Transactional
  public Map<String, Object> expireHolds(String authenticatedSubject, String requestId) {
    if (authenticatedSubject != null) {
      guard.requireAdmin(authenticatedSubject, requestId);
    }
    return sweepExpired(requestId);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private Map<String, Object> sweepExpired(String requestId) {
    List<Map<String, Object>> expired = repo.expireDueHolds();
    for (Map<String, Object> row : expired) {
      String verificationId = String.valueOf(row.get("id"));
      audit("system", "PAYMENT_EXPIRED", "payment_verification", verificationId, requestId);
      try {
        Map<String, Object> v = repo.findVerificationById(verificationId);
        notifyStudent(String.valueOf(v.get("studentId")),
            String.valueOf(v.get("programId")), "PAYMENT_EXPIRED", requestId);
        emit(String.valueOf(v.get("programId")), "PAYMENT_EXPIRED", requestId);
      } catch (Exception ignored) {
        // Best-effort notify; the EXPIRED state is the source of truth.
      }
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("expired", expired.size());
    return out;
  }

  private Map<String, Object> enrichWithAvailability(Map<String, Object> row) {
    Map<String, Object> out = new LinkedHashMap<>(row);
    try {
      String programId = String.valueOf(row.get("programId"));
      int capacity = toInt(row.get("capacity"), 0);
      int confirmed = repo.countConfirmed(programId);
      int holds = repo.countActiveHolds(programId);
      out.put("confirmed", confirmed);
      out.put("activeHolds", holds);
      out.put("availability", Math.max(0, capacity - confirmed - holds));
      out.put("free", !"PAID".equalsIgnoreCase(String.valueOf(row.get("billingType"))));
    } catch (Exception ignored) {
      out.put("availability", null);
    }
    return out;
  }

  private String ownStudentId(String authenticatedSubject, String requestId) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String role = String.valueOf(caller.get("role"));
    if (!"student".equalsIgnoreCase(role)) {
      throw new AccessDeniedException("Students only");
    }
    if (!"Approved".equals(String.valueOf(caller.get("status")))) {
      throw new AccessDeniedException("Not permitted");
    }
    return String.valueOf(caller.get("id"));
  }

  private void notifyStudent(String studentId, String programId, String type, String requestId) {
    if (notifications != null) {
      try {
        notifications.notify(studentId, type, "development", programId, 1, "{}",
            type + ":" + programId + ":" + studentId);
      } catch (Exception ignored) {
        // Best-effort; the outbox event below is the backstop.
      }
    }
    emit(programId, type, requestId);
  }

  private void notifyAdmins(String programId, String type, String requestId) {
    for (String adminId : repo.findAdminIds()) {
      if (notifications != null) {
        try {
          notifications.notify(adminId, type, "development", programId, 1, "{}",
              type + ":" + programId + ":" + adminId);
        } catch (Exception ignored) {
          // Best-effort per recipient; the outbox event below is the backstop.
        }
      }
    }
    emit(programId, type, requestId);
  }

  private void emit(String programId, String eventType, String requestId) {
    if (outbox != null) {
      outbox.emit("development", programId, eventType,
          "{\"requestId\":\"" + requestId + "\"}", eventType + ":" + programId + ":" + requestId);
    }
  }

  private void audit(String actor, String action, String entity, String entityId, String requestId) {
    if (audit != null) {
      audit.record(actor, action, entity, entityId, requestId);
    }
  }

  private static String titleFrom(String details) {
    String oneLine = details.trim().split("\\R")[0].trim();
    if (oneLine.length() <= 80) {
      return oneLine;
    }
    return oneLine.substring(0, 80);
  }

  private static String emptyToNull(String s) {
    return s == null || s.isBlank() ? null : s.trim();
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
