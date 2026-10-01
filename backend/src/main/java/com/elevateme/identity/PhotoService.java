package com.elevateme.identity;

import com.elevateme.common.security.AuthContext;
import org.springframework.stereotype.Service;

/**
 * Phase 1b private photo flow.
 *
 * <p>Own-account only: every method derives the caller from the verified {@link AuthContext}
 * subject and loads the profile via {@link ProfileRepository#findBySupabaseSubject} (never a
 * client-supplied user id). The private object path is {@code profiles/{profileId}/{uuid}.{ext}}.
 *
 * <p>Storage mapping: {@code photo_key} is the canonical private-path column (V1 Phase 1b patch +
 * V5); {@code avatar_url} is retained as a mirror for backward compat (see {@link Profile}).
 * Reads never return a permanent public URL — only short-lived signed URLs (upload 60s, read
 * 300s) minted server-side with the service key.
 */
@Service
public class PhotoService {

  public static final long UPLOAD_EXPIRES_IN = 60L;
  public static final int READ_EXPIRES_IN = 300;

  private final AuthContext auth;
  private final ProfileRepository profiles;
  private final SupabaseStorageClient storage;

  public PhotoService(
      AuthContext auth, ProfileRepository profiles, SupabaseStorageClient storage) {
    this.auth = auth;
    this.profiles = profiles;
    this.storage = storage;
  }

  public record InitUpload(String profileId, String path, String uploadUrl, long expiresIn) {}

  /**
   * Validates MIME/size (422), generates {@code profiles/{profileId}/{uuid}.{ext}} and mints a
   * 60s signed upload URL via the service key (server-side only).
   */
  public InitUpload initUpload(String contentType, Long contentLength) {
    String subject = auth.currentSubject();
    PhotoValidation.validateUploadRequest(contentType, contentLength);
    Profile profile =
        profiles
            .findBySupabaseSubject(subject)
            .orElseThrow(() -> new PhotoNotFoundException("Profile not found"));
    String path = PhotoValidation.buildPrivatePath(profile.id(), contentType);
    String uploadUrl = storage.createSignedUploadUrl(path, contentType);
    return new InitUpload(profile.id(), path, uploadUrl, UPLOAD_EXPIRES_IN);
  }

  /**
   * Verifies path ownership (403 for other-user paths), HEADs the object, validates MIME/size +
   * magic bytes (422), persists the private key, and returns a 300s signed read URL.
   *
   * <p>TODO(image-pipeline): strip EXIF + re-encode to the declared MIME on complete
   * (e.g. Thumbnailator/imgscalr worker, strip all metadata segments APPn/EXIF, re-encode
   * JPEG/PNG/WebP at bounded dimensions) before serving. Until then we validate magic bytes
   * + allowlist MIME/size and serve short-lived signed URLs only (never public).
   */
  public String completeUpload(String path) {
    String subject = auth.currentSubject();
    Profile profile =
        profiles
            .findBySupabaseSubject(subject)
            .orElseThrow(() -> new PhotoNotFoundException("Profile not found"));
    PhotoValidation.validatePathOwnership(path, profile.id());

    SupabaseStorageClient.HeadResult head = storage.headObject(path);
    if (!head.exists()) {
      throw new PhotoValidationException("Upload not found. Please retry.", "path");
    }
    // Declared HEAD MIME/size must still satisfy the allowlist + 5MB cap.
    PhotoValidation.validateHeadMetadata(head.contentType(), head.sizeBytes());

    byte[] magic = storage.fetchHeadBytes(path, 16);
    PhotoValidation.validateMagicBytes(magic, head.contentType());

    // TODO(image-pipeline): EXIF-strip + re-encode here (server-side, before persist).
    profiles.updateSelf(subject, null, path, null);
    return storage.createSignedReadUrl(path, READ_EXPIRES_IN);
  }

  /** Short-lived signed read URL (300s) for the caller's own photo, or null when unset. */
  public String signedPhotoUrlForCaller() {
    String subject = auth.currentSubject();
    Profile profile =
        profiles
            .findBySupabaseSubject(subject)
            .orElseThrow(() -> new PhotoNotFoundException("Profile not found"));
    String key = profile.photoKey();
    if (key == null || key.isBlank()) {
      return null;
    }
    return storage.createSignedReadUrl(key, READ_EXPIRES_IN);
  }
}
