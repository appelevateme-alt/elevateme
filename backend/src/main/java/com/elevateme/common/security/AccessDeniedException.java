package com.elevateme.common.security;

/** Authenticated but not permitted: mapped to 403 FORBIDDEN. */
public class AccessDeniedException extends RuntimeException {
  public AccessDeniedException(String message) {
    super(message);
  }
}
