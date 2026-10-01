package com.elevateme.queries;

import com.elevateme.audit.AuditService;
import com.elevateme.common.idempotency.IdempotencyService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.notifications.NotificationsService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 5 query exchange (spec §10 + §11): request/reply messaging between
 * students/parents and Diplomatic Impact — never real-time chat (no bubbles,
 * typing indicators, presence, or reactions by design).
 *
 * <ul>
 *   <li>Threads are owned by one student; parents participate only via a linked
 *       child. Listing is own-threads only (search + status filter, 10/page,
 *       stable updated_at DESC, id ASC).</li>
 *   <li>Create validates title (max 120) + body (max 5000, required) BEFORE any
 *       write, so a 422 never destroys input; dupes are prevented via
 *       Idempotency-Key (same key + differing payload -&gt; 409) plus a recent
 *       same-title backstop.</li>
 *   <li>States: IN_REVIEW -&gt; ANSWERED -&gt; CLOSED (+ admin CLOSED -&gt;
 *       IN_REVIEW). A student follow-up sets awaiting_admin_reply=true while the
 *       prior official reply is kept. DI-initiated threads start in
 *       AWAITING_STUDENT_RESPONSE.</li>
 *   <li>Comments are timestamped follow-ups (full-width, both sides). The first
 *       official reply is the DI answer (right cell); official replies are
 *       versioned — edits insert a new version row, never a silent rewrite.</li>
 *   <li>Admin close/reopen flip state with audit. A student reopen on a CLOSED
 *       thread is a REQUEST: state is unchanged, DI is notified. Closed threads
 *       stay readable.</li>
 *   <li>Notifications both ways, same-transaction: student query/comment -&gt;
 *       DI queue (in-app per admin + team email via outbox); DI reply -&gt;
 *       student (in-app + email via outbox).</li>
 *   <li>Bodies render as sanitized plain text (HTML stripped, see
 *       {@link #sanitize}).</li>
 * </ul>
 */
@Service
public class QueriesService {
  static final int PAGE_SIZE = 10;

  private final AuthContext auth;
  private final QueriesRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final IdempotencyService idempotency;
  private final NotificationsService notifications;

  /** Legacy wiring (skeleton callers/tests). */
  public QueriesService(AuthContext auth) {
    this(auth, null, null, null, null, null, null);
  }

  @Autowired
  public QueriesService(
      AuthContext auth,
      QueriesRepository repo,
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

  /**
   * Sanitized plain-text rendering: strips HTML tags/entities, trims, and
   * enforces the 5000-char bound. Never returns markup.
   */
  public static String sanitize(String raw) {
    if (raw == null) {
      return "";
    }
    String s = raw.replaceAll("(?s)<[^>]*>", "");
    s = s.replace("&nbsp;", " ").replace("&amp;", "&")
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"");
    s = s.trim().replaceAll("[ \\t\\x0B\\f\\r]+", " ");
    if (s.length() > 5000) {
      s = s.substring(0, 5000);
    }
    return s;
  }

  static void validateTitle(String title) {
    if (title == null || title.isBlank()) {
      throw new IllegalArgumentException("title is required");
    }
    if (title.trim().length() > 120) {
      throw new IllegalArgumentException("title must be at most 120 characters");
    }
  }

  static void validateBody(String body) {
    if (body == null || body.isBlank()) {
      throw new IllegalArgumentException("body is required");
    }
    if (body.trim().length() > 5000) {
      throw new IllegalArgumentException("body must be at most 5000 characters");
    }
  }

  // ------------------------------------------------------------------
  // List (own threads, search/status, 10/page stable)
  // ------------------------------------------------------------------

  public Map<String, Object> listOwn(
      String authenticatedSubject, String q, String status, int page, String requestId) {
    String ownerId = ownOrLinkedStudent(authenticatedSubject, null, requestId, false);
    int safePage = Math.max(1, page);
    int offset = (safePage - 1) * PAGE_SIZE;
    List<Map<String, Object>> items =
        repo.findThreadsForStudent(ownerId, emptyToNull(q), emptyToNull(status),
            PAGE_SIZE, offset);
    int total = repo.countThreadsForStudent(ownerId, emptyToNull(q), emptyToNull(status));
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", items);
    out.put("page", safePage);
    out.put("pageSize", PAGE_SIZE);
    out.put("total", total);
    return out;
  }

  /** Single thread + chronological messages (closed threads stay readable). */
  public Map<String, Object> getThread(
      String authenticatedSubject, String threadId, String requestId) {
    Map<String, Object> thread = repo.findThreadById(threadId);
    ownOrLinkedStudent(authenticatedSubject, String.valueOf(thread.get("studentId")),
        requestId, true);
    Map<String, Object> out = new LinkedHashMap<>(thread);
    out.put("messages", repo.findMessagesChronological(threadId));
    return out;
  }

  // ------------------------------------------------------------------
  // Create (student/parent + DI-initiated)
  // ------------------------------------------------------------------

  /**
   * POST /queries: creates an IN_REVIEW thread owned by the caller (or their
   * linked child for parents). Validates BEFORE writing (input preserved on
   * 422); dupes prevented via Idempotency-Key + recent-duplicate backstop.
   */
  @Transactional
  public Map<String, Object> create(
      String authenticatedSubject, QueryDtos.CreateQueryRequest req,
      String idempotencyKey, String requestId) {
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    // Validate first: a 422 never consumes input or writes anything.
    validateTitle(req.title());
    validateBody(req.body());
    String operation = "POST /api/v1/queries";
    String payloadHash = IdempotencyService.hashPayload(
        "query:" + req.title().trim() + ":" + req.body().trim() + ":"
            + emptyToNull(req.linkedProgram()) + ":" + emptyToNull(req.linkedReport()));
    if (idempotency != null && idempotencyKey != null && !idempotencyKey.isBlank()) {
      Map<String, Object> replay =
          idempotency.checkReplay(authenticatedSubject, operation, idempotencyKey, payloadHash);
      if (replay != null) {
        return replay;
      }
    }
    ResolvedActor actor = resolvePostingActor(authenticatedSubject, requestId);
    String key = emptyToNull(idempotencyKey != null ? idempotencyKey
        : (req.idempotencyKey() == null ? null : req.idempotencyKey()));
    // Dupe backstop: same student + same title within 10 minutes -> 409.
    if (repo.findRecentDuplicate(actor.studentId(), req.title().trim(), payloadHash) != null
        && (key == null || key.isBlank())) {
      throw new ConflictException("DUPLICATE", "This query was already submitted");
    }
    String threadId = repo.insertThread(
        actor.studentId(), req.title().trim(), sanitize(req.body()),
        actor.role(), actor.profileId(),
        emptyToNull(req.linkedProgram()), emptyToNull(req.linkedReport()),
        key, "IN_REVIEW", true);
    audit(actor.profileId(), "QUERY_CREATED", "query_thread", threadId, requestId);
    notifyAdmins(threadId, "QUERY_AWAITING_REPLY", requestId);
    Map<String, Object> result = threadPayload(threadId);
    if (idempotency != null && key != null && !key.isBlank()) {
      idempotency.store(authenticatedSubject, operation, key, payloadHash, result);
    }
    return result;
  }

  /** DI-initiated thread (admin): starts in AWAITING_STUDENT_RESPONSE. */
  @Transactional
  public Map<String, Object> createDiInitiated(
      String authenticatedSubject, QueryDtos.CreateDiQueryRequest req, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    validateTitle(req.title());
    validateBody(req.body());
    if (req.studentId() == null || req.studentId().isBlank()) {
      throw new IllegalArgumentException("studentId is required");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    String threadId = repo.insertThread(
        req.studentId().trim(), req.title().trim(), sanitize(req.body()),
        "DI", actorId, null, null, null, "AWAITING_STUDENT_RESPONSE", false);
    audit(actorId, "QUERY_DI_INITIATED", "query_thread", threadId, requestId);
    notifyStudent(req.studentId().trim(), threadId, "QUERY_AWAITING_STUDENT", requestId);
    return threadPayload(threadId);
  }

  // ------------------------------------------------------------------
  // Comments (timestamped follow-ups, both sides, full-width)
  // ------------------------------------------------------------------

  /**
   * POST /queries/{id}/comments: appends a timestamped follow-up. A student
   * follow-up on an ANSWERED thread sets awaiting_admin_reply=true while the
   * prior official reply is kept. Closed threads reject new comments (409).
   */
  @Transactional
  public Map<String, Object> comment(
      String authenticatedSubject, String threadId,
      QueryDtos.CommentRequest req, String requestId) {
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    validateBody(req.body());
    Map<String, Object> thread = repo.lockThread(threadId);
    String studentId = String.valueOf(thread.get("studentId"));
    ResolvedActor actor = resolveThreadActor(authenticatedSubject, studentId, threadId, requestId);
    String status = String.valueOf(thread.get("status"));
    if ("CLOSED".equals(status)) {
      throw new ConflictException("INVALID_STATE",
          "Thread is closed; request a reopen instead of commenting");
    }
    String messageId = repo.insertMessage(threadId, actor.profileId(), actor.authorType(),
        sanitize(req.body()), 1, null);
    // Student follow-up re-arms the staff queue; the prior reply row is kept.
    if (actor.isStudentSide() && "ANSWERED".equals(status)) {
      repo.setAwaitingAdmin(threadId, true);
    }
    if (actor.isStudentSide()) {
      repo.setAwaitingAdmin(threadId, true);
      notifyAdmins(threadId, "QUERY_AWAITING_REPLY", requestId);
    } else {
      notifyStudent(studentId, threadId, "QUERY_FOLLOW_UP", requestId);
    }
    audit(actor.profileId(), "QUERY_COMMENTED", "query_thread", threadId, requestId);
    emit(threadId, "QUERY_COMMENTED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", messageId);
    out.put("threadId", threadId);
    out.put("authorType", actor.authorType());
    out.put("body", sanitize(req.body()));
    return out;
  }

  // ------------------------------------------------------------------
  // Official reply (admin, versioned, never silent rewrite)
  // ------------------------------------------------------------------

  /**
   * POST /queries/{id}/reply: the admin official reply (first reply resolves
   * IN_REVIEW -&gt; ANSWERED and clears the staff queue). Every reply inserts a
   * new row; history is never overwritten.
   */
  @Transactional
  public Map<String, Object> reply(
      String authenticatedSubject, String threadId,
      QueryDtos.ReplyRequest req, String requestId) {
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    validateBody(req.body());
    guard.requireAdmin(authenticatedSubject, requestId);
    Map<String, Object> thread = repo.lockThread(threadId);
    String status = String.valueOf(thread.get("status"));
    if ("CLOSED".equals(status)) {
      throw new ConflictException("INVALID_STATE",
          "Thread is closed; reopen before replying");
    }
    int version = toInt(thread.get("rowVersion"), 1);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    String messageId = repo.insertMessage(threadId, actorId, "ADMIN", sanitize(req.body()), 1, null);
    if (!"ANSWERED".equals(status)) {
      int updated = repo.setStatus(threadId, version, "ANSWERED", false);
      if (updated == 0) {
        throw new ConflictException("INVALID_STATE", "Reply race; refresh and retry");
      }
    } else {
      repo.setAwaitingAdmin(threadId, false);
    }
    audit(actorId, "QUERY_REPLIED", "query_thread", threadId, requestId);
    notifyStudent(String.valueOf(thread.get("studentId")), threadId, "QUERY_ANSWERED", requestId);
    emit(threadId, "QUERY_REPLIED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", messageId);
    out.put("threadId", threadId);
    out.put("status", "ANSWERED");
    return out;
  }

  /**
   * PUT /queries/{id}/reply/{messageId}: versioned edit of an official reply.
   * Inserts a NEW version row (supersedes link); the old row is retained so
   * staff always see history. Never a silent rewrite.
   */
  @Transactional
  public Map<String, Object> editReply(
      String authenticatedSubject, String threadId, String messageId,
      QueryDtos.EditReplyRequest req, String requestId) {
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    validateBody(req.body());
    guard.requireAdmin(authenticatedSubject, requestId);
    Map<String, Object> thread = repo.lockThread(threadId);
    Map<String, Object> original = repo.findMessageById(messageId);
    if (!threadId.equals(String.valueOf(original.get("threadId")))) {
      throw new ResourceNotFoundException("Not found");
    }
    String authorType = String.valueOf(original.get("authorType"));
    if (!"ADMIN".equals(authorType) && !"COORDINATOR".equals(authorType)) {
      throw new ConflictException("INVALID_STATE", "Only official replies are versioned");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    int nextVersion = toInt(original.get("version"), 1) + 1;
    String newId = repo.insertMessage(threadId, actorId, authorType,
        sanitize(req.body()), nextVersion, messageId);
    audit(actorId, "QUERY_REPLY_EDITED", "query_message", newId, requestId);
    emit(threadId, "QUERY_REPLY_EDITED", requestId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", newId);
    out.put("supersedes", messageId);
    out.put("version", nextVersion);
    return out;
  }

  // ------------------------------------------------------------------
  // Close / reopen
  // ------------------------------------------------------------------

  /** POST /queries/{id}/close: admin closes (ANSWERED|IN_REVIEW -&gt; CLOSED). */
  @Transactional
  public Map<String, Object> close(
      String authenticatedSubject, String threadId, String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    Map<String, Object> thread = repo.lockThread(threadId);
    String status = String.valueOf(thread.get("status"));
    if ("CLOSED".equals(status)) {
      throw new ConflictException("INVALID_STATE", "Thread is already closed");
    }
    if (!"ANSWERED".equals(status) && !"IN_REVIEW".equals(status)
        && !"AWAITING_STUDENT_RESPONSE".equals(status)) {
      throw new ConflictException("INVALID_STATE",
          "Only open threads can be closed (current: " + status + ")");
    }
    int version = toInt(thread.get("rowVersion"), 1);
    int updated = repo.markClosed(threadId, version);
    if (updated == 0) {
      throw new ConflictException("INVALID_STATE", "Close race; refresh and retry");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();
    audit(actorId, "QUERY_CLOSED", "query_thread", threadId, requestId);
    emit(threadId, "QUERY_CLOSED", requestId);
    return threadPayload(threadId);
  }

  /**
   * POST /queries/{id}/reopen: admin reopens (CLOSED -&gt; IN_REVIEW). A
   * student/parent call is a REQUEST: state is unchanged and DI is notified
   * (the request-reopen button path).
   */
  @Transactional
  public Map<String, Object> reopen(
      String authenticatedSubject, String threadId, String requestId) {
    Map<String, Object> thread = repo.lockThread(threadId);
    String status = String.valueOf(thread.get("status"));
    if (!"CLOSED".equals(status)) {
      throw new ConflictException("INVALID_STATE", "Only closed threads can be reopened");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    if (caller != null && caller.isAdmin()) {
      int version = toInt(thread.get("rowVersion"), 1);
      int updated = repo.markReopened(threadId, version);
      if (updated == 0) {
        throw new ConflictException("INVALID_STATE", "Reopen race; refresh and retry");
      }
      audit(caller.id(), "QUERY_REOPENED", "query_thread", threadId, requestId);
      emit(threadId, "QUERY_REOPENED", requestId);
      notifyAdmins(threadId, "QUERY_REOPENED", requestId);
      return threadPayload(threadId);
    }
    // Student/parent request-reopen: must own (or be linked to) the thread;
    // state unchanged, DI queue notified.
    String studentId = String.valueOf(thread.get("studentId"));
    ResolvedActor actor = resolveThreadActor(authenticatedSubject, studentId, threadId, requestId);
    audit(actor.profileId(), "QUERY_REOPEN_REQUESTED", "query_thread", threadId, requestId);
    notifyAdmins(threadId, "QUERY_REOPEN_REQUESTED", requestId);
    emit(threadId, "QUERY_REOPEN_REQUESTED", requestId);
    Map<String, Object> out = threadPayload(threadId);
    out.put("reopenRequested", true);
    return out;
  }

  // ------------------------------------------------------------------
  // Actor resolution
  // ------------------------------------------------------------------

  /** Posting side for a NEW thread (student/parent own, admin DI-only). */
  private ResolvedActor resolvePostingActor(String authenticatedSubject, String requestId) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    String role = String.valueOf(caller.get("role"));
    if ("student".equalsIgnoreCase(role)) {
      return new ResolvedActor(callerId, callerId, "STUDENT", "STUDENT", true);
    }
    if ("parent".equalsIgnoreCase(role)) {
      // Parent posts in the context of their pinned child (selected_view echo).
      String child = linkedChild(callerId);
      if (child == null) {
        throw new IllegalArgumentException("No linked student for this parent account");
      }
      return new ResolvedActor(callerId, child, "PARENT", "PARENT", true);
    }
    throw new AccessDeniedException("Students and parents only");
  }

  /** Posting side for an EXISTING thread (owner, linked parent, or admin). */
  private ResolvedActor resolveThreadActor(
      String authenticatedSubject, String studentId, String threadId, String requestId) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    String role = String.valueOf(caller.get("role"));
    String status = String.valueOf(caller.get("status"));
    if (callerId.equals(studentId)) {
      return new ResolvedActor(callerId, studentId, roleRole("STUDENT", role), "STUDENT", true);
    }
    if ("admin".equalsIgnoreCase(role) && "Approved".equals(status)) {
      return new ResolvedActor(callerId, studentId, "ADMIN", "ADMIN", false);
    }
    if (("coordinator".equalsIgnoreCase(role) || "evaluator".equalsIgnoreCase(role)
        || "staff".equalsIgnoreCase(role)) && "Approved".equals(status)) {
      // Staff follow-ups ride the same full-width thread (author attributed).
      return new ResolvedActor(callerId, studentId, "COORDINATOR", "COORDINATOR", false);
    }
    if ("parent".equalsIgnoreCase(role) && repo.isParentLinked(callerId, studentId)) {
      return new ResolvedActor(callerId, studentId, "PARENT", "PARENT", true);
    }
    if (audit != null) {
      audit.record(callerId, "ACCESS_DENIED", "query_thread", threadId, requestId);
    }
    if ("student".equalsIgnoreCase(role) || "parent".equalsIgnoreCase(role)) {
      throw new ResourceNotFoundException("Not found");
    }
    throw new AccessDeniedException("Not permitted");
  }

  /**
   * Owner resolution for reads/listing. Admin reads are out of scope here
   * (staff queue is a separate admin surface); this method returns the OWN
   * student id for students, the LINKED child for parents, and 403 otherwise.
   */
  private String ownOrLinkedStudent(
      String authenticatedSubject, String targetStudentId, String requestId, boolean scoped) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    String role = String.valueOf(caller.get("role"));
    if ("student".equalsIgnoreCase(role)) {
      if (scoped && targetStudentId != null && !callerId.equals(targetStudentId)) {
        throw new ResourceNotFoundException("Not found");
      }
      return callerId;
    }
    if ("parent".equalsIgnoreCase(role)) {
      String child = linkedChild(callerId);
      if (child == null) {
        throw new IllegalArgumentException("No linked student for this parent account");
      }
      if (scoped && targetStudentId != null && !child.equals(targetStudentId)
          && !repo.isParentLinked(callerId, targetStudentId)) {
        throw new ResourceNotFoundException("Not found");
      }
      return scoped && targetStudentId != null ? targetStudentId : child;
    }
    if ("admin".equalsIgnoreCase(role) && "Approved".equals(String.valueOf(caller.get("status")))) {
      if (targetStudentId != null) {
        return targetStudentId;
      }
      throw new AccessDeniedException("Not permitted");
    }
    throw new AccessDeniedException("Not permitted");
  }

  private String linkedChild(String parentProfileId) {
    return repo.findLinkedChildId(parentProfileId);
  }

  // ------------------------------------------------------------------
  // Notification fan-out (in-app + email via outbox, same transaction)
  // ------------------------------------------------------------------

  /** Student activity -> DI queue: in-app per admin + team email via outbox. */
  private void notifyAdmins(String threadId, String type, String requestId) {
    List<String> adminIds = repo.findAdminIds();
    for (String adminId : adminIds) {
      if (notifications != null) {
        try {
          notifications.notify(adminId, type, "query", threadId, 1, "{}",
              type + ":" + threadId + ":" + adminId);
        } catch (Exception ignored) {
          // Best-effort per recipient; the outbox event below is the backstop.
        }
      }
    }
    emit(threadId, type, requestId);
  }

  /** DI activity -> student: in-app + email via outbox. */
  private void notifyStudent(String studentId, String threadId, String type, String requestId) {
    if (notifications != null) {
      try {
        notifications.notify(studentId, type, "query", threadId, 1, "{}",
            type + ":" + threadId + ":" + studentId);
      } catch (Exception ignored) {
        // Best-effort; the outbox event below is the backstop.
      }
    }
    emit(threadId, type, requestId);
  }

  private void emit(String threadId, String eventType, String requestId) {
    if (outbox != null) {
      outbox.emit("query", threadId, eventType,
          "{\"requestId\":\"" + requestId + "\"}", eventType + ":" + threadId + ":" + requestId);
    }
  }

  private void audit(String actor, String action, String entity, String entityId, String requestId) {
    if (audit != null) {
      audit.record(actor, action, entity, entityId, requestId);
    }
  }

  private Map<String, Object> threadPayload(String threadId) {
    Map<String, Object> thread = repo.findThreadById(threadId);
    Map<String, Object> out = new LinkedHashMap<>(thread);
    out.put("messages", repo.findMessagesChronological(threadId));
    return out;
  }

  private static String roleRole(String dflt, String role) {
    if ("parent".equalsIgnoreCase(role)) {
      return "PARENT";
    }
    return dflt;
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

  /** Posting identity for one write (profile, owning student, author type, side). */
  record ResolvedActor(
      String profileId, String studentId, String role, String authorType, boolean studentSide) {
    boolean isStudentSide() {
      return studentSide;
    }
  }
}
