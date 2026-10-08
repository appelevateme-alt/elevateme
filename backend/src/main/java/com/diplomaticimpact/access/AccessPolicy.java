package com.diplomaticimpact.access;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class AccessPolicy {
  private AccessPolicy() {}
  public static final List<String> CRITERIA = List.of("preparation","clarity","confidence","focus",
      "critical-analysis","vocal-delivery","audience","counter","wit","overall");
  public static String token() {
    byte[] b = new byte[32]; new SecureRandom().nextBytes(b);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
  }
  public static String hash(String value) {
    if (value == null || !value.matches("[A-Za-z0-9_-]{43}")) throw error(401,"Access expired or unavailable. Ask DI for a replacement link.");
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
    catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  public static void scores(Map<String,Integer> scores, boolean complete) {
    if (scores == null || !CRITERIA.containsAll(scores.keySet()) ||
        (complete && !scores.keySet().equals(new HashSet<>(CRITERIA))) ||
        scores.values().stream().anyMatch(v -> v == null || v < 0 || v > 100))
      throw error(422,"Enter a whole-number score from 0 to 100 for each required criterion.");
  }
  public static ResponseStatusException error(int code,String message) { return new ResponseStatusException(HttpStatus.valueOf(code),message); }
  public static UUID id() { return UUID.randomUUID(); }
}
