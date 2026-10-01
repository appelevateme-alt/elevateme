package com.elevateme.common.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Subject scoping helper. Services/repositories MUST scope queries by the verified subject;
 * never accept a user id from the client without comparing to the verified subject
 * (except admin paths with explicit role checks).
 *
 * <p>The filter stores an {@link AuthPrincipal} (verified sub + email) as the authentication
 * principal. Legacy string principals (subject only) are still tolerated.
 */
@Component
public class AuthContext {

  private Authentication authentication() {
    return SecurityContextHolder.getContext().getAuthentication();
  }

  /** Verified Supabase {@code sub}. Throws {@link IllegalStateException} when unauthenticated. */
  public String currentSubject() {
    Authentication auth = authentication();
    if (auth == null) {
      throw new IllegalStateException("Unauthenticated");
    }
    Object principal = auth.getPrincipal();
    if (principal instanceof AuthPrincipal p) {
      return p.subject();
    }
    String name = auth.getName();
    if (name == null || name.isBlank() || "anonymousUser".equals(name)) {
      throw new IllegalStateException("Unauthenticated");
    }
    return name;
  }

  /** Verified email claim, or null when the issuer omits it / principal is subject-only. */
  public String currentEmail() {
    Authentication auth = authentication();
    if (auth == null) {
      return null;
    }
    Object principal = auth.getPrincipal();
    if (principal instanceof AuthPrincipal p) {
      return p.email();
    }
    return null;
  }

  public boolean isGuest() {
    Authentication auth = authentication();
    return auth != null
        && auth.getAuthorities().stream().anyMatch(a -> "ROLE_GUEST".equals(a.getAuthority()));
  }

  public boolean hasRole(String role) {
    Authentication auth = authentication();
    if (auth == null) {
      return false;
    }
    String want = role.startsWith("ROLE_") ? role : "ROLE_" + role;
    return auth.getAuthorities().stream().anyMatch(a -> want.equals(a.getAuthority()));
  }
}
