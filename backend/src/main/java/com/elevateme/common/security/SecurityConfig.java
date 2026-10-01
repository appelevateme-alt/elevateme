package com.elevateme.common.security;

import com.elevateme.common.api.RequestIdFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless JWT security.
 *
 * <ul>
 *   <li>CSRF disabled for {@code /api} (same-origin SPA + Bearer tokens, no cookie session).</li>
 *   <li>CORS origins from {@code ${ALLOWED_ORIGINS}} (comma-separated).</li>
 *   <li>Public: {@code /api/health} (+ actuator) and POST to the guest exchange path.</li>
 *   <li>Everything else under {@code /api/**} requires authentication; anything else denied.</li>
 *   <li>Render proxy: forwarded headers handled via
 *       {@code server.forward-headers-strategy=framework} in application.yml
 *       (honours {@code X-Forwarded-Proto/For}) so generated URLs/scheme stay correct.</li>
 *   <li>Auth failures return canonical JSON: 401 {@code UNAUTHENTICATED}, 403 {@code FORBIDDEN}.</li>
 * </ul>
 */
@Configuration
public class SecurityConfig {

  private final SupabaseJwtAuthenticationFilter jwtFilter;
  private final GuestCookieAuthenticationFilter guestFilter;
  private final String allowedOrigins;
  private final ObjectMapper mapper = new ObjectMapper();

  public SecurityConfig(
      SupabaseJwtAuthenticationFilter jwtFilter,
      GuestCookieAuthenticationFilter guestFilter,
      @Value("${ALLOWED_ORIGINS:${app.cors.allowed-origins:http://localhost:5173}}")
          String allowedOrigins) {
    this.jwtFilter = jwtFilter;
    this.guestFilter = guestFilter;
    this.allowedOrigins = allowedOrigins;
  }

  @Bean
  SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.csrf(AbstractHttpConfigurer::disable)
        .cors(c -> c.configurationSource(corsSource()))
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (req, res, ex) -> writeJson(res, 401, "UNAUTHENTICATED", "Authentication required", req))
                    .accessDeniedHandler(
                        (req, res, ex) -> writeJson(res, 403, "FORBIDDEN", "Forbidden", req)))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers("/api/health", "/api/v1/health", "/actuator/health")
                    .permitAll()
                    // Guest fragment->cookie exchange is public (rate-limited at the controller).
                    .requestMatchers(HttpMethod.POST, "/api/v1/guest/exchange", "/api/guest/exchange")
                    .permitAll()
                    .requestMatchers(HttpMethod.OPTIONS, "/api/**")
                    .permitAll()
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .denyAll())
        .addFilterBefore(guestFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
  }

  private void writeJson(
      jakarta.servlet.http.HttpServletResponse res,
      int status,
      String code,
      String message,
      jakarta.servlet.http.HttpServletRequest req) {
    try {
      res.setStatus(status);
      res.setContentType(MediaType.APPLICATION_JSON_VALUE);
      mapper.writeValue(
          res.getOutputStream(),
          Map.of("code", code, "message", message, "requestId", RequestIdFilter.resolve(req)));
    } catch (Exception ignored) {
      // Response already committed; nothing further to do.
    }
  }

  @Bean
  CorsConfigurationSource corsSource() {
    List<String> origins =
        Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(s -> !s.isEmpty())
            .collect(Collectors.toList());
    if (origins.isEmpty()) {
      origins = List.of("http://localhost:5173");
    }
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(origins);
    cfg.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
    cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"));
    cfg.setExposedHeaders(List.of("X-Request-Id"));
    cfg.setAllowCredentials(false);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", cfg);
    return source;
  }
}
