package com.elevateme.common.security;

import com.elevateme.common.api.RequestIdFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates {@code /api/**} via Supabase JWT ({@code Authorization: Bearer}).
 *
 * <ul>
 *   <li>Guest cookie paths ({@code /guest/*}) are skipped here — handled by the guest filter.</li>
 *   <li>On success sets {@code UsernamePasswordAuthenticationToken} with an {@link AuthPrincipal}
 *       (verified subject + email) and {@code ROLE_USER}.</li>
 *   <li>On failure (present but invalid Bearer on an {@code /api} path) responds 401
 *       {@code {code:UNAUTHENTICATED,message,requestId}} without continuing the chain.</li>
 *   <li>Requests without a Bearer token continue unauthenticated so the entry point can 401.</li>
 * </ul>
 */
@Component
public class SupabaseJwtAuthenticationFilter extends OncePerRequestFilter {

  private final JwtVerifier verifier;
  private final ObjectMapper mapper = new ObjectMapper();

  public SupabaseJwtAuthenticationFilter(JwtVerifier verifier) {
    this.verifier = verifier;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    // Guest fragment->cookie exchange + guest cookie flow own their auth (HMAC, hash-only).
    String uri = request.getRequestURI();
    return uri.contains("/guest/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (SecurityContextHolder.getContext().getAuthentication() == null) {
      String header = request.getHeader(HttpHeaders.AUTHORIZATION);
      if (header != null && header.startsWith("Bearer ")) {
        String token = header.substring(7).trim();
        try {
          JwtVerifier.VerifiedPrincipal verified = verifier.verify(token);
          var principal = new AuthPrincipal(verified.subject(), verified.email());
          var auth =
              new UsernamePasswordAuthenticationToken(
                  principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
          SecurityContextHolder.getContext().setAuthentication(auth);
        } catch (Exception e) {
          SecurityContextHolder.clearContext();
          // Fail closed with a canonical JSON 401 for API callers.
          if (request.getRequestURI().startsWith("/api")) {
            writeUnauthenticated(request, response, "Invalid or expired token");
            return;
          }
        }
      }
    }
    chain.doFilter(request, response);
  }

  private void writeUnauthenticated(
      HttpServletRequest request, HttpServletResponse response, String message) throws IOException {
    String requestId = RequestIdFilter.resolve(request);
    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    mapper.writeValue(
        response.getOutputStream(), Map.of("code", "UNAUTHENTICATED", "message", message, "requestId", requestId));
  }
}
