import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { post } from '../../lib/api';
import {
  PHOTO_MAX_BYTES,
  validatePhotoFile,
  type PhotoUploadCompleteResponse,
  type PhotoUploadInitResponse,
} from '../../lib/photo';
import { STUDENT_HOME_QUERY_KEYS } from './types';

export { PHOTO_MAX_BYTES, validatePhotoFile };

/**
 * Phase 1b private photo upload hook.
 * Flow: POST /me/photo-upload {contentType, contentLength} -> PUT uploadUrl (raw bytes)
 * -> POST /me/photo-upload/complete {path} -> invalidate ['me'] + student-home on success.
 * Signed URLs only; the private storage path never leaves the API payload.
 */
export function useStudentPhotoUpload() {
  const qc = useQueryClient();

  const upload = useCallback(
    async (file: File): Promise<string> => {
      const check = validatePhotoFile({ mime: file.type, sizeBytes: file.size });
      if (!check.ok) {
        const err = new Error(check.error) as Error & { status?: number };
        err.status = 422;
        throw err;
      }
      const init = await post<PhotoUploadInitResponse>('/me/photo-upload', {
        contentType: file.type,
        contentLength: file.size,
      });
      const put = await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) {
        const err = new Error('Upload failed. Please retry.') as Error & { status?: number };
        err.status = put.status;
        throw err;
      }
      const done = await post<PhotoUploadCompleteResponse>('/me/photo-upload/complete', {
        path: init.path,
      });
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.me });
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.summary });
      return done.photoUrl;
    },
    [qc],
  );

  return { upload };
}
