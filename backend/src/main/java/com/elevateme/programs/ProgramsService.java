package com.elevateme.programs;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AccountPendingException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 2 business rules + state machine (spec §9 teacher workspace + §10 + §11).
 *
 * <p>Lifecycle: DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED → (COMPLETED) → ARCHIVED,
 * with CHANGES_REQUESTED / REJECTED branches from review. Archive never deletes history.
 *
 * <p>Every write emits same-transaction outbox (via {@link OutboxService} TODO hook)
 * + {@link AuditService} record with (actor, action, entity, requestId) and no PII.
 * Idempotency-Key (actor+operation scoped) is enforced for submit/publish/approve/
 * complete/archive via {@link IdempotencyService}; differing payload with the same key → 409.
 */
@Service
public class ProgramsService {
  private final AuthContext auth;
  private final ProgramRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;

  /** Legacy 4-arg wiring (kept for Phase 1c tests). New deps default to no-ops. */
  public ProgramsService(
      AuthContext auth, ProgramRepository repo, ScopeGuard guard, AuditService audit) {
    this(auth, repo, guard, audit, null, null);
  }

  public ProgramsService(
      AuthContext auth,
      ProgramRepository repo,
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

  // ------------------------------------------------------------------
  // Helpers (pure, unit-testable where possible)
  // ------------------------------------------------------------------

  static final Set<String> ALLOWED_THEMES =
      Set.of("Public Speaking", "Communication", "Negotiation", "Leadership");
  static final Set<String> ALLOWED_VISIBILITY = Set.of("INTERNAL", "PUBLIC", "INVITE_ONLY");

  /**
   * Phase 1E canonical theme normalization.
   * Accepts exact canonical ("Public Speaking") plus legacy alias
   * ("PublicSpeaking", case-insensitive, extra spaces) and returns the
   * canonical spaced form. Unknown ⇒ IllegalArgumentException (→ 422).
   */
  public static String normalizeTheme(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("Unknown theme: " + raw);
    }
    String compact = raw.trim().replaceAll("\\s+", "").toLowerCase();
    return switch (compact) {
      case "publicspeaking" -> "Public Speaking";
      case "communication" -> "Communication";
      case "negotiation" -> "Negotiation";
      case "leadership" -> "Leadership";
      default -> throw new IllegalArgumentException("Unknown theme: " + raw);
    };
  }

