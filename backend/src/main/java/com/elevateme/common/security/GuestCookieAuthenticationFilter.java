package com.elevateme.common.security;

import com.elevateme.participation.GuestService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guest cookie authentication (Phase 3): {@code guest_session} HttpOnly cookie -&gt; ROLE_GUEST.
 *
 * <p>Validates the cookie via {@link GuestService#validateGuestSession} (hash-only lookup,
 * expiry + revocation checked, no grace window). On success sets a ROLE_GUEST authentication with
 * the invitation scope as details; on failure the request continues unauthenticated so the entry
 * point returns 401. Bearer JWT callers are untouched (guest cookie never upgrades a staff
 * session, and staff Bearer + guest cookie together still deny release via the service gate).
 */
@Component
public class GuestCookieAuthenticationFilter extends OncePerRequestFilter {

  private final GuestService guests;

  public GuestCookieAuthenticationFilter(GuestService guests) {
    this.guests = guests;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    try {
      if (SecurityContextHolder.getContext().getAuthentication() == null) {
        String token = guestCookie(request);
        if (token != null && !token.isBlank()) {
          try {
            Map<String, Object> scope = guests.validateGuestSession(token);
            var auth =
                new UsernamePasswordAuthenticationToken(
                    "guest:" + scope.get("invitationId"),
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_GUEST")));
            auth.setDetails(scope);
            SecurityContextHolder.getContext().setAuthentication(auth);
          } catch (IllegalStateException e) {
            // Invalid/expired/revoked guest session: stay unauthenticated (401 downstream).
            SecurityContextHolder.clearContext();
          }
        }
      }
    } catch (Exception ignored) {
      // Best-effort: guest auth must never break Bearer staff paths.
    }
    chain.doFilter(request, response);
  }

  private static String guestCookie(HttpServletRequest request) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return null;
    }
    for (Cookie c : cookies) {
      if ("guest_session".equals(c.getName())) {
        return c.getValue();
      }
    }
    return null;
  }
}
