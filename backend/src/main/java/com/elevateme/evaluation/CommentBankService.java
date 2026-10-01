package com.elevateme.evaluation;

import com.elevateme.audit.AuditService;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.ScopeGuard;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Comment bank (no AI): reusable evaluator snippets.
 *
 * <p>GET returns ADMIN_SHARED (all staff) + own TEACHER_PRIVATE; admins additionally see all
 * privates for moderation. POST validates scope/criterion/text; ADMIN_SHARED requires admin,
 * TEACHER_PRIVATE requires active staff with owner = caller. No generative AI anywhere on this
 * path — entries are human-authored snippets only.
 */
@Service
public class CommentBankService {
  private static final Set<String> SCOPES = Set.of("ADMIN_SHARED", "TEACHER_PRIVATE");

  private final CommentBankRepository repo;
  private final ScopeGuard guard;
  private final AuditService audit;

  public CommentBankService(CommentBankRepository repo, ScopeGuard guard, AuditService audit) {
    this.repo = repo;
    this.guard = guard;
    this.audit = audit;
  }

  public List<Map<String, Object>> list(
      String authenticatedSubject, String criterionKey, String requestId) {
    guard.requireStaffActive(authenticatedSubject, requestId);
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    if (criterionKey != null && !criterionKey.isBlank()
        && !EvaluationDtos.CRITERION_KEYS.contains(criterionKey.trim())) {
      throw new IllegalArgumentException("Unknown criterion: " + criterionKey);
    }
    return repo.findVisible(caller.id(), caller.isAdmin(), criterionKey);
  }

  @Transactional
  public Map<String, Object> create(
      String authenticatedSubject, String scope, String criterionKey, String text, String requestId) {
    String scopeNorm = scope == null ? "" : scope.trim().toUpperCase();
    if (!SCOPES.contains(scopeNorm)) {
      throw new IllegalArgumentException("scope must be ADMIN_SHARED or TEACHER_PRIVATE");
    }
    String criterionNorm =
        criterionKey == null || criterionKey.isBlank() ? null : criterionKey.trim();
    if (criterionNorm != null && !EvaluationDtos.CRITERION_KEYS.contains(criterionNorm)) {
      throw new IllegalArgumentException("Unknown criterion: " + criterionKey);
    }
    if (text == null || text.isBlank() || text.trim().length() > 2000) {
      throw new IllegalArgumentException("text must be 1-2000 chars");
    }
    ScopeGuard.CallerProfile caller = guard.loadCaller(authenticatedSubject);
    if (caller == null) {
      throw new AccessDeniedException("Not permitted");
    }
    String ownerId;
    if ("ADMIN_SHARED".equals(scopeNorm)) {
      guard.requireAdmin(authenticatedSubject, requestId);
      ownerId = caller.id();
    } else {
      guard.requireStaffActive(authenticatedSubject, requestId);
      if (!"Approved".equals(caller.status())) {
        throw new AccessDeniedException("Not permitted");
      }
      ownerId = caller.id();
    }
    String id = repo.insert(scopeNorm, ownerId, criterionNorm, text.trim());
    if (audit != null) {
      audit.record(caller.id(), "COMMENT_BANK_CREATED", "comment_bank_entry", id, requestId);
    }
    return repo.findById(id);
  }
}
