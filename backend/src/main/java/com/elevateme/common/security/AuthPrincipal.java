package com.elevateme.common.security;

/**
 * Authenticated principal stored in the Spring {@code SecurityContext} after JWT verification.
 *
 * <p>The {@code subject} is the verified Supabase {@code sub} claim (opaque, never browser
 * metadata). The {@code email} is the verified {@code email} claim and may be null when the
 * issuer omits it — callers must fall back to the DB row, never to client-supplied values.
 */
public record AuthPrincipal(String subject, String email) {
  public AuthPrincipal {
    if (subject == null || subject.isBlank()) {
      throw new IllegalArgumentException("subject is required");
    }
  }
}
