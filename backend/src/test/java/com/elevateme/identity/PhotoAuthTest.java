package com.elevateme.identity;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

/**
 * Phase 1b: private photo flow auth + validation.
 *
 * <p>Covers: other-user path =&gt; 403, SVG =&gt; 422, &gt;5MB =&gt; 422.
 * Pure unit tests over {@link PhotoValidation} (no network, no DB).
 */
class PhotoAuthTest {

  private static final String ALICE = "11111111-1111-1111-1111-111111111111";
  private static final String BOB = "22222222-2222-2222-2222-222222222222";

  @Test
  void otherUserPath_is403() {
    String bobPath = "profiles/" + BOB + "/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg";
    assertThrows(PhotoForbiddenException.class, () -> PhotoValidation.validatePathOwnership(bobPath, ALICE));
  }

  @Test
  void ownPath_isAllowed() {
    String own = "profiles/" + ALICE + "/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jpg";
    assertDoesNotThrow(() -> PhotoValidation.validatePathOwnership(own, ALICE));
  }

  @Test
  void svgContentType_is422() {
    assertThrows(
        PhotoValidationException.class,
        () -> PhotoValidation.validateUploadRequest("image/svg+xml", 1024L));
  }

  @Test
  void svgPath_is422() {
    String svgPath = "profiles/" + ALICE + "/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.svg";
    assertThrows(
        PhotoValidationException.class, () -> PhotoValidation.validatePathOwnership(svgPath, ALICE));
  }

  @Test
  void scriptContentType_is422() {
    assertThrows(
        PhotoValidationException.class,
        () -> PhotoValidation.validateUploadRequest("text/html", 1024L));
    assertThrows(
        PhotoValidationException.class,
        () -> PhotoValidation.validateUploadRequest("application/javascript", 100L));
  }

  @Test
  void over5mb_is422() {
    long over = 5L * 1024L * 1024L + 1;
    assertThrows(
        PhotoValidationException.class,
        () -> PhotoValidation.validateUploadRequest("image/jpeg", over));
  }

  @Test
  void exactly5mb_isAllowed() {
    long exactly = 5L * 1024L * 1024L;
    assertDoesNotThrow(() -> PhotoValidation.validateUploadRequest("image/jpeg", exactly));
  }

  @Test
  void allowedMimes_pass() {
    assertDoesNotThrow(() -> PhotoValidation.validateUploadRequest("image/jpeg", 100L));
    assertDoesNotThrow(() -> PhotoValidation.validateUploadRequest("image/png", 100L));
    assertDoesNotThrow(() -> PhotoValidation.validateUploadRequest("image/webp", 100L));
  }

  @Test
  void magicBytes_mismatchIs422() {
    // PNG bytes declared as JPEG -> 422.
    byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    assertThrows(
        PhotoValidationException.class, () -> PhotoValidation.validateMagicBytes(png, "image/jpeg"));
  }

  @Test
  void magicBytes_matchPass() {
    byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0, 0, 0, 0, 0, 0, 0};
    assertDoesNotThrow(() -> PhotoValidation.validateMagicBytes(jpeg, "image/jpeg"));
    byte[] png = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    assertDoesNotThrow(() -> PhotoValidation.validateMagicBytes(png, "image/png"));
    byte[] webp = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
    assertDoesNotThrow(() -> PhotoValidation.validateMagicBytes(webp, "image/webp"));
  }

  @Test
  void svgMagicBytes_is422() {
    byte[] svg = "<svg xmlns".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    assertThrows(
        PhotoValidationException.class, () -> PhotoValidation.validateMagicBytes(svg, "image/png"));
  }

  @Test
  void privatePathFormat_isScoped() {
    String path = PhotoValidation.buildPrivatePath(ALICE, "image/jpeg");
    assertTrue(path.startsWith("profiles/" + ALICE + "/"));
    assertTrue(path.endsWith(".jpg"));
    assertDoesNotThrow(() -> PhotoValidation.validatePathOwnership(path, ALICE));
    assertThrows(PhotoForbiddenException.class, () -> PhotoValidation.validatePathOwnership(path, BOB));
  }
}
