// Phase 1b: private photo flow client validators (pure, unit-tested).
// Server re-validates everything (MIME allowlist, 5MB cap, magic bytes, ownership).

export const PHOTO_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoAllowedMime = (typeof PHOTO_ALLOWED_MIMES)[number];

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export interface PhotoFileInput {
  mime: string;
  sizeBytes: number;
}

export interface PhotoValidationResult {
  ok: boolean;
  error?: string;
}

/** Client-side MIME/size check. 422-shaped inline errors; server is authoritative. */
export function validatePhotoFile(input: PhotoFileInput): PhotoValidationResult {
  const mime = (input.mime ?? '').trim().toLowerCase().split(';')[0].trim();
  if (mime === 'image/svg+xml' || mime === 'image/svg' || mime.includes('svg')) {
    return { ok: false, error: 'SVG images are not allowed. Use JPG, PNG or WebP.' };
  }
  if (
    mime === 'text/html' ||
    mime.includes('javascript') ||
    mime.includes('ecmascript') ||
    mime.startsWith('application/')
  ) {
    return { ok: false, error: 'That file type is not allowed. Use JPG, PNG or WebP.' };
  }
  if (!(PHOTO_ALLOWED_MIMES as readonly string[]).includes(mime)) {
    return { ok: false, error: 'Unsupported format. Use JPG, PNG or WebP.' };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'File is empty.' };
  }
  if (input.sizeBytes > PHOTO_MAX_BYTES) {
    return { ok: false, error: 'File too large. Maximum is 5MB.' };
  }
  return { ok: true };
}

export function isPhotoMime(mime: string): mime is PhotoAllowedMime {
  const m = mime.trim().toLowerCase().split(';')[0].trim();
  return (PHOTO_ALLOWED_MIMES as readonly string[]).includes(m);
}

/** Maps API failures to inline UI copy. 422 -> field error, 403 -> ownership, else generic. */
export function photoErrorForStatus(status?: number, message?: string): string {
  if (status === 422) return message || 'Invalid photo. Use JPG, PNG or WebP up to 5MB.';
  if (status === 403) return 'Not your photo path. Please retry the upload.';
  if (status === 401) return 'Please sign in again to upload a photo.';
  if (status === 413) return 'File too large. Maximum is 5MB.';
  return message || 'Upload failed. Please retry.';
}

export interface PhotoUploadInitResponse {
  uploadUrl: string;
  path: string;
  expiresIn: number;
}

export interface PhotoUploadCompleteResponse {
  photoUrl: string;
}

export type PhotoUploadState = 'Idle' | 'Uploading' | 'Saving' | 'Saved' | 'Error';
