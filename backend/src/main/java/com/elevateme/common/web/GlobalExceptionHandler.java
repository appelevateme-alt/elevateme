package com.elevateme.common.web;

import com.elevateme.common.api.ApiError;
import com.elevateme.common.api.RequestIdFilter;
import com.elevateme.identity.PhotoForbiddenException;
import com.elevateme.identity.PhotoNotFoundException;
import com.elevateme.identity.PhotoValidationException;
import com.elevateme.common.security.AccessDeniedException;
import com.elevateme.common.security.AccountPendingException;
import com.elevateme.common.security.ConflictException;
import com.elevateme.common.security.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps validation + domain + Phase 1c isolation + Phase 2 lifecycle exceptions
 * to ApiError with requestId.
 * Validation failures are 422. Cross-student out-of-scope reads are 404 (no
 * enumeration); pending staff is 403 ACCOUNT_PENDING; other denials are 403.
 * Version/capacity/duplicate/state conflicts are 409 with stable codes
 * (VERSION_CONFLICT, CAPACITY, DUPLICATE, INVALID_STATE, IDEMPOTENCY_CONFLICT,
 * REGISTRATION_CLOSED).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(ConflictException.class)
  public ResponseEntity<ApiError> handleConflict(ConflictException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ApiError.of(ex.getCode(), ex.getMessage(), RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(org.springframework.dao.DuplicateKeyException.class)
  public ResponseEntity<ApiError> handleDuplicateKey(
      org.springframework.dao.DuplicateKeyException ex, HttpServletRequest req) {
    // Partial-unique dedupe race (program/session-level registration) → 409 DUPLICATE.
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ApiError.of("DUPLICATE", "Already exists", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
  public ResponseEntity<ApiError> handleDataIntegrity(
      org.springframework.dao.DataIntegrityViolationException ex, HttpServletRequest req) {
    // Unique violations (SQLState 23505) → 409 DUPLICATE; session-reparent
    // trigger (P0001 + "[409 Conflict]" marker) → 409 INVALID_STATE.
    String sqlState = extractSqlState(ex);
    if ("23505".equals(sqlState) || containsDuplicateMarker(ex)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("DUPLICATE", "Already exists", RequestIdFilter.resolve(req)));
    }
    if (contains409Marker(ex)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("INVALID_STATE", "Invalid state for this operation",
              RequestIdFilter.resolve(req)));
    }
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ApiError.of("DUPLICATE", "Already exists", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(org.springframework.dao.DataAccessException.class)
  public ResponseEntity<ApiError> handleDataAccess(
      org.springframework.dao.DataAccessException ex, HttpServletRequest req) {
    // DB reparent block (V2/V6 prevent_session_reparenting, ERRCODE P0001 with
    // "[409 Conflict]" marker) surfaces as 409 INVALID_STATE, not 500.
    // Unique violations without a DuplicateKey translation (SQLState 23505) → 409 DUPLICATE.
    String sqlState = extractSqlState(ex);
    if ("23505".equals(sqlState) || containsDuplicateMarker(ex)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("DUPLICATE", "Already exists", RequestIdFilter.resolve(req)));
    }
    if (contains409Marker(ex) || "P0001".equals(sqlState)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("INVALID_STATE", "Invalid state for this operation",
              RequestIdFilter.resolve(req)));
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("INTERNAL", "Unexpected error", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(java.sql.SQLException.class)
  public ResponseEntity<ApiError> handleSql(
      java.sql.SQLException ex, HttpServletRequest req) {
    // Raw PSQLException path (driver on classpath at runtime): same mapping
    // without a compile-time driver import.
    String sqlState = ex.getSQLState();
    if ("23505".equals(sqlState)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("DUPLICATE", "Already exists", RequestIdFilter.resolve(req)));
    }
    if ("P0001".equals(sqlState) || contains409Marker(ex)) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(ApiError.of("INVALID_STATE", "Invalid state for this operation",
              RequestIdFilter.resolve(req)));
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("INTERNAL", "Unexpected error", RequestIdFilter.resolve(req)));
  }

  private static String extractSqlState(Throwable ex) {
    Throwable t = ex;
    while (t != null) {
      if (t instanceof java.sql.SQLException sql) {
        if (sql.getSQLState() != null) {
          return sql.getSQLState();
        }
      }
      // PSQLException exposes SQLState without a compile-time import; reflect once.
      try {
        java.lang.reflect.Method m = t.getClass().getMethod("getSQLState");
        Object v = m.invoke(t);
        if (v instanceof String s && !s.isBlank()) {
          return s;
        }
      } catch (Exception ignored) {
        // not a SQL exception — keep walking the cause chain
      }
      t = t.getCause();
    }
    return null;
  }

  private static boolean contains409Marker(Throwable ex) {
    Throwable t = ex;
    while (t != null) {
      String msg = t.getMessage();
      if (msg != null
          && (msg.contains("[409 Conflict]")
              || msg.contains("[409")
              || msg.contains("SESSION_PROGRAM_IMMUTABLE"))) {
        return true;
      }
      t = t.getCause();
    }
    return false;
  }

  private static boolean containsDuplicateMarker(Throwable ex) {
    Throwable t = ex;
    while (t != null) {
      String msg = t.getMessage();
      if (msg != null) {
        String lower = msg.toLowerCase();
        if (lower.contains("duplicate") || lower.contains("unique")
            || lower.contains("registrations_program_level_unique")
            || lower.contains("registrations_session_level_unique")) {
          return true;
        }
      }
      t = t.getCause();
    }
    return false;
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiError> handleValidation(
      MethodArgumentNotValidException ex, HttpServletRequest req) {
    var violations =
        ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new ApiError.FieldViolation(fe.getField(), fe.getDefaultMessage()))
            .collect(Collectors.toList());
    String requestId = RequestIdFilter.resolve(req);
    return ResponseEntity.unprocessableEntity()
        .body(new ApiError("VALIDATION_FAILED", "Validation failed", violations, requestId));
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<ApiError> handleConstraint(
      ConstraintViolationException ex, HttpServletRequest req) {
    var violations =
        ex.getConstraintViolations().stream()
            .map(v -> new ApiError.FieldViolation(v.getPropertyPath().toString(), v.getMessage()))
            .collect(Collectors.toList());
    return ResponseEntity.unprocessableEntity()
        .body(
            new ApiError(
                "VALIDATION_FAILED", "Validation failed", violations, RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
  public ResponseEntity<ApiError> handleNotReadable(
      org.springframework.http.converter.HttpMessageNotReadableException ex,
      HttpServletRequest req) {
    // Fractional scores into Integer fields (and other JSON type mismatches) surface here.
    // In the evaluation domain a non-integer score is a 422 (blank != zero, INT-only).
    String msg = ex.getMessage() == null ? "" : ex.getMessage().toLowerCase();
    if (msg.contains("score") || msg.contains("integer") || msg.contains("mismatched")
        || msg.contains("parse") || msg.contains("json")) {
      return ResponseEntity.unprocessableEntity()
          .body(
              ApiError.of(
                  "VALIDATION_FAILED",
                  "scores must be integers 0-100 (blank != zero)",
                  RequestIdFilter.resolve(req)));
    }
    return ResponseEntity.unprocessableEntity()
        .body(ApiError.of("VALIDATION_FAILED", "Malformed request body", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(com.fasterxml.jackson.databind.exc.InvalidFormatException.class)
  public ResponseEntity<ApiError> handleInvalidFormat(
      com.fasterxml.jackson.databind.exc.InvalidFormatException ex, HttpServletRequest req) {
    return ResponseEntity.unprocessableEntity()
        .body(
            ApiError.of(
                "VALIDATION_FAILED",
                "scores must be integers 0-100 (blank != zero)",
                RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<ApiError> handleIllegalArg(IllegalArgumentException ex, HttpServletRequest req) {
    // Domain validation (e.g. scores 0-100, missing answers) surfaces as 422 per spec.
    // PhotoValidationException carries the offending field for inline errors.
    if (ex instanceof PhotoValidationException pve) {
      String requestId = RequestIdFilter.resolve(req);
      var violations =
          java.util.List.of(new ApiError.FieldViolation(pve.getField(), pve.getMessage()));
      return ResponseEntity.unprocessableEntity()
          .body(new ApiError("VALIDATION_FAILED", pve.getMessage(), violations, requestId));
    }
    return ResponseEntity.unprocessableEntity()
        .body(ApiError.of("VALIDATION_FAILED", ex.getMessage(), RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(PhotoForbiddenException.class)
  public ResponseEntity<ApiError> handlePhotoForbidden(
      PhotoForbiddenException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ApiError.of("FORBIDDEN", ex.getMessage(), RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(PhotoNotFoundException.class)
  public ResponseEntity<ApiError> handlePhotoNotFound(
      PhotoNotFoundException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ApiError.of("NOT_FOUND", ex.getMessage(), RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(AccountPendingException.class)
  public ResponseEntity<ApiError> handlePending(AccountPendingException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ApiError.of("ACCOUNT_PENDING", "Account pending review", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(AccessDeniedException.class)
  public ResponseEntity<ApiError> handleDenied(AccessDeniedException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ApiError.of("FORBIDDEN", "Not permitted", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(ResourceNotFoundException.class)
  public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ApiError.of("NOT_FOUND", "Not found", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(UnsupportedOperationException.class)
  public ResponseEntity<ApiError> handleNotImplemented(
      UnsupportedOperationException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED)
        .body(ApiError.notImplemented(RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<ApiError> handleUnauthenticated(
      IllegalStateException ex, HttpServletRequest req) {
    // AuthContext + repositories throw IllegalStateException("Unauthenticated") when no verified
    // subject is present (Phase 1a: never trust browser metadata). Map to canonical 401.
    if (ex.getMessage() != null && ex.getMessage().toLowerCase().contains("unauthenticated")) {
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
          .body(ApiError.of("UNAUTHENTICATED", "Authentication required", RequestIdFilter.resolve(req)));
    }
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("INTERNAL", "Unexpected error", RequestIdFilter.resolve(req)));
  }

  @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
  public ResponseEntity<ApiError> handleSpringDenied(
      org.springframework.security.access.AccessDeniedException ex, HttpServletRequest req) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(ApiError.of("FORBIDDEN", "Not permitted", RequestIdFilter.resolve(req)));
  }
}
