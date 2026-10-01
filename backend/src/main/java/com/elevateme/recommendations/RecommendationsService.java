package com.elevateme.recommendations;

import com.elevateme.audit.AuditService;
import com.elevateme.common.outbox.OutboxService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AuthContext;
import com.elevateme.common.security.ResourceNotFoundException;
import com.elevateme.common.security.ScopeGuard;
import com.elevateme.notifications.NotificationsService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 5 targeted recommendations (spec §9 admin + §10 + §11).
 *
 * <ul>
 *   <li>Admin-only create/preview: teachers (non-admin) get 403 — they cannot
 *       publish recommendations. The admin gate lives here (services own authz;
 *       controllers delegate).</li>
 *   <li>Preview resolves the audience without persisting: explicit IDs and/or
 *       institution and/or a criterion rule over the LATEST RELEASED score with
 *       an explicit comparator. Missing scores are NEVER zero — students without
 *       a released score row are excluded.</li>
 *   <li>Create freezes the audience snapshot at publish time (later-matching
 *       students do NOT receive history), deduplicates IDs, and pins at most 3
 *       per student in admin pin order.</li>
 *   <li>PATCH is own-recipient only: completing one recipient never touches the
 *       group message or other recipients. A linked parent may complete with
 *       shared attribution (completed_by = parent profile id).</li>
 * </ul>
 *
 * <p>Every write emits same-transaction outbox + audit (actor, action, entity,
 * requestId, no PII).
 */
@Service
public class RecommendationsService {
  public static final int MAX_PINS = 3;
  private static final Set<String> PRIORITIES = Set.of("HIGH", "MED", "LOW");
  private static final Set<String> COMPARATORS = Set.of("LT", "LTE", "GT", "GTE", "EQ");

  private final AuthContext auth;
  private final RecommendationsRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;
  private final OutboxService outbox;
  private final NotificationsService notifications;

  /** Legacy wiring (skeleton callers/tests). */
  public RecommendationsService(AuthContext auth) {
    this(auth, null, null, null, null, null);
  }

  @Autowired
  public RecommendationsService(
      AuthContext auth,
      RecommendationsRepository repo,
      ScopeGuard guard,
      AuditService audit,
      OutboxService outbox,
      NotificationsService notifications) {
    this.auth = auth;
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
    this.outbox = outbox;
    this.notifications = notifications;
  }

  public String currentSubject() {
    return auth.currentSubject();
  }

  // ------------------------------------------------------------------
  // Pure helpers (unit-testable)
  // ------------------------------------------------------------------