  /** Normalize request type to canonical DB value. */
  public static String normalizeType(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("type is required");
    }
    String n = raw.trim().toUpperCase().replace("-", "_").replace(" ", "_");
    return switch (n) {
      case "SINGLEEVENT", "SINGLE_EVENT" -> "SINGLE_EVENT";
      case "CONTINUOUS", "CONTINUOUSPROGRAMME", "CONTINUOUS_PROGRAMME" -> "CONTINUOUS";
      case "SPECIAL", "SPECIALPROGRAMME", "SPECIAL_PROGRAMME" -> "SPECIAL";
      default -> throw new IllegalArgumentException("Unknown type: " + raw);
    };
  }

  /**
   * Phase 1E canonical subtype normalization.
   * Canonical: MUN | Debate | Competition | Special (see
   * ProgramDtos.CANONICAL_SUBTYPES). Legacy MODEL_UN ⇒ MUN,
   * FRIENDLY_DEBATE ⇒ Debate. WORKSHOP/LEAGUE and anything else ⇒ 422.
   * Returns the canonical display form (MUN, Debate, Competition, Special).
   */
  public static String normalizeSubtype(String raw) {
    if (raw == null || raw.isBlank()) {
      return null;
    }
    String n = raw.trim().toUpperCase().replace("-", "_").replace(" ", "_");
    return switch (n) {
      case "MUN", "MODELUN", "MODEL_UN" -> "MUN";
      case "DEBATE", "FRIENDLYDEBATE", "FRIENDLY_DEBATE" -> "Debate";
      case "COMPETITION" -> "Competition";
      case "SPECIAL" -> "Special";
      default -> throw new IllegalArgumentException("Unknown subtype: " + raw);
    };
  }

  /** Canonical display for a DB program_type (SINGLE_EVENT ⇒ SingleEvent). */
  public static String toCanonicalType(String dbType) {
    if (dbType == null) {
      return null;
    }
    String n = dbType.trim().toUpperCase().replace("-", "_").replace(" ", "_");
    return switch (n) {
      case "SINGLEEVENT", "SINGLE_EVENT" -> "SingleEvent";
      case "CONTINUOUS", "CONTINUOUSPROGRAMME", "CONTINUOUS_PROGRAMME" -> "Continuous";
      case "SPECIAL", "SPECIALPROGRAMME", "SPECIAL_PROGRAMME" -> "Special";
      default -> dbType;
    };
  }

  /** Canonical display for a DB subtype (MODEL_UN ⇒ MUN, FRIENDLY_DEBATE ⇒ Debate). */
  public static String toCanonicalSubtype(String dbSubtype) {
    if (dbSubtype == null || dbSubtype.isBlank()) {
      return null;
    }
    try {
      return normalizeSubtype(dbSubtype);
    } catch (IllegalArgumentException e) {
      return dbSubtype;
    }
  }

  public static String normalizeVisibility(String raw) {
    if (raw == null || raw.isBlank()) {
      return "INTERNAL";
    }
    String n = raw.trim().toUpperCase();
    if (!ALLOWED_VISIBILITY.contains(n)) {
      throw new IllegalArgumentException("Unknown visibility: " + raw);
    }
    return n;
  }

  public static void validateThemes(List<String> themes) {
    if (themes == null) {
      return;
    }
    for (String t : themes) {
      // Rejects unknown with 422 (IllegalArgumentException → VALIDATION_FAILED).
      normalizeTheme(t);
    }
  }

  /** Date rules: start&lt;end, registration window inside program window. 422 on violation. */
  public static void validateDates(
      Instant startsAt, Instant endsAt, Instant regOpens, Instant regDeadline) {
    if (startsAt != null && endsAt != null && !startsAt.isBefore(endsAt)) {
      throw new IllegalArgumentException("startsAt must be before endsAt");
    }
    if (regOpens != null && regDeadline != null && regOpens.isAfter(regDeadline)) {
      throw new IllegalArgumentException("registrationOpensAt must be before registrationDeadline");
    }
    if (regOpens != null && startsAt != null && endsAt != null) {
      if (regOpens.isBefore(startsAt.minusSeconds(365 * 24 * 3600L))
          || regOpens.isAfter(endsAt)) {
        throw new IllegalArgumentException("registration window must be inside program dates");
      }
    }
    if (regDeadline != null && startsAt != null && endsAt != null) {
      if (regDeadline.isAfter(endsAt)) {
        throw new IllegalArgumentException("registrationDeadline must be inside program dates");
      }
    }
  }

  private ScopeGuard.CallerProfile requireApprovedTeacher(String subject, String requestId) {
    ScopeGuard.CallerProfile caller = guard.loadCaller(subject);
    if (caller == null) {
      audit.record(subject, "ACCESS_DENIED", "program_create", null, requestId);
      throw new AccessDeniedException("Not permitted");
    }
    if (caller.isAdmin() && "Approved".equals(caller.status())) {
      return caller;
    }
    boolean staffLike = caller.isStaffLike();
    if (staffLike) {
      if (!"Approved".equals(caller.status())) {
        // Spec: teacher must be Approved else 403 ACCOUNT_PENDING (no program data leaked).
        audit.record(caller.id(), "ACCESS_DENIED_PENDING", "program_create", null, requestId);
        throw new AccountPendingException("Account pending review");
      }
      return caller;
    }
    audit.record(caller.id(), "ACCESS_DENIED", "program_create", null, requestId);
    throw new AccessDeniedException("Staff only");
  }

  private ScopeGuard.CallerProfile requireOwnerOrAdmin(
      String subject, String ownerId, String entityId, String action, String requestId) {
    ScopeGuard.CallerProfile caller = guard.loadCaller(subject);
    if (caller == null) {
      audit.record(subject, "ACCESS_DENIED", action, entityId, requestId);
      throw new AccessDeniedException("Not permitted");
    }
    if (caller.isPendingReview()) {
      audit.record(caller.id(), "ACCESS_DENIED_PENDING", action, entityId, requestId);
      throw new AccountPendingException("Account pending review");
    }
    if (caller.isAdmin()) {
      return caller;
    }
    if (ownerId != null && ownerId.equals(caller.id())) {
      // Teacher gate: owners must be Approved. Rejected / suspended / any
      // non-Approved status cannot patch/submit/archive/create-session even
      // when they own the program (spec §9 teacher workspace).
      if (!"Approved".equals(caller.status())) {
        audit.record(caller.id(), "ACCESS_DENIED", action, entityId, requestId);
        throw new AccessDeniedException("Not permitted");
      }
      return caller;
    }
    audit.record(caller.id(), "ACCESS_DENIED", action, entityId, requestId);
    throw new AccessDeniedException("Owner only");
  }

  private void emit(String aggregateId, String eventType, String requestId) {
    if (outbox != null) {
      outbox.emit("program", aggregateId, eventType,
          "{\"requestId\":\"" + requestId + "\"}", eventType + ":" + aggregateId + ":" + requestId);
    }
  }

  private static String slug(String title) {
    String base = title == null ? "program" : title.toLowerCase().replaceAll("[^a-z0-9]+", "-");
    base = base.replaceAll("^-+|-+$", "");
    if (base.isBlank()) {
      base = "program";
    }
    if (base.length() > 60) {
      base = base.substring(0, 60);
    }
    return base + "-" + UUID.randomUUID().toString().substring(0, 8);
  }

  // ------------------------------------------------------------------
  // Create
  // ------------------------------------------------------------------

  /**
   * POST /api/v1/programs. Owner = authenticated subject's profile id, status DRAFT, version 1.
   * Teacher must be Approved (else 403 ACCOUNT_PENDING). One-off events auto-create one session.
   */
  @Transactional
  public Map<String, Object> create(
      String authenticatedSubject, ProgramDtos.CreateProgramRequest req, String requestId) {
    ScopeGuard.CallerProfile caller = requireApprovedTeacher(authenticatedSubject, requestId);
    if (req.title() == null || req.title().isBlank()) {
      throw new IllegalArgumentException("title is required");
    }
    if (req.capacity() == null || req.capacity() < 1) {
      throw new IllegalArgumentException("capacity must be >= 1");
    }
    String type = normalizeType(req.type());
    String subtype = normalizeSubtype(req.subtype());
    validateThemes(req.themes());
    // Store canonical spaced themes (PublicSpeaking alias ⇒ "Public Speaking").
    java.util.List<String> canonicalThemes = req.themes() == null ? java.util.List.of()
        : req.themes().stream().map(ProgramsService::normalizeTheme).toList();
    String visibility = normalizeVisibility(req.visibility());
    validateDates(req.startsAt(), req.endsAt(), req.registrationOpensAt(), req.registrationDeadline());

    String[] themesArr = canonicalThemes.toArray(String[]::new);
    String slug = slug(req.title());
    String id = repo.insertProgram(
        caller.id(), slug, req.title().trim(),
        req.description() == null ? "" : req.description(),
        type, subtype, themesArr, visibility,
        req.startsAt(), req.endsAt(), req.registrationOpensAt(), req.registrationDeadline(),
        req.location(), req.venue(), req.capacity(),
        req.eligibility(), req.instituteId());

    // One-off event auto-creates one session on program create.
    if ("SINGLE_EVENT".equals(type)) {
      try {
        repo.insertSession(id, slug(req.title() + "-session"),
            req.title().trim(), req.startsAt(), req.endsAt(), null, null, req.venue());
      } catch (Exception e) {
        // Best-effort on skeleton DBs; submit() will re-ensure >=1 session.
      }
    }

    audit.record(caller.id(), "PROGRAM_CREATED", "program", id, requestId);
    emit(id, "PROGRAM_CREATED", requestId);
    return repo.findProgramFullById(id);
  }

  // ------------------------------------------------------------------
  // Patch (optimistic)
  // ------------------------------------------------------------------

  /**
   * PATCH /programs/{id}. Only owner or admin, only in DRAFT or CHANGES_REQUESTED,
   * optimistic version check (409 VERSION_CONFLICT on stale). PUBLISHED programs
   * allow a guarded safe-field patch (description/location/capacity-increase only)
   * that fans out an attendee notification; all other published edits are rejected
   * (create a new program version instead).
   */
  @Transactional
  public Map<String, Object> patch(
      String authenticatedSubject, String programId, ProgramDtos.PatchProgramRequest req, String requestId) {
    Map<String, Object> current = repo.findProgramFullById(programId);
    String ownerId = current.get("ownerId") == null ? null : String.valueOf(current.get("ownerId"));
    ScopeGuard.CallerProfile caller =
        requireOwnerOrAdmin(authenticatedSubject, ownerId, programId, "program_patch", requestId);
    String lifecycle = String.valueOf(current.get("lifecycle"));
    if ("PUBLISHED".equals(lifecycle)) {
      return patchPublishedSafe(caller, programId, current, req, requestId);
    }
    if (!"DRAFT".equals(lifecycle) && !"CHANGES_REQUESTED".equals(lifecycle)) {
      audit.record(caller.id(), "ACCESS_DENIED", "program_patch", programId, requestId);
      throw new ConflictException("INVALID_STATE",
          "Only DRAFT or CHANGES_REQUESTED programs can be edited (current: " + lifecycle + ")");
    }
    if (req.version() == null) {
      throw new IllegalArgumentException("version is required");
    }
    String type = req.type() == null ? null : normalizeType(req.type());
    String subtype = req.subtype() == null ? null : normalizeSubtype(req.subtype());
    if (req.subtype() != null && req.subtype().isBlank()) {
      subtype = null;
    }
    validateThemes(req.themes());
    String visibility = req.visibility() == null ? null : normalizeVisibility(req.visibility());

    // Merge dates for validation (request overrides current).
    Instant startsAt = req.startsAt() != null ? req.startsAt() : toInstant(current.get("startsAt"));
    Instant endsAt = req.endsAt() != null ? req.endsAt() : toInstant(current.get("endsAt"));
    Instant regOpens = req.registrationOpensAt() != null ? req.registrationOpensAt()
        : toInstant(current.get("registrationOpensAt"));
    Instant regDeadline = req.registrationDeadline() != null ? req.registrationDeadline()
        : toInstant(current.get("registrationDeadline"));
    validateDates(startsAt, endsAt, regOpens, regDeadline);

    int updated = repo.updateProgramOptimistic(
        programId, req.version(),
        req.title(), req.description(), type, subtype, visibility, req.capacity(),
        req.location(), req.venue(), req.eligibility(),
        req.startsAt(), req.endsAt(), req.registrationOpensAt(), req.registrationDeadline());
    if (updated == 0) {
      try {
        repo.findProgramFullById(programId);
      } catch (ResourceNotFoundException e) {
        throw e;
      }
      audit.record(caller.id(), "VERSION_CONFLICT", "program", programId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    if (req.themes() != null) {
      String[] canonical = req.themes().stream().map(ProgramsService::normalizeTheme).toArray(String[]::new);
      repo.updateProgramThemes(programId, canonical);
    }
    // Lifecycle here is DRAFT/CHANGES_REQUESTED so no attendee fan-out.
    // Published edits go through patchPublishedSafe() (new version + notify);
    // this branch intentionally does not emit attendee notifications.
    audit.record(caller.id(), "PROGRAM_PATCHED", "program", programId, requestId);
    emit(programId, "PROGRAM_PATCHED", requestId);
    return repo.findProgramFullById(programId);
  }

  /**
   * Guarded PUBLISHED patch: safe fields only (description/location/capacity
   * increase). Any other field set → 409 INVALID_STATE (create a new program
   * version instead). Capacity may only increase (decrease → 409). Success
   * fans out an attendee notification via the outbox.
   */
  private Map<String, Object> patchPublishedSafe(
      ScopeGuard.CallerProfile caller,
      String programId,
      Map<String, Object> current,
      ProgramDtos.PatchProgramRequest req,
      String requestId) {
    if (req.version() == null) {
      throw new IllegalArgumentException("version is required");
    }
    boolean touchesUnsafe =
        req.title() != null
            || req.type() != null
            || (req.subtype() != null && !req.subtype().isBlank())
            || req.themes() != null
            || req.visibility() != null
            || req.startsAt() != null
            || req.endsAt() != null
            || req.registrationOpensAt() != null
            || req.registrationDeadline() != null
            || req.venue() != null
            || req.eligibility() != null;
    if (touchesUnsafe) {
      audit.record(caller.id(), "ACCESS_DENIED", "program_patch", programId, requestId);
      throw new ConflictException("INVALID_STATE",
          "PUBLISHED programs allow only description/location/capacity-increase edits"
              + " (other changes require a new program version)");
    }
    Integer requestedCapacity = req.capacity();
    if (requestedCapacity != null) {
      if (requestedCapacity < 1) {
        throw new IllegalArgumentException("capacity must be >= 1");
      }
      int currentCapacity = toInt(current.get("capacity"), 0);
      if (requestedCapacity <= currentCapacity) {
        throw new ConflictException("INVALID_STATE",
            "PUBLISHED capacity may only increase (current: " + currentCapacity + ")");
      }
    }
    int updated = repo.updateProgramOptimistic(
        programId, req.version(),
        null, req.description(), null, null, null, requestedCapacity,
        req.location(), null, null,
        null, null, null, null);
    if (updated == 0) {
      try {
        repo.findProgramFullById(programId);
      } catch (ResourceNotFoundException e) {
        throw e;
      }
      audit.record(caller.id(), "VERSION_CONFLICT", "program", programId, requestId);
      throw new ConflictException("VERSION_CONFLICT", "Stale version; refresh and retry");
    }
    if (outbox != null) {
      outbox.emitAttendeeNotification(programId, "PROGRAM_UPDATED",
          "{\"requestId\":\"" + requestId + "\"}", "PROGRAM_UPDATED:" + programId + ":" + requestId);
    }
    audit.record(caller.id(), "PROGRAM_PATCHED", "program", programId, requestId);
    emit(programId, "PROGRAM_PATCHED", requestId);
    return repo.findProgramFullById(programId);
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  /**
   * POST /programs/{id}/submit: DRAFT|CHANGES_REQUESTED → PENDING_REVIEW.
   * Validates sessions exist (&gt;=1; one-off auto-creates one session).
   * Idempotent per (actor, operation, key); differing payload → 409.
   */
  @Transactional
  public Map<String, Object> submit(String authenticatedSubject, String programId, String requestId) {
    return submit(authenticatedSubject, programId, requestId, null);
  }

  @Transactional
  public Map<String, Object> submit(
      String authenticatedSubject, String programId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/programs/{id}/submit";
    String payloadHash = IdempotencyService.hashPayload("submit:" + programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    Map<String, Object> current = repo.findProgramFullById(programId);
    String ownerId = current.get("ownerId") == null ? null : String.valueOf(current.get("ownerId"));
    ScopeGuard.CallerProfile caller =
        requireOwnerOrAdmin(authenticatedSubject, ownerId, programId, "program_submit", requestId);
    String lifecycle = String.valueOf(current.get("lifecycle"));
    if (!"DRAFT".equals(lifecycle) && !"CHANGES_REQUESTED".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "Only DRAFT or CHANGES_REQUESTED can be submitted (current: " + lifecycle + ")");
    }
    int sessions = repo.countSessions(programId);
    if (sessions < 1) {
      String type = current.get("type") == null ? null : String.valueOf(current.get("type"));
      if ("SINGLE_EVENT".equals(type)) {
        String title = current.get("title") == null ? "Session 1" : String.valueOf(current.get("title"));
        repo.insertSession(programId, slug(title + "-session"), title,
            toInstant(current.get("startsAt")), toInstant(current.get("endsAt")),
            null, null, current.get("venue") == null ? null : String.valueOf(current.get("venue")));
        sessions = repo.countSessions(programId);
      }
      if (sessions < 1) {
        throw new IllegalArgumentException("At least one session is required before submit");
      }
    }
    int updated = repo.setLifecycle(programId, "DRAFT", "CHANGES_REQUESTED", "PENDING_REVIEW",
        caller.id(), null);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Submit race; refresh and retry");
    }
    audit.record(caller.id(), "PROGRAM_SUBMITTED", "program", programId, requestId);
    emit(programId, "PROGRAM_SUBMITTED", requestId);
    Map<String, Object> result = repo.findProgramFullById(programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Approve (admin)
  // ------------------------------------------------------------------

  /**
   * POST /programs/{id}/approve {decision, note}: PENDING_REVIEW → APPROVED |
   * CHANGES_REQUESTED | REJECTED with audit. Note required for
   * CHANGES_REQUESTED/REJECTED (422 else).
   */
  @Transactional
  public Map<String, Object> approve(
      String authenticatedSubject, String programId, ProgramDtos.ApproveRequest req, String requestId) {
    return approve(authenticatedSubject, programId, req, requestId, null);
  }

  /**
   * Approve with Idempotency-Key (actor+operation scoped; differing payload → 409).
   */
  @Transactional
  public Map<String, Object> approve(
      String authenticatedSubject, String programId, ProgramDtos.ApproveRequest req,
      String requestId, String idempotencyKey) {
    String decisionNorm = req == null || req.decision() == null ? "" : req.decision().trim().toUpperCase();
    String noteNorm = req == null || req.note() == null ? "" : req.note().trim();
    String operation = "POST /api/v1/programs/{id}/approve";
    String payloadHash = IdempotencyService.hashPayload(
        "approve:" + programId + ":" + decisionNorm + ":" + noteNorm);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null || req.decision() == null || req.decision().isBlank()) {
      throw new IllegalArgumentException("decision is required");
    }
    String decision = req.decision().trim().toUpperCase();
    if (!Set.of("APPROVED", "CHANGES_REQUESTED", "REJECTED").contains(decision)) {
      throw new IllegalArgumentException("Unknown decision: " + req.decision());
    }
    if (("CHANGES_REQUESTED".equals(decision) || "REJECTED".equals(decision))
        && (req.note() == null || req.note().isBlank())) {
      throw new IllegalArgumentException("note is required for " + decision);
    }
    Map<String, Object> current = repo.findProgramFullById(programId);
    String lifecycle = String.valueOf(current.get("lifecycle"));
    if (!"PENDING_REVIEW".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "Only PENDING_REVIEW can be decided (current: " + lifecycle + ")");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    int updated = repo.setLifecycle(programId, "PENDING_REVIEW", null, decision, actorId, req.note());
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Approve race; refresh and retry");
    }
    audit.record(actorId, "PROGRAM_" + decision, "program", programId, requestId);
    emit(programId, "PROGRAM_" + decision, requestId);
    Map<String, Object> result = repo.findProgramFullById(programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Publish (admin)
  // ------------------------------------------------------------------

  /**
   * Publish a program. Admin-only (DB role). Teachers (non-admin) get 403.
   *
   * @param authenticatedSubject verified JWT sub
   * @param programId target program
   * @param requestId tracing id
   */
  @Transactional
  public Map<String, Object> publish(
      String authenticatedSubject, String programId, String requestId) {
    return publish(authenticatedSubject, programId, requestId, null);
  }

  /**
   * Admin publish with idempotency: APPROVED → PUBLISHED only.
   * PENDING_REVIEW must go through approve first (409 INVALID_STATE otherwise).
   * Idempotency-Key scoped actor+operation; differing payload → 409.
   */
  @Transactional
  public Map<String, Object> publish(
      String authenticatedSubject, String programId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/programs/{id}/publish";
    String payloadHash = IdempotencyService.hashPayload("publish:" + programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    guard.requireAdmin(authenticatedSubject, requestId);
    Map<String, Object> program = repo.findProgramFullById(programId);
    String lifecycle = String.valueOf(program.get("lifecycle"));
    if ("PENDING_REVIEW".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "PENDING_REVIEW must be approved before publish (current: PENDING_REVIEW)");
    }
    if (!"APPROVED".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "Only APPROVED can be published (current: " + lifecycle + ")");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    int updated = repo.setLifecycle(programId, "APPROVED", null, "PUBLISHED", actorId, null);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Publish race; refresh and retry");
    }
    audit.record(actorId, "PROGRAM_PUBLISHED", "program", programId, requestId);
    emit(programId, "PROGRAM_PUBLISHED", requestId);
    Map<String, Object> result = repo.findProgramFullById(programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Complete (needed for archive path)
  // ------------------------------------------------------------------

  /** PUBLISHED → COMPLETED. Owner or admin. Enables the COMPLETED → ARCHIVED path. */
  @Transactional
  public Map<String, Object> complete(
      String authenticatedSubject, String programId, String requestId) {
    return complete(authenticatedSubject, programId, requestId, null);
  }

  /**
   * PUBLISHED → COMPLETED with idempotency (actor+operation scoped).
   */
  @Transactional
  public Map<String, Object> complete(
      String authenticatedSubject, String programId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/programs/{id}/complete";
    String payloadHash = IdempotencyService.hashPayload("complete:" + programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    Map<String, Object> current = repo.findProgramFullById(programId);
    String ownerId = current.get("ownerId") == null ? null : String.valueOf(current.get("ownerId"));
    ScopeGuard.CallerProfile caller =
        requireOwnerOrAdmin(authenticatedSubject, ownerId, programId, "program_complete", requestId);
    String lifecycle = String.valueOf(current.get("lifecycle"));
    if (!"PUBLISHED".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "Only PUBLISHED can be completed (current: " + lifecycle + ")");
    }
    int updated = repo.setLifecycle(programId, "PUBLISHED", null, "COMPLETED", caller.id(), null);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Complete race; refresh and retry");
    }
    audit.record(caller.id(), "PROGRAM_COMPLETED", "program", programId, requestId);
    emit(programId, "PROGRAM_COMPLETED", requestId);
    Map<String, Object> result = repo.findProgramFullById(programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Archive (never deletes history)
  // ------------------------------------------------------------------

  /** PUBLISHED|COMPLETED → ARCHIVED. Owner or admin. History rows are retained. */
  @Transactional
  public Map<String, Object> archive(String authenticatedSubject, String programId, String requestId) {
    return archive(authenticatedSubject, programId, requestId, null);
  }

  /**
   * Archive with Idempotency-Key (actor+operation scoped; differing payload → 409).
   */
  @Transactional
  public Map<String, Object> archive(
      String authenticatedSubject, String programId, String requestId, String idempotencyKey) {
    String operation = "POST /api/v1/programs/{id}/archive";
    String payloadHash = IdempotencyService.hashPayload("archive:" + programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    Map<String, Object> current = repo.findProgramFullById(programId);
    String ownerId = current.get("ownerId") == null ? null : String.valueOf(current.get("ownerId"));
    ScopeGuard.CallerProfile caller =
        requireOwnerOrAdmin(authenticatedSubject, ownerId, programId, "program_archive", requestId);
    String lifecycle = String.valueOf(current.get("lifecycle"));
    if (!"PUBLISHED".equals(lifecycle) && !"COMPLETED".equals(lifecycle)) {
      throw new ConflictException("INVALID_STATE",
          "Only PUBLISHED or COMPLETED can be archived (current: " + lifecycle + ")");
    }
    int updated = repo.setLifecycle(programId, "PUBLISHED", "COMPLETED", "ARCHIVED", caller.id(), null);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Archive race; refresh and retry");
    }
    audit.record(caller.id(), "PROGRAM_ARCHIVED", "program", programId, requestId);
    emit(programId, "PROGRAM_ARCHIVED", requestId);
    Map<String, Object> result = repo.findProgramFullById(programId);
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      idempotency.store(authenticatedSubject, operation, idempotencyKey, payloadHash, result);
    }
    return result;
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  /**
   * POST /programs/{id}/sessions. Owner (or admin) only. Sessions are immutable
   * in parentage: once evaluation linkage exists a session cannot be moved across
   * programs (409; DB trigger also enforces — see V2 prevent_session_reparenting).
   */
  @Transactional
  public Map<String, Object> createSession(
      String authenticatedSubject, String programId,
      ProgramDtos.SessionCreateRequest req, String requestId) {
    Map<String, Object> program = repo.findProgramFullById(programId);
    String ownerId = program.get("ownerId") == null ? null : String.valueOf(program.get("ownerId"));
    ScopeGuard.CallerProfile caller =
        requireOwnerOrAdmin(authenticatedSubject, ownerId, programId, "session_create", requestId);
    if (req.title() == null || req.title().isBlank()) {
      throw new IllegalArgumentException("title is required");
    }
    if (req.startsAt() != null && req.endsAt() != null && !req.startsAt().isBefore(req.endsAt())) {
      throw new IllegalArgumentException("startsAt must be before endsAt");
    }
    String id = repo.insertSession(programId, slug(req.title()),
        req.title().trim(), req.startsAt(), req.endsAt(),
        req.committee(), req.topic(), req.venue());
    audit.record(caller.id(), "SESSION_CREATED", "session", id, requestId);
    if (outbox != null) {
      outbox.emit("session", id, "SESSION_CREATED",
          "{\"programId\":\"" + programId + "\",\"requestId\":\"" + requestId + "\"}",
          "SESSION_CREATED:" + id + ":" + requestId);
    }
    Map<String, Object> out = new HashMap<>();
    out.put("id", id);
    out.put("programId", programId);
    out.put("title", req.title().trim());
    return out;
  }

  // ------------------------------------------------------------------
  // Browse (list/get with visibility filter)
  // ------------------------------------------------------------------

  static final int PAGE_SIZE = 10;

  /**
   * GET /programs browse: admin sees all, owner sees own + public PUBLISHED,
   * anyone else (incl. anonymous null subject) sees public PUBLISHED only.
   * Anonymous sees ONLY lifecycle=PUBLISHED AND visibility=PUBLIC standard
   * programs (excludes DRAFT/PENDING_REVIEW/CHANGES_REQUESTED/APPROVED-
   * unpublished/COMPLETED/ARCHIVED/PRIVATE/INTERNAL/INVITE_ONLY/ASSIGNED +
   * targeted development backing rows). Paginated (10/page, stable
   * created_at DESC, id ASC). Supports search (title/description) + filters
   * theme/type/subtype (unknown ⇒ 422). Returns canonical theme/type/subtype.
   */
  public Map<String, Object> list(String authenticatedSubject, int page, String requestId) {
    return list(authenticatedSubject, null, null, null, null, page, requestId);
  }

  public Map<String, Object> list(
      String authenticatedSubject,
      String q,
      String theme,
      String type,
      String subtype,
      int page,
      String requestId) {
    String normalizedTheme = null;
    String normalizedDbType = null;
    String normalizedSubtype = null;
    if (theme != null && !theme.isBlank()) {
      normalizedTheme = normalizeTheme(theme);
    }
    if (type != null && !type.isBlank()) {
      // Validates (422 on unknown); filtering matches both DB + display forms.
      normalizedDbType = normalizeType(type);
    }
    if (subtype != null && !subtype.isBlank()) {
      normalizedSubtype = normalizeSubtype(subtype);
    }
    String cleanQ = (q == null || q.isBlank()) ? null : q.trim();

    ScopeGuard.CallerProfile caller = null;
    try {
      if (authenticatedSubject != null && !authenticatedSubject.isBlank()) {
        caller = guard.loadCaller(authenticatedSubject);
      }
    } catch (Exception ignored) {
      // fall through to the public slice
    }
    int safePage = Math.max(1, page);
    int offset = (safePage - 1) * PAGE_SIZE;
    List<Map<String, Object>> items;
    int total;
    if (caller != null && caller.isAdmin()) {
      items = repo.findAllProgramsFiltered(PAGE_SIZE, offset, cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
      total = repo.countAllProgramsFiltered(cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
    } else if (caller != null) {
      items = repo.findVisibleProgramsFiltered(caller.id(), PAGE_SIZE, offset, cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
      total = repo.countVisibleProgramsFiltered(caller.id(), cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
    } else {
      items = repo.findPublishedProgramsFiltered(PAGE_SIZE, offset, cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
      total = repo.countPublishedProgramsFiltered(cleanQ,
          normalizedTheme, normalizedDbType, normalizedSubtype);
    }
    List<Map<String, Object>> canonical = new java.util.ArrayList<>(items.size());
    for (Map<String, Object> row : items) {
      canonical.add(canonicalizeRow(row));
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", canonical);
    out.put("page", safePage);
    out.put("pageSize", PAGE_SIZE);
    out.put("total", total);
    return out;
  }

  /** Map DB type/subtype/themes to Phase 1E canonical display values. */
  static Map<String, Object> canonicalizeRow(Map<String, Object> row) {
    if (row == null) {
      return row;
    }
    Map<String, Object> m = new LinkedHashMap<>(row);
    if (m.containsKey("type")) {
      Object t = m.get("type");
      if (t != null) {
        m.put("type", toCanonicalType(String.valueOf(t)));
      }
    }
    // program_type alias (some projections use program_type key)
    if (m.containsKey("program_type")) {
      Object t = m.get("program_type");
      if (t != null) {
        m.put("type", toCanonicalType(String.valueOf(t)));
      }
    }
    if (m.containsKey("subtype")) {
      Object s = m.get("subtype");
      if (s != null && !String.valueOf(s).isBlank()) {
        m.put("subtype", toCanonicalSubtype(String.valueOf(s)));
      }
    }
    if (m.containsKey("themes")) {
      Object th = m.get("themes");
      if (th instanceof java.sql.Array arr) {
        try {
          Object[] vals = (Object[]) arr.getArray();
          java.util.List<String> canon = new java.util.ArrayList<>();
          for (Object v : vals) {
            if (v == null) {
              continue;
            }
            try {
              canon.add(normalizeTheme(String.valueOf(v)));
            } catch (IllegalArgumentException ignored) {
              canon.add(String.valueOf(v));
            }
          }
          m.put("themes", canon);
          if (!canon.isEmpty()) {
            m.put("theme", canon.get(0));
          }
        } catch (Exception ignored) {
          // keep raw
        }
      } else if (th instanceof java.util.List<?> list) {
        java.util.List<String> canon = new java.util.ArrayList<>();
        for (Object v : list) {
          if (v == null) {
            continue;
          }
          try {
            canon.add(normalizeTheme(String.valueOf(v)));
          } catch (IllegalArgumentException ignored) {
            canon.add(String.valueOf(v));
          }
        }
        m.put("themes", canon);
        if (!canon.isEmpty()) {
          m.put("theme", canon.get(0));
        }
      } else if (th instanceof String[] arrStr) {
        java.util.List<String> canon = new java.util.ArrayList<>();
        for (Object v : arrStr) {
          if (v == null) {
            continue;
          }
          try {
            canon.add(normalizeTheme(String.valueOf(v)));
          } catch (IllegalArgumentException ignored) {
            canon.add(String.valueOf(v));
          }
        }
        m.put("themes", canon);
        if (!canon.isEmpty()) {
          m.put("theme", canon.get(0));
        }
      }
    }
    return m;
  }

  /**
   * GET /programs/{id}: PUBLISHED + PUBLIC standard visible to anyone
   * (incl. anonymous); own programs visible to the owner; everything visible
   * to admin; otherwise 404 (no enumeration of non-public programs).
   * Targeted development backing rows never resolve publicly (404).
   */
  public Map<String, Object> get(String authenticatedSubject, String programId, String requestId) {
    Map<String, Object> program = repo.findProgramFullById(programId);
    ScopeGuard.CallerProfile caller = null;
    try {
      if (authenticatedSubject != null && !authenticatedSubject.isBlank()) {
        caller = guard.loadCaller(authenticatedSubject);
      }
    } catch (Exception ignored) {
      // fall through to the public-visibility check
    }
    if (caller != null && caller.isAdmin()) {
      return canonicalizeRow(program);
    }
    String ownerId =
        program.get("ownerId") == null ? null : String.valueOf(program.get("ownerId"));
    if (caller != null && ownerId != null && ownerId.equals(caller.id())) {
      return canonicalizeRow(program);
    }
    String lifecycle =
        program.get("lifecycle") == null ? "" : String.valueOf(program.get("lifecycle"));
    String visibility =
        program.get("visibility") == null ? "" : String.valueOf(program.get("visibility"));
    if ("PUBLISHED".equals(lifecycle) && "PUBLIC".equals(visibility)) {
      // Targeted development (ASSIGNED backing event) never leaks publicly.
      try {
        if (repo.isDevelopmentBacked(programId)) {
          throw new ResourceNotFoundException("Not found");
        }
      } catch (ResourceNotFoundException e) {
        throw e;
      } catch (Exception ignored) {
        // missing table on skeleton DBs ⇒ not development-backed
      }
      return canonicalizeRow(program);
    }
    throw new ResourceNotFoundException("Not found");
  }

  // ------------------------------------------------------------------
  // Misc
  // ------------------------------------------------------------------

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
}
