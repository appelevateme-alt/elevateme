import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, post } from '../lib/api';
import {
  photoErrorForStatus,
  validatePhotoFile,
  type PhotoUploadCompleteResponse,
  type PhotoUploadInitResponse,
  type PhotoUploadState,
} from '../lib/photo';
import { STUDENT_HOME_QUERY_KEYS } from '../features/student-home/types';
import styles from './AvatarEditor.module.css';

interface AvatarEditorProps {
  name: string;
  photoUrl?: string;
  onUploaded?: (photoUrl: string) => void;
}

/**
 * Phase 1b: real private photo flow (no mock).
 * accept=image/jpeg,image/png,image/webp; client 5MB check + object-URL preview;
 * square preview + Replace; POST /me/photo-upload -> PUT uploadUrl -> POST /complete.
 * Retry preserves the selected file. 422 surfaces as an inline field error.
 */
export function AvatarEditor({ name, photoUrl, onUploaded }: AvatarEditorProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(photoUrl ?? '');
  const [status, setStatus] = useState<PhotoUploadState>('Idle');
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs on replace/unmount (preview is local-only, never persisted).
  const previewRef = useRef<string>('');
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);
  useEffect(() => {
    return () => {
      if (previewRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  // Sync server photoUrl when it changes and no local selection is active.
  useEffect(() => {
    if (!file) setPreview(photoUrl ?? '');
  }, [photoUrl, file]);

  function pickFile() {
    inputRef.current?.click();
  }

  function setLocalPreview(next: File) {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(next));
  }

  async function runUpload(next: File) {
    setStatus('Uploading');
    setError(null);
    try {
      const init = await post<PhotoUploadInitResponse>('/me/photo-upload', {
        contentType: next.type,
        contentLength: next.size,
      });
      const put = await fetch(init.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': next.type },
        body: next,
      });
      if (!put.ok) throw new ApiError(put.status, { code: 'UPLOAD_FAILED', message: 'Upload failed. Please retry.' });
      setStatus('Saving');
      const done = await post<PhotoUploadCompleteResponse>('/me/photo-upload/complete', {
        path: init.path,
      });
      setStatus('Saved');
      setPreview(done.photoUrl);
      setFile(null);
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.me });
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.summary });
      onUploaded?.(done.photoUrl);
    } catch (e) {
      setStatus('Error');
      if (e instanceof ApiError) {
        const field = e.fieldErrors[0]?.message;
        setError(photoErrorForStatus(e.status, field ?? e.message));
      } else {
        setError(photoErrorForStatus(undefined, (e as Error).message));
      }
    }
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    // Reset the input so the same file can be picked again after Replace.
    e.target.value = '';
    if (!next) return;
    const check = validatePhotoFile({ mime: next.type, sizeBytes: next.size });
    if (!check.ok) {
      setFile(null);
      setStatus('Error');
      setError(check.error ?? 'Invalid photo.');
      return;
    }
    setFile(next);
    setLocalPreview(next);
    void runUpload(next);
  }

  function onRetry() {
    if (file) void runUpload(file);
    else pickFile();
  }

  function onReplace() {
    pickFile();
  }

  const initials = name.slice(0, 2).toUpperCase();
  const statusLabel =
    status === 'Uploading' ? 'Uploading…' : status === 'Saving' ? 'Saving…' : status === 'Saved' ? 'Saved' : status === 'Error' ? 'Error' : 'Idle';

  return (
    <div className={styles.wrap} data-testid="avatar-editor">
      <div className={styles.previewBox} aria-label={`${name} photo preview`}>
        {preview ? (
          <img src={preview} alt={`${name} photo`} className={styles.img} loading="lazy" decoding="async" />
        ) : (
          <div className={styles.fallback} aria-label={`${name} initials`}>
            {initials}
          </div>
        )}
      </div>
      <div className={styles.controls}>
        <div className={styles.row}>
          <button type="button" className={styles.replaceBtn} onClick={onReplace} disabled={status === 'Uploading' || status === 'Saving'}>
            Replace
          </button>
          <span className={styles.status} data-testid="avatar-status" aria-live="polite">
            {statusLabel}
          </span>
        </div>
        <label className={styles.label} htmlFor="avatar-file">
          JPG, PNG or WebP up to 5MB
        </label>
        <input
          ref={inputRef}
          id="avatar-file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload photo"
          className={styles.fileInput}
          onChange={onSelect}
        />
        {error ? (
          <p className={styles.error} role="alert" data-testid="avatar-error">
            {error}{' '}
            {status === 'Error' && file ? (
              <button type="button" className={styles.retryBtn} onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </p>
        ) : null}
        {status === 'Saved' ? (
          <p className={styles.saved} data-testid="avatar-saved" aria-live="polite">
            Photo saved.
          </p>
        ) : null}
      </div>
    </div>
  );
}
