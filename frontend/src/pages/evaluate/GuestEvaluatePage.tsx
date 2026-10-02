import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ScoreInputRow } from '../../components/ScoreInputRow';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { CRITERIA_10, CRITERIA_LABELS, validateScores } from '../../lib/scoring';
import {
  getGuestEvaluationByStudent,
  patchGuestDraft,
  submitGuestEvaluation,
} from '../../features/evaluation-sheet/api';
import { getGuestRosterScoped } from '../../features/guest-invite/api';
import {
  guestSaveLabel,
  resolveGuestNext,
  type GuestSaveKind,
} from '../../features/guest-invite/helpers';
import {
  isStaleAutosaveResult,
  normalizedOf,
  provisionalTotalOf,
} from '../../features/evaluation-sheet/helpers';
import type { EvaluationSheet } from '../../features/evaluation-sheet/types';
import styles from './GuestInvitePage.module.css';

/**
 * /evaluate/students/:studentId — guest editable sheet.
 * Flow: roster -> click student -> sheet (10 ScoreInputRows + remarks,
 * save/saving/saved/failed/submitted, autosave 1s, beforeunload guard,
 * 409 conflict UI, drafts survive refresh via server GET) -> submit
 * (lock confirm) -> Next student (waits for save; Stay/Retry, never discards).
 * Student + session are resolved from the invitation scope — the guest never
 * types DB/session IDs. No report release button (staff-only, 403).
 */
