package com.elevateme.identity;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Phase 1b: pure validation for the private photo flow.
 *
 * <p>Rules (server-side, never trust client):
 * <ul>
 *   <li>Allowlist MIME: image/jpeg, image/png, image/webp only.</li>
 *   <li>SVG ({@code image/svg+xml}) and any script/active content explicitly rejected (422).</li>
 *   <li>Size cap: 5 MiB (5 * 1024 * 1024 bytes).</li>
 *   <li>Private path must be {@code profiles/{profileId}/{uuid}.{ext}} and belong to caller.</li>
 *   <li>Magic bytes: JPEG FF D8, PNG 89 50 4E 47, WebP RIFF....WEBP.</li>
 * </ul>
 */
public final class PhotoValidation {

  public static final Set<String> ALLOWED_MIMES =
      Set.of("image/jpeg", "image/png", "image/webp");

  public static final long MAX_BYTES = 5L * 1024L * 1024L;

  private static final Pattern PATH_PATTERN =
      Pattern.compile("^profiles/[A-Za-z0-9\\-]{1,64}/[A-Za-z0-9\\-]{1,64}\\.(jpg|jpeg|png|webp)$");

  private static final Set<String> BLOCKED_EXTENSIONS =
      Set.of("svg", "svgz", "html", "htm", "js", "xhtml", "xml");

  private PhotoValidation() {}

  /** Validates init-upload request. Throws {@link PhotoValidationException} (mapped to 422). */
  public static void validateUploadRequest(String contentType, Long contentLength) {
    if (contentType == null || contentType.isBlank()) {
      throw new PhotoValidationException("contentType is required", "contentType");
    }
    String normalized = contentType.trim().toLowerCase(Locale.ROOT).split(";")[0].trim();
    if (normalized.equals("image/svg+xml")
        || normalized.equals("image/svg")
        || normalized.contains("svg")
        || normalized.contains("javascript")
        || normalized.contains("ecmascript")
        || normalized.startsWith("text/html")
        || normalized.startsWith("application/")) {
      throw new PhotoValidationException(
          "SVG/script uploads are not allowed. Use image/jpeg, image/png or image/webp.",
          "contentType");
    }
    if (!ALLOWED_MIMES.contains(normalized)) {
      throw new PhotoValidationException(
          "Unsupported media type. Allowed: image/jpeg, image/png, image/webp.", "contentType");
    }
    if (contentLength == null) {
      throw new PhotoValidationException("contentLength is required", "contentLength");
    }
    if (contentLength <= 0) {
      throw new PhotoValidationException("contentLength must be positive", "contentLength");
    }
    if (contentLength > MAX_BYTES) {
      throw new PhotoValidationException(
          "File too large. Maximum is 5MB.", "contentLength");
    }
  }

  /** Returns file extension for an allowed MIME (no dot). Throws 422 otherwise. */
  public static String extensionFor(String contentType) {
    String normalized = contentType.trim().toLowerCase(Locale.ROOT).split(";")[0].trim();
    return switch (normalized) {
      case "image/jpeg" -> "jpg";
      case "image/png" -> "png";
      case "image/webp" -> "webp";
      default -> throw new PhotoValidationException(
          "Unsupported media type. Allowed: image/jpeg, image/png, image/webp.", "contentType");
    };
  }

