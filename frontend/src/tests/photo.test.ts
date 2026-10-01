import { describe, expect, it } from 'vitest';
import {
  PHOTO_ALLOWED_MIMES,
  PHOTO_MAX_BYTES,
  photoErrorForStatus,
  validatePhotoFile,
} from '../lib/photo';

describe('photo validators (Phase 1b)', () => {
  it('allowlist is exactly jpeg/png/webp', () => {
    expect([...PHOTO_ALLOWED_MIMES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('cap is 5MB', () => {
    expect(PHOTO_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('accepts jpeg/png/webp under cap', () => {
    expect(validatePhotoFile({ mime: 'image/jpeg', sizeBytes: 1024 }).ok).toBe(true);
    expect(validatePhotoFile({ mime: 'image/png', sizeBytes: PHOTO_MAX_BYTES }).ok).toBe(true);
    expect(validatePhotoFile({ mime: 'image/webp', sizeBytes: 10 }).ok).toBe(true);
  });

  it('rejects SVG explicitly', () => {
    const r = validatePhotoFile({ mime: 'image/svg+xml', sizeBytes: 1024 });
    expect(r.ok).toBe(false);
    expect(r.error ?? '').toMatch(/SVG/i);
  });

  it('rejects script/html types', () => {
    expect(validatePhotoFile({ mime: 'text/html', sizeBytes: 100 }).ok).toBe(false);
    expect(validatePhotoFile({ mime: 'application/javascript', sizeBytes: 100 }).ok).toBe(false);
  });

  it('rejects unknown MIME', () => {
    const r = validatePhotoFile({ mime: 'image/gif', sizeBytes: 100 });
    expect(r.ok).toBe(false);
  });

  it('rejects >5MB', () => {
    const r = validatePhotoFile({ mime: 'image/jpeg', sizeBytes: PHOTO_MAX_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect(r.error ?? '').toMatch(/5MB/);
  });

  it('rejects empty file', () => {
    expect(validatePhotoFile({ mime: 'image/jpeg', sizeBytes: 0 }).ok).toBe(false);
  });

  it('422 maps to inline field error copy', () => {
    expect(photoErrorForStatus(422, 'File too large.')).toBe('File too large.');
    expect(photoErrorForStatus(403)).toMatch(/Not your photo/);
    expect(photoErrorForStatus(401)).toMatch(/sign in/i);
  });
});