export function GuestEvaluatePage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<EvaluationSheet | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(CRITERIA_10.map((k) => [k, null])),
  );
  const [remarks, setRemarks] = useState('');
  const [version, setVersion] = useState(1);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverAverage, setServerAverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKind, setLoadKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<GuestSaveKind>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextStudentId, setNextStudentId] = useState<string | null>(null);
  const [nextDialog, setNextDialog] = useState<'none' | 'wait'>('none');

  const reqIdRef = useRef(0);
  const latestAppliedRef = useRef(0);
  const stateRef = useRef({ scores, remarks, version, dirty });
  stateRef.current = { scores, remarks, version, dirty };
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const locked = sheet != null && sheet.state !== 'DRAFT';
  const submitted = saveState === 'submitted' || sheet?.state === 'SUBMITTED';
  const plainStatus = sheet?.state === 'SUBMITTED' ? 'Submitted' : sheet?.state === 'LOCKED' ? 'Locked' : 'Draft';

  const provisional = useMemo(() => provisionalTotalOf(scores), [scores]);
  const normalized = useMemo(() => normalizedOf(scores), [scores]);
  const displayTotal = serverTotal ?? provisional;
  const displayAvg = serverAverage ?? normalized;

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setLoadError(null);
    setLoadKind(null);
    try {
      // Drafts survive refresh: authoritative state always comes from server GET.
      const s = await getGuestEvaluationByStudent(studentId);
      setSheet(s);
      setScores({ ...s.scores });
      setRemarks(s.notes ?? '');
      setVersion(s.version);
      setServerTotal(s.provisionalTotal ?? s.total);
      setServerAverage(s.average);
      setDirty(false);
      setSaveState(s.state === 'SUBMITTED' || s.state === 'LOCKED' ? 'submitted' : 'saved');
      setConflict(false);
      // Next student (roster order, scope-resolved — no IDs typed).
      try {
        const roster = await getGuestRosterScoped();
        const idx = roster.rows.findIndex(
          (r) => (r.studentId ?? r.id) === studentId,
        );
        if (idx >= 0 && idx + 1 < roster.rows.length) {
          const nxt = roster.rows[idx + 1];
          setNextStudentId((nxt.studentId ?? nxt.id) as string);
        } else {
          setNextStudentId(null);
        }
      } catch {
        setNextStudentId(null);
      }
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setLoadKind('forbidden');
      else if (kind === 'notfound') setLoadKind('not-found');
      if (e instanceof ApiError && (e.status === 404 || e.code === 'NOT_FOUND')) {
        setLoadKind('not-found');
        setLoadError('Not found — this student is outside your invitation scope.');
      } else {
        setLoadError(e instanceof ApiError ? e.message : 'Failed to load sheet.');
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Unsaved protection: block router navigation when dirty.
  const blocker = useBlocker(dirty && !locked && saveState !== 'submitted');
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const ok = window.confirm(
        'You have unsaved changes. Leave without saving? Draft autosaves every second — Stay to let it finish.',
      );
      if (ok) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !locked && saveState !== 'submitted') e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, locked, saveState]);

  const doSave = useCallback(async (): Promise<boolean> => {
    if (!sheet || locked) return true;
    const snap = stateRef.current;
    const myId = ++reqIdRef.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await patchGuestDraft(sheet.id, snap.scores, snap.remarks, snap.version);
      if (isStaleAutosaveResult(latestAppliedRef.current, myId)) return false;
      latestAppliedRef.current = myId;
      setVersion(res.version);
      setServerTotal(res.provisionalTotal);
      setServerAverage(res.provisionalTotal / 10);
      setSaveState('saved');
      if (reqIdRef.current === myId) setDirty(false);
      return true;
    } catch (e) {
      if (isStaleAutosaveResult(latestAppliedRef.current, myId)) return false;
      if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT' || e.code === 'CONFLICT')) {
        setConflict(true);
        setSaveState('failed');
        setSaveError('Someone else updated this sheet. Refresh to get the latest, then try again.');
        return false;
      }
      setSaveState('failed');
      setSaveError(e instanceof ApiError ? e.message : 'Save failed — will retry. Your draft is preserved.');
      return false;
    }
  }, [sheet, locked]);

  // Autosave 1s idle.
  useEffect(() => {
    if (!dirty || locked || loading) return;
    const t = window.setTimeout(() => {
      void doSave();
    }, 1000);
    return () => window.clearTimeout(t);
  }, [dirty, scores, remarks, locked, loading, doSave]);

  function updateScore(key: string, v: number | null) {
    if (locked) return;
    setScores((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
    if (saveState === 'saved' || saveState === 'failed') setSaveState('save');
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateForSubmit(): boolean {
    const result = validateScores(scores as Record<string, unknown>);
    if (result.ok) {
      setSubmitErrors([]);
      setFieldErrors({});
      return true;
    }
    const perField: Record<string, string> = {};
    for (const err of result.errors) {
      const key = err.split(' ')[0];
      perField[key] = err.includes('required') ? 'Score required (0–100).' : 'Must be a whole number 0–100.';
    }
    setFieldErrors(perField);
    setSubmitErrors(result.errors);
    requestAnimationFrame(() => errorSummaryRef.current?.focus());
    return false;
  }

  async function confirmSubmitNow() {
    if (!sheet) return;
    setConfirmSubmit(false);
    // Ensure latest draft is saved first (submit waits for save).
    if (dirty) {
      const ok = await doSave();
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const res = await submitGuestEvaluation(sheet.id, stateRef.current.scores, version);
      setVersion(res.version);
      setServerTotal(res.total);
      setServerAverage(res.average);
      setSaveState('submitted');
      setDirty(false);
      setSheet((prev) => (prev ? { ...prev, state: 'SUBMITTED' } : prev));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT')) {
        setConflict(true);
        setSubmitErrors(['Someone else updated this sheet — refresh and try again.']);
      } else if (e instanceof ApiError && (e.status === 422 || e.code === 'VALIDATION' || e.code === 'VALIDATION_FAILED')) {
        setSubmitErrors([e.message, ...e.fieldErrors.map((f) => `${f.field}: ${f.message}`)]);
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
      } else {
        setSubmitErrors([e instanceof ApiError ? e.message : 'Submit failed. Your draft is preserved — retry.']);
        requestAnimationFrame(() => errorSummaryRef.current?.focus());
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    const nav = resolveGuestNext({
      dirty,
      saving: saveState === 'saving',
      saveFailed: saveState === 'failed',
    });
    if (nav === 'stay') {
      setNextDialog('wait');
      return;
    }
    if (nextStudentId) navigate(`/evaluate/students/${encodeURIComponent(nextStudentId)}`);
    else navigate('/evaluate/session');
  }

  async function handleNextRetry() {
    const ok = await doSave();
    if (ok) {
      setNextDialog('none');
      if (nextStudentId) navigate(`/evaluate/students/${encodeURIComponent(nextStudentId)}`);
      else navigate('/evaluate/session');
    }
  }

  if (loading) {
    return <main className={styles.page} data-testid="guest-sheet"><p role="status">Loading sheet…</p></main>;
  }
  if (loadKind === 'forbidden') {
    return <main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="This invitation does not cover that student." /></main>;
  }
  if (loadKind === 'not-found') {
    return <main className={styles.page} data-testid="not-found"><PageHeading title="Not found" /><EmptyState title="Not found" body={loadError ?? 'Sheet not found.'} /></main>;
  }
  if (loadError || !sheet) {
    return <main className={styles.page}><p role="alert" className={styles.error}>{loadError ?? 'Not found.'} <button type="button" onClick={() => void load()}>Retry</button></p></main>;
  }

  return (
    <main className={styles.page} data-testid="guest-sheet">
      <PageHeading
        kicker={sheet.sessionTitle ? `Session · ${sheet.sessionTitle}` : 'Assigned session'}
        title={sheet.studentName || 'Student details unavailable'}
        desc={plainStatus}
      />

      {conflict && (
        <div role="alert" className={styles.conflict} data-testid="revision-conflict">
          <strong>Someone else updated this sheet.</strong> Your draft is kept here — refresh to see the latest, then try saving again.
          <div>
            <button type="button" onClick={() => void load()}>Refresh latest</button>
            {' '}
            <button type="button" onClick={() => void doSave()}>Retry save</button>
          </div>
        </div>
      )}

      {submitErrors.length > 0 && (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert" className={styles.errorSummary ?? styles.error} data-testid="submit-errors">
          <strong>All 10 scores are required before submit.</strong>
          <ul>
            {submitErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section aria-label="Criterion scores">
        {CRITERIA_10.map((key, i) => (
          <ScoreInputRow
            key={key}
            index={i}
            label={CRITERIA_LABELS[key]}
            criterionKey={key}
            value={scores[key]}
            onChange={(v) => updateScore(key, v)}
            error={fieldErrors[key]}
            disabled={locked}
          />
        ))}
      </section>

      <section aria-label="Overall remarks">
        <label htmlFor="guest-remarks"><strong>Overall remarks</strong></label>
        <textarea
          id="guest-remarks"
          rows={4}
          value={remarks}
          disabled={locked}
          maxLength={2000}
          onChange={(e) => {
            setRemarks(e.target.value);
            setDirty(true);
            if (saveState === 'saved' || saveState === 'failed') setSaveState('save');
          }}
          aria-describedby="guest-remarks-count guest-provisional-total"
        />
        <p id="guest-remarks-count" className={styles.meta}>{remarks.length}/2000</p>
      </section>

      <p id="guest-provisional-total" role="status" className={styles.meta} data-testid="provisional-total">
        Current total {displayTotal} / 1000 · {Number.isInteger(displayAvg) ? displayAvg.toFixed(0) : displayAvg.toFixed(1)} / 100. Final total confirmed on save.
      </p>

      <div data-testid="sheet-actions">
        <span data-testid="guest-save-state" role="status">{guestSaveLabel(saveState)}</span>
        {' '}
        <span data-testid="revision">{plainStatus}</span>
        {saveError && <span role="alert" className={styles.error}>{saveError}</span>}
        {!locked && (
          <button type="button" onClick={() => void doSave()} disabled={saveState === 'saving'}>
            Save draft
          </button>
        )}
        {!locked && (
          <button
            type="button"
            onClick={() => {
              if (!validateForSubmit()) return;
              setConfirmSubmit(true);
            }}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit evaluation'}
          </button>
        )}
        {locked && (
          <span role="status" className={styles.meta}>
            {plainStatus}. {submitted ? 'Submitted — thank you.' : ''}
          </span>
        )}
        {' '}
        <button type="button" onClick={() => void handleNext()} data-testid="next-student">Next student</button>
        {' '}
        <Link to="/evaluate/session">Back to roster</Link>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit evaluation?"
        body="Submitting locks this sheet. You cannot edit after submit unless staff reopens it."
        confirmLabel="Submit and lock"
        onConfirm={() => void confirmSubmitNow()}
        onCancel={() => setConfirmSubmit(false)}
      />
      <ConfirmDialog
        open={nextDialog === 'wait'}
        title="Save before Next?"
        body="Your draft is still saving. Stay to let autosave finish, or retry now. Nothing is discarded."
        confirmLabel="Retry save"
        onConfirm={() => void handleNextRetry()}
        onCancel={() => setNextDialog('none')}
      />
    </main>
  );
}
