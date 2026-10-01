package com.elevateme.common.api;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Assigns X-Request-Id per request; exposed as request attribute "requestId" + MDC. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {
  public static final String REQUEST_ID_ATTR = "requestId";
  public static final String REQUEST_ID_HEADER = "X-Request-Id";

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String requestId = request.getHeader(REQUEST_ID_HEADER);
    if (requestId == null || requestId.isBlank()) {
      requestId = UUID.randomUUID().toString();
    }
    request.setAttribute(REQUEST_ID_ATTR, requestId);
    MDC.put("requestId", requestId);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    try {
      chain.doFilter(request, response);
    } finally {
      MDC.remove("requestId");
    }
  }

  public static String resolve(HttpServletRequest request) {
    Object v = request == null ? null : request.getAttribute(REQUEST_ID_ATTR);
    return v == null ? UUID.randomUUID().toString() : v.toString();
  }
}
