package com.elevateme.participation;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Guest token crypto: &gt;=256-bit random tokens, SHA-256 hex storage (hash-only, never raw).
 *
 * <p>Invite tokens and session tokens are both 32 random bytes (256 bits), Base64URL-encoded
 * without padding. Only {@code sha256Hex(raw)} ever reaches the database; the raw value appears
 * once in the one-time inviteUrl fragment ({@code #t=...}) and once as the HttpOnly cookie value.
 */
public final class GuestTokenUtil {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final int TOKEN_BYTES = 32; // 256 bits

  private GuestTokenUtil() {}

  /** 256-bit random token, Base64URL no-padding (43 chars). */
  public static String generateRawToken() {
    byte[] buf = new byte[TOKEN_BYTES];
    RANDOM.nextBytes(buf);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
  }

  /** SHA-256 hex of the raw token (what is stored + indexed). */
  public static String sha256Hex(String raw) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception e) {
      throw new IllegalStateException("SHA-256 unavailable", e);
    }
  }

  /** Constant-time hash comparison (hex strings). */
  public static boolean hashesEqual(String a, String b) {
    if (a == null || b == null) {
      return false;
    }
    return MessageDigest.isEqual(
        a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
  }
}
