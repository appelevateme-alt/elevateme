package com.elevateme.identity;

import com.elevateme.common.api.ApiError;
import com.elevateme.common.api.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Identity photo flow (signed-URL init + complete). Self profile read/update lives in
 * {@link MeController} — this controller intentionally exposes no /me GET/PATCH/summary
 * mappings so the PATCH allowlist + 403 guard cannot be bypassed by a duplicate route.
 *
 * <p>Phase 1b private photo flow (no mock, private bucket only):
 * <ul>
 *   <li>POST /me/photo-upload {contentType, contentLength} — allowlist
 *       image/jpeg,image/png,image/webp + 5MB cap (422), own account only via AuthContext,
 *       private path {@code profiles/{profileId}/{uuid}.{ext}}, 60s signed upload URL
 *       minted server-side with the service key (never exposed, never logged).</li>
 *   <li>POST /me/photo-upload/complete {path} — ownership check (403 for other-user paths),
 *       HEAD to confirm existence + MIME/size, magic-byte validation (JPEG FF D8, PNG 89 50,
 *       WebP RIFF....WEBP), SVG/script explicitly rejected (422), persists the private key
 *       (photo_key canonical, avatar_url mirror), returns 300s signed read URL.</li>
 * </ul>
 * GET /me (MeController) returns the private {@code photoKey}, never a permanent public URL;
 * the only URLs ever issued are short-lived signed ones.
 */
@RestController
@RequestMapping("/api/v1")
public class IdentityController {

  private final PhotoService photos;

  public IdentityController(PhotoService photos) {
    this.photos = photos;
  }

  @PostMapping("/me/photo-upload")
  public ResponseEntity<?> initPhotoUpload(
      @RequestBody ProfileDtos.PhotoUploadInitRequest body, HttpServletRequest req) {
    if (body == null || body.contentType() == null || body.contentLength() == null) {
      String requestId = RequestIdFilter.resolve(req);
      return ResponseEntity.unprocessableEntity()
          .body(
              new ApiError(
                  "VALIDATION_FAILED",
                  "contentType and contentLength are required",
                  List.of(new ApiError.FieldViolation("contentType", "contentType is required")),
                  requestId));
    }
    PhotoService.InitUpload init = photos.initUpload(body.contentType(), body.contentLength());
    return ResponseEntity.ok(
        new ProfileDtos.PhotoUploadInitResponse(init.uploadUrl(), init.path(), init.expiresIn()));
  }

  @PostMapping("/me/photo-upload/complete")
  public ResponseEntity<?> completePhotoUpload(
      @Valid @RequestBody ProfileDtos.PhotoUploadCompleteRequest body, HttpServletRequest req) {
    String photoUrl = photos.completeUpload(body == null ? null : body.path());
    return ResponseEntity.ok(new ProfileDtos.PhotoUploadCompleteResponse(photoUrl));
  }
}
