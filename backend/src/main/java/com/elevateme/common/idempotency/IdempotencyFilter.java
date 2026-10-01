package com.elevateme.common.idempotency;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Idempotency-Key handling scoped to actor + operation.
 * TODO(revamp): persist (actor_subject, operation=method+path, key) -&gt; response hash
 * in a table within the same transaction as the business write; repeat POST with the
 * same key returns the stored response (repeat-safe, e.g. release-reports); different
 * actor or operation MUST NOT collide; TTL + cleanup job.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class IdempotencyFilter extends OncePerRequestFilter {
  public static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String key = request.getHeader(IDEMPOTENCY_KEY_HEADER);
    if (key != null && !key.isBlank() && !"GET".equalsIgnoreCase(request.getMethod())) {
      // TODO: look up (subject, method+path, key); short-circuit on hit; store on success.
      request.setAttribute("idempotencyKey", key);
    }
    chain.doFilter(request, response);
  }
}
