package com.diplomaticimpact.access;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class AccessSecurity {
  @Bean SecurityFilterChain accessChain(HttpSecurity http) throws Exception {
    // Authentication is explicit at each controller boundary; guest and admin credentials never mix.
    return http.csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(a->a.requestMatchers("/api/evaluation-access/**","/actuator/health").permitAll().anyRequest().denyAll()).build();
  }
}

@Component
class AccessIdentity {
  private final RestClient auth; private final AccessRepository repo;
  AccessIdentity(AccessRepository repo,@Value("${access.supabase-url}") String url,@Value("${access.publishable-key}") String key) {
    this.repo=repo;
    var factory=new SimpleClientHttpRequestFactory(); factory.setConnectTimeout(Duration.ofSeconds(5)); factory.setReadTimeout(Duration.ofSeconds(5));
    this.auth=RestClient.builder().baseUrl(url).requestFactory(factory).defaultHeader("apikey",key).build();
  }
  UUID user(HttpServletRequest req) {
    String header=req.getHeader("Authorization");
    if(header==null || !header.startsWith("Bearer ") || header.length()>8192) throw AccessPolicy.error(401,"Sign in to continue.");
    UUID id;
    try {
      Map<?,?> user=auth.get().uri("/auth/v1/user").header("Authorization",header).retrieve().body(Map.class);
      id=UUID.fromString(String.valueOf(user.get("id")));
    } catch(Exception e) { throw AccessPolicy.error(401,"Your session could not be verified. Sign in again."); }
    if(!repo.activeUser(id)) throw AccessPolicy.error(403,"This account is not active.");
    return id;
  }
  UUID admin(HttpServletRequest req) {
    UUID id=user(req); if(!repo.admin(id)) throw AccessPolicy.error(403,"DI administrator access required."); return id;
  }
}

@Component
class AccessOriginFilter extends OncePerRequestFilter {
  private final String origin;
  AccessOriginFilter(@Value("${access.public-url}") String url) { origin=URI.create(url).getScheme()+"://"+URI.create(url).getRawAuthority(); }
  @Override protected boolean shouldNotFilter(HttpServletRequest r) { return !r.getRequestURI().startsWith("/api/evaluation-access/"); }
  @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain) throws ServletException,IOException {
    s.setHeader("Cache-Control","no-store, private"); s.setHeader("Referrer-Policy","no-referrer"); s.setHeader("Vary","Authorization, Cookie");
    if(!Set.of("GET","HEAD","OPTIONS").contains(r.getMethod()) &&
       (!origin.equals(r.getHeader("Origin")) || !"1".equals(r.getHeader("X-ElevateMe-Request")))) {
      s.setStatus(403); s.setContentType("application/json"); s.getWriter().write("{\"message\":\"Request origin rejected.\"}"); return;
    }
    chain.doFilter(r,s);
  }
}