  /** Builds a private object path. Caller profileId only — never client-supplied. */
  public static String buildPrivatePath(String profileId, String contentType) {
    if (profileId == null || profileId.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    String ext = extensionFor(contentType);
    return "profiles/" + profileId + "/" + UUID.randomUUID() + "." + ext;
  }

  /**
   * Verifies path belongs to caller. Throws {@link PhotoForbiddenException} (403) when the path
   * targets another profile; throws {@link PhotoValidationException} (422) when malformed or
   * blocked (SVG/script extensions, traversal).
   */
  public static void validatePathOwnership(String path, String profileId) {
    if (path == null || path.isBlank()) {
      throw new PhotoValidationException("path is required", "path");
    }
    if (profileId == null || profileId.isBlank()) {
      throw new IllegalStateException("Unauthenticated");
    }
    String p = path.trim();
    if (p.contains("..") || p.contains("\\") || p.startsWith("/") || p.contains("//")) {
      throw new PhotoValidationException("Invalid path", "path");
    }
    String expectedPrefix = "profiles/" + profileId + "/";
    if (!p.startsWith(expectedPrefix)) {
      // Path targets another profile (or is outside the private namespace) -> 403.
      // Distinguish malformed private paths (422) from cross-account access (403):
      // anything under profiles/<other-id>/ is a forbidden cross-account path.
      if (p.startsWith("profiles/")) {
        throw new PhotoForbiddenException("Not your photo path");
      }
      throw new PhotoValidationException("Invalid path", "path");
    }
    String ext = extensionOf(p);
    if (BLOCKED_EXTENSIONS.contains(ext)) {
      throw new PhotoValidationException(
          "SVG/script uploads are not allowed. Use image/jpeg, image/png or image/webp.", "path");
    }
    if (!PATH_PATTERN.matcher(p).matches()) {
      throw new PhotoValidationException("Invalid path", "path");
    }
  }

  /** Validates object HEAD metadata (MIME + size). 422 on mismatch. */
  public static void validateHeadMetadata(String contentType, long sizeBytes) {
    validateUploadRequest(contentType, sizeBytes);
  }

  /**
   * Validates image magic bytes for the declared MIME. {@code head} must contain at least the
   * first 12 bytes of the object.
   */
  public static void validateMagicBytes(byte[] head, String contentType) {
    if (head == null || head.length < 4) {
      throw new PhotoValidationException("Unrecognized image data", "path");
    }
    String normalized =
        contentType == null
            ? ""
            : contentType.trim().toLowerCase(Locale.ROOT).split(";")[0].trim();
    // Explicit script/SVG sniffing: reject XML/SVG/script payloads even if MIME was spoofed.
    if (startsWithAscii(head, "<svg")
        || startsWithAscii(head, "<?xml")
        || startsWithAscii(head, "<htm")
        || startsWithAscii(head, "<scr")
        || startsWithAscii(head, "#!/")) {
      throw new PhotoValidationException(
          "SVG/script uploads are not allowed. Use image/jpeg, image/png or image/webp.", "path");
    }
    boolean ok;
    switch (normalized) {
      case "image/jpeg" -> ok = (head[0] == (byte) 0xFF && head[1] == (byte) 0xD8);
      case "image/png" -> ok =
          head.length >= 4
              && head[0] == (byte) 0x89
              && head[1] == (byte) 0x50
              && head[2] == (byte) 0x4E
              && head[3] == (byte) 0x47;
      case "image/webp" -> ok =
          head.length >= 12
              && head[0] == 'R'
              && head[1] == 'I'
              && head[2] == 'F'
              && head[3] == 'F'
              && head[8] == 'W'
              && head[9] == 'E'
              && head[10] == 'B'
              && head[11] == 'P';
      default -> throw new PhotoValidationException(
          "Unsupported media type. Allowed: image/jpeg, image/png, image/webp.", "contentType");
    }
    if (!ok) {
      throw new PhotoValidationException(
          "File content does not match declared image type", "path");
    }
  }

  private static String extensionOf(String path) {
    int dot = path.lastIndexOf('.');
    if (dot < 0 || dot == path.length() - 1) {
      return "";
    }
    return path.substring(dot + 1).toLowerCase(Locale.ROOT);
  }

  private static boolean startsWithAscii(byte[] head, String prefix) {
    byte[] pb = prefix.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    if (head.length < pb.length) {
      return false;
    }
    for (int i = 0; i < pb.length; i++) {
      if (Character.toLowerCase((char) head[i]) != Character.toLowerCase((char) pb[i])) {
        return false;
      }
    }
    return true;
  }
}