  /** Normalize + validate priority (HIGH|MED|LOW). 422 on unknown. */
  public static String normalizePriority(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("priority is required (HIGH|MED|LOW)");
    }
    String n = raw.trim().toUpperCase();
    if (!PRIORITIES.contains(n)) {
      throw new IllegalArgumentException("Unknown priority: " + raw);
    }
    return n;
  }

  /** Normalize + validate comparator (LT|LTE|GT|GTE|EQ). 422 on unknown. */
  public static String normalizeComparator(String raw) {
    if (raw == null || raw.isBlank()) {
      throw new IllegalArgumentException("comparator is required (LT|LTE|GT|GTE|EQ)");
    }
    String n = raw.trim().toUpperCase();
    if (!COMPARATORS.contains(n)) {
      throw new IllegalArgumentException("Unknown comparator: " + raw);
    }
    return n;
  }

  /**
   * Explicit comparator match on a released score. Null scores never match
   * (missing is never zero) — callers must exclude nulls before calling.
   */
  public static boolean matchesCriterion(Integer score, String comparator, int threshold) {
    if (score == null) {
      return false;
    }
    return switch (normalizeComparator(comparator)) {
      case "LT" -> score < threshold;
      case "LTE" -> score <= threshold;
      case "GT" -> score > threshold;
      case "GTE" -> score >= threshold;
      default -> score == threshold; // EQ
    };
  }

  /** Deduplicate IDs preserving first-seen (admin pin) order; blanks dropped. */
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
  // Audience preview (admin only, no writes)
  // ------------------------------------------------------------------

  /**
   * POST /admin/audiences/preview: returns matching recipient IDs + count.
   * Nothing is persisted; creation snapshots these IDs.
   */
  public Map<String, Object> previewAudience(
      String authenticatedSubject,
      RecommendationDtos.AudiencePreviewRequest req,
      String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    List<String> ids = resolveAudience(req);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("recipientIds", ids);
    out.put("count", ids.size());
    return out;
  }

  /** Resolve + dedupe the audience across all targeting dimensions (union). */
  List<String> resolveAudience(RecommendationDtos.AudiencePreviewRequest req) {
    LinkedHashSet<String> union = new LinkedHashSet<>();
    if (req != null) {
      if (req.individualIds() != null && !req.individualIds().isEmpty()) {
        union.addAll(repo.findApprovedStudentsByIds(dedupeIds(req.individualIds())));
      }
      if (req.explicitBatch() != null && !req.explicitBatch().isEmpty()) {
        union.addAll(repo.findApprovedStudentsByIds(dedupeIds(req.explicitBatch())));
      }
      if (req.institutionId() != null && !req.institutionId().isBlank()) {
        union.addAll(repo.findApprovedStudentsByInstitution(req.institutionId().trim()));
      }
      if (req.criterionRule() != null) {
        RecommendationDtos.CriterionRule rule = req.criterionRule();
        if (rule.criterion() == null || rule.criterion().isBlank()) {
          throw new IllegalArgumentException("criterion is required");
        }
        if (rule.threshold() == null) {
          throw new IllegalArgumentException("threshold is required");
        }
        union.addAll(repo.findStudentsByReleasedCriterion(
            rule.criterion().trim(),
            normalizeComparator(rule.comparator()),
            rule.threshold()));
      }
    }
    return new ArrayList<>(union);
  }

  // ------------------------------------------------------------------
  // Create (admin only, frozen snapshot, dedupe, pin max 3)
  // ------------------------------------------------------------------

  /**
   * POST /admin/recommendations: snapshots the resolved audience at publish
   * time (later-matching students do NOT receive history), deduplicates IDs,
   * and pins at most 3 per student in admin pin order.
   */
  @Transactional
  public Map<String, Object> create(
      String authenticatedSubject,
      RecommendationDtos.CreateRecommendationsRequest req,
      String requestId) {
    guard.requireAdmin(authenticatedSubject, requestId);
    if (req == null) {
      throw new IllegalArgumentException("request body is required");
    }
    if (req.title() == null || req.title().isBlank()) {
      throw new IllegalArgumentException("title is required");
    }
    if (req.action() == null || req.action().isBlank()) {
      throw new IllegalArgumentException("action is required");
    }
    if (req.reason() == null || req.reason().isBlank()) {
      throw new IllegalArgumentException("reason is required");
    }
    String priority = normalizePriority(req.priority());
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    String actorId = caller == null ? authenticatedSubject : caller.id();

    List<String> audience = resolveAudience(new RecommendationDtos.AudiencePreviewRequest(
        req.individualIds(), req.institutionId(), req.criterionRule(), req.explicitBatch()));
    if (audience.isEmpty()) {
      throw new IllegalArgumentException("audience is empty: no matching recipients");
    }

    String snapshot = snapshotJson(audience, req);
    String id = repo.insertRecommendation(
        req.title().trim(), req.action().trim(), req.reason().trim(),
        req.skillArea() == null ? null : req.skillArea().trim(),
        priority, req.dueDate(), snapshot,
        emptyToNull(req.linkedReportId()), actorId);

    boolean pin = Boolean.TRUE.equals(req.pinned());
    int inserted = 0;
    int skipped = 0;
    for (String studentId : audience) {
      Integer pinOrder = null;
      if (pin) {
        int alreadyPinned = repo.countPinnedByStudent(studentId);
        if (alreadyPinned < MAX_PINS) {
          pinOrder = alreadyPinned + 1;
        }
        // At max: the recipient is still created (unpinned) so the batch never
        // fails — the 3-pin budget only caps pinned rows.
      }
      int n = repo.insertRecipientDeduped(id, studentId, pinOrder);
      if (n == 0) {
        skipped++;
      } else {
        inserted++;
      }
      if (notifications != null && n == 1) {
        try {
          notifications.notify(studentId, "RECOMMENDATION_ASSIGNED", "recommendation",
              id, 1, "{\"priority\":\"" + priority + "\"}",
              "RECOMMENDATION_ASSIGNED:" + studentId + ":" + id);
        } catch (Exception ignored) {
          // Best-effort fan-out: the recipient row is the source of truth.
        }
      }
    }
    if (audit != null) {
      audit.record(actorId, "RECOMMENDATION_CREATED", "recommendation", id, requestId);
    }
    if (outbox != null) {
      outbox.emit("recommendation", id, "RECOMMENDATION_CREATED",
          "{\"recipients\":" + inserted + "}",
          "RECOMMENDATION_CREATED:" + id + ":" + requestId);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("id", id);
    out.put("recipientIds", audience);
    out.put("recipientCount", inserted);
    out.put("skippedDuplicates", skipped);
    return out;
  }

  // ------------------------------------------------------------------
  // Own completion / pin (student + linked parent)
  // ------------------------------------------------------------------

  /** Own inbox (student) or linked-child inbox (parent view). */
  public List<Map<String, Object>> listMine(String authenticatedSubject, String requestId) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    if ("parent".equalsIgnoreCase(String.valueOf(caller.get("role")))) {
      String child = repo.findLinkedChildId(callerId);
      if (child == null) {
        return List.of();
      }
      return repo.findForStudent(child);
    }
    return repo.findForStudent(callerId);
  }

  /**
   * PATCH /me/recommendations/{recipientId}: own completion/undo (and pin/note)
   * on the caller's own recipient row only. A linked parent may complete with
   * shared attribution. Other recipients of the same recommendation are
   * untouched — the group message never changes for others.
   */
  @Transactional
  public Map<String, Object> patchMine(
      String authenticatedSubject, String recipientId,
      RecommendationDtos.PatchRecommendationRequest req, String requestId) {
    if (recipientId == null || recipientId.isBlank()) {
      throw new IllegalArgumentException("recipientId is required");
    }
    Map<String, Object> recipient = repo.findRecipientById(recipientId);
    String studentId = String.valueOf(recipient.get("studentId"));
    String actorId = resolveActingProfile(authenticatedSubject, studentId, recipientId, requestId);

    if (req != null && req.completed() != null) {
      if (req.completed()) {
        repo.markCompleted(recipientId, actorId);
      } else {
        repo.markUncompleted(recipientId);
      }
    }
    if (req != null && req.pinned() != null) {
      if (req.pinned()) {
        Object current = recipient.get("pinnedOrder");
        if (current == null) {
          int alreadyPinned = repo.countPinnedByStudent(studentId);
          if (alreadyPinned >= MAX_PINS) {
            throw new IllegalArgumentException(
                "At most " + MAX_PINS + " pinned recommendations per student");
          }
          repo.setPinned(recipientId, alreadyPinned + 1);
        }
      } else {
        repo.clearPinned(recipientId);
      }
    }
    if (req != null && req.note() != null) {
      repo.updateNote(recipientId, req.note());
    }
    if (audit != null) {
      audit.record(actorId, "RECOMMENDATION_PROGRESS", "recommendation_recipient",
          recipientId, requestId);
    }
    return repo.findRecipientById(recipientId);
  }

  // ------------------------------------------------------------------
  // Ownership helpers
  // ------------------------------------------------------------------

  /**
   * Resolve the acting profile: own student row, or a linked parent (shared
   * attribution). Anything else is 403 (own recipient record only); unknown
   * students are 404 (no enumeration).
   */
  private String resolveActingProfile(
      String authenticatedSubject, String studentId, String recipientId, String requestId) {
    Map<String, Object> caller = repo.findCallerProfile(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String callerId = String.valueOf(caller.get("id"));
    String role = String.valueOf(caller.get("role"));
    if (callerId.equals(studentId)) {
      return callerId;
    }
    if ("admin".equalsIgnoreCase(role) && "Approved".equals(String.valueOf(caller.get("status")))) {
      return callerId;
    }
    if ("parent".equalsIgnoreCase(role) && repo.isParentLinked(callerId, studentId)) {
      return callerId;
    }
    if (audit != null) {
      audit.record(callerId, "ACCESS_DENIED", "recommendation_recipient", recipientId, requestId);
    }
    // Cross-student reads are 404 (no enumeration); other denials are 403.
    if ("student".equalsIgnoreCase(role)) {
      throw new ResourceNotFoundException("Not found");
    }
    throw new AccessDeniedException("Own recommendations only");
  }

  private static String snapshotJson(
      List<String> audience, RecommendationDtos.CreateRecommendationsRequest req) {
    StringBuilder sb = new StringBuilder("{\"recipientIds\":[");
    for (int i = 0; i < audience.size(); i++) {
      if (i > 0) {
        sb.append(",");
      }
      sb.append("\"").append(audience.get(i).replace("\"", "")).append("\"");
    }
    sb.append("],\"frozenAt\":\"").append(java.time.Instant.now()).append("\"");
    if (req.criterionRule() != null && req.criterionRule().criterion() != null) {
      sb.append(",\"criterion\":\"")
          .append(req.criterionRule().criterion().replace("\"", "")).append("\"");
    }
    if (req.linkedReportId() != null && !req.linkedReportId().isBlank()) {
      sb.append(",\"linkedReportId\":\"")
          .append(req.linkedReportId().replace("\"", "")).append("\"");
    }
    sb.append("}");
    return sb.toString();
  }

  private static String emptyToNull(String s) {
    return s == null || s.isBlank() ? null : s.trim();
  }
}
