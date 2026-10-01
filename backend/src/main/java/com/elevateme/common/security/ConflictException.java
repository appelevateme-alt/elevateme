package com.elevateme.common.security;

/**
 * Domain conflict: optimistic version mismatch, duplicate registration,
 * capacity exhaustion, invalid state transition, idempotency payload mismatch.
 * Mapped to 409 with a stable machine-readable code (see GlobalExceptionHandler).
 */
public class ConflictException extends RuntimeException {
  private final String code;

  public ConflictException(String code, String message) {
    super(message);
    this.code = code == null || code.isBlank() ? "CONFLICT" : code;
  }

  public String getCode() {
    return code;
  }
}
