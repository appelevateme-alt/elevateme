import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ScoreInputRow } from '../../components/ScoreInputRow';
import { CommentBankPicker, type BankItem } from '../../components/CommentBankPicker';
import { SaveState, type SaveKind } from '../../components/SaveState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { CRITERIA_10, CRITERIA_LABELS, validateScores } from '../../lib/scoring';
import {
  getEvaluationSheet,
  saveEvaluationDraft,
  submitEvaluation,
  submitIdempotencyKey,
} from '../../features/evaluation-sheet/api';
import {
  isStaleAutosaveResult,
  normalizedOf,
  preserveDraftForNext,
  provisionalTotalOf,
  resolveNextNavigation,
} from '../../features/evaluation-sheet/helpers';
import { listCommentBank } from '../../features/comment-bank/api';
import { getSessionRoster } from '../../features/programs/api';
import type { EvaluationSheet } from '../../features/evaluation-sheet/types';
import styles from './EvaluationSheetPage.module.css';

export function EvaluationSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sheet, setSheet] = useState<EvaluationSheet | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>(() => Object.fromEntries(CRITERIA_10.map((k) => [k, null])));
  const [notes, setNotes] = useState('');
  const [version, setVersion] = useState(1);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverAverage, setServerAverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKind, setLoadKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveKind>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [bank, setBank] = useState<BankItem[]>([]);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [rosterCounts, setRosterCounts] = useState<{ submitted: number; total: number } | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [nextDialog, setNextDialog] = useState<'none' | 'wait'>('none');

  const reqIdRef = useRef(0);
  const latestAppliedRef = useRef(0);
  const stateRef = useRef({ scores, notes, version, dirty });
  stateRef.current = { scores, notes, version, dirty };
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const draftsRef = useRef<Record<string, { scores: Record<string, number | null>; notes: string }>>({});

  const locked = sheet?.state !== 'DRAFT';

  const provisional = useMemo(() => provisionalTotalOf(scores), [scores]);
  const normalized = useMemo(() => normalizedOf(scores), [scores]);
  const displayTotal = serverTotal ?? provisional;
  const displayAvg = serverAverage ?? normalized;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setLoadKind(null);
    try {
      const s = await getEvaluationSheet(id);
      setSheet(s);
      setScores({ ...s.scores });
      setNotes(s.notes ?? '');
      setVersion(s.version);
      setServerTotal(s.provisionalTotal ?? s.total);
      setServerAverage(s.average);
      setDirty(false);
      setSaveState('saved');
      setConflict(false);
      // Comment bank (staff): shared + own private.
      try {
        const entries = await listCommentBank();
        setBank(entries.map((e) => ({ id: e.id, text: e.text, scope: e.scope as BankItem['scope'] })));
      } catch {
        /* bank optional */
      }
      // Roster counts + next (submitted/total).
      if (s.sessionId) {
        try {
          const roster = await getSessionRoster(s.sessionId, { page: 1, pageSize: 100 });
          const sub = roster.rows.filter((r) => r.reportStatus === 'submitted' || r.reportStatus === 'released').length;
          setRosterCounts({ submitted: sub, total: roster.total });
          const idx = roster.rows.findIndex(
            (r) => r.elevateMeId === s.elevateMeId || r.name === s.studentName,
          );
          void idx;
          // Roster rows carry no evaluation ids; Next resolves via ?next session hint when provided,
          // otherwise falls back to the roster page (draft preserved via autosave, never discarded).
          const hinted = searchParams.get('next');
          if (hinted && hinted !== id) setNextId(hinted);
        } catch {
          /* counts optional */
        }
      }
    } catch (e) {
      const kind = toErrorStateFrom(e);
      if (kind === 'denied' || kind === 'pending') setLoadKind('forbidden');
      else if (kind === 'notfound') setLoadKind('not-found');
      setLoadError(e instanceof ApiError ? e.message : 'Failed to load evaluation.');
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  // Unsaved protection: block router navigation when dirty.
  const blocker = useBlocker(dirty && !locked && !submitted);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const ok = window.confirm('You have unsaved changes. Leave without saving? Draft autosaves every second — Stay to let it finish.');
      if (ok) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && !locked && !submitted) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, locked, submitted]);

  const doSave = useCallback(async (reason: 'auto' | 'manual'): Promise<boolean> => {
    if (!id || locked) return true;
    const snap = stateRef.current;
    const myId = ++reqIdRef.current;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await saveEvaluationDraft(id, snap.scores, snap.notes, snap.version);
      if (isStaleAutosaveResult(latestAppliedRef.current, myId)) return false; // stale ignore
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
        setSaveState('error');
        setSaveError('This sheet changed elsewhere (revision conflict). Refresh to get the latest version, then retry.');
        return false;
      }
      const offline = e instanceof TypeError || !window.navigator.onLine;
      setSaveState(offline ? 'offline' : 'error');
      setSaveError(e instanceof ApiError ? e.message : 'Save failed — will retry. Your draft is preserved.');
      void reason;
      return false;
    }
  }, [id, locked]);

  // Autosave 1s idle.
  useEffect(() => {
    if (!dirty || locked || loading) return;
    const t = window.setTimeout(() => {
      void doSave('auto');
    }, 1000);
    return () => window.clearTimeout(t);
  }, [dirty, scores, notes, locked, loading, doSave]);

  function updateScore(key: string, v: number | null) {
    if (locked) return;
    setScores((prev) => ({ ...prev, [key]: v }));
    setDirty(true);
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function insertComment(text: string, pos: number) {
    const ta = notesRef.current;
    setUndoStack((prev) => [...prev, notes]);
    if (!ta) {
      setNotes((prev) => (prev ? `${prev} ${text}` : text));
      setDirty(true);
      return;
    }
    const start = pos >= 0 ? pos : (ta.selectionStart ?? notes.length);
    const end = pos >= 0 ? pos : (ta.selectionEnd ?? notes.length);
    const next = notes.slice(0, start) + text + notes.slice(end);
    setNotes(next);
    setDirty(true);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + text.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  function undoComment() {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setNotes(last);
      setDirty(true);
      return prev.slice(0, -1);
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

  async function handleSubmit() {
    if (!id) return;
    if (!validateForSubmit()) return;
    setConfirmSubmit(true);
  }

  async function confirmSubmitNow() {
    if (!id) return;
    setConfirmSubmit(false);
    // Ensure latest draft is saved first (Next/submit wait for save).
    if (dirty) {
      const ok = await doSave('manual');
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const res = await submitEvaluation(id, stateRef.current.scores, version, submitIdempotencyKey(id, version));
      setVersion(res.version);
      setServerTotal(res.total);
      setServerAverage(res.average);
      setSubmitted(true);
      setDirty(false);
      setSheet((prev) => (prev ? { ...prev, state: 'SUBMITTED' } : prev));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.code === 'VERSION_CONFLICT')) {
        setConflict(true);
        setSubmitErrors(['Revision conflict — refresh and retry.']);
      } else if (e instanceof ApiError && (e.status === 422 || e.code === 'VALIDATION')) {
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
    const nav = resolveNextNavigation({ dirty, saving: saveState === 'saving', saveError: saveState === 'error' || saveState === 'offline' });
    if (nav === 'stay') {
      setNextDialog('wait');
      return;
    }
    if (!id) return;
    draftsRef.current = preserveDraftForNext(draftsRef.current, id, scores, notes);
    if (nextId) navigate(`/staff/evaluations/${nextId}`);
    else if (sheet?.sessionId) navigate(`/staff/programs/x/sessions/${sheet.sessionId}/roster`);
  }

  async function handleNextRetry() {
    const ok = await doSave('manual');
    if (ok) {
      setNextDialog('none');
      draftsRef.current = preserveDraftForNext(draftsRef.current, id ?? '', scores, notes);
      if (nextId) navigate(`/staff/evaluations/${nextId}`);
      else if (sheet?.sessionId) navigate(`/staff/programs/x/sessions/${sheet.sessionId}/roster`);
    }
  }

  if (loading) return <main className={styles.page} data-testid="evaluation-sheet"><p role="status">Loading evaluation…</p></main>;
  if (loadKind === 'forbidden') return <main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="Staff access required for evaluations." /></main>;
  if (loadKind === 'not-found') return <main className={styles.page} data-testid="not-found"><PageHeading title="Not found" /><EmptyState title="Not found" body={loadError ?? 'Evaluation not found.'} /></main>;
  if (loadError || !sheet) return <main className={styles.page}><p role="alert" className={styles.error}>{loadError ?? 'Not found.'} <button type="button" onClick={() => void load()}>Retry</button></p></main>;

  return (
    <main className={styles.page} data-testid="evaluation-sheet">
      <div className={styles.context} data-testid="sheet-context" aria-label="Student and session context">
        <PageHeading
          kicker={sheet.sessionTitle ? `Session · ${sheet.sessionTitle}` : `Session · ${sheet.sessionId}`}
          title={sheet.studentName || `Student ${sheet.studentId}`}
          desc={`ElevateMe ID ${sheet.elevateMeId ?? sheet.studentId} · State ${sheet.state} · Revision ${version}`}
        />
        <p className={styles.counts} role="status">
          {rosterCounts ? `Submitted ${rosterCounts.submitted} / Total ${rosterCounts.total}` : 'Submitted — / Total —'}
        </p>
      </div>

      {conflict && (
        <div role="alert" className={styles.conflict} data-testid="revision-conflict">
          <strong>Revision conflict.</strong> This sheet changed elsewhere. Your draft is preserved locally.
          <div className={styles.conflictActions}>
            <button type="button" onClick={() => void load()}>Refresh latest</button>
            <button type="button" onClick={() => void doSave('manual')}>Retry save</button>
          </div>
        </div>
      )}

      {submitErrors.length > 0 && (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert" className={styles.errorSummary} data-testid="submit-errors" aria-labelledby="submit-errors-t">
          <h2 id="submit-errors-t">All 10 scores are required before submit.</h2>
          <ul>
            {submitErrors.map((e) => {
              const key = e.split(' ')[0];
              const idx = CRITERIA_10.indexOf(key as (typeof CRITERIA_10)[number]);
              return (
                <li key={e}>
                  {idx >= 0 ? <a href={`#score-${key}-${idx}`}>{e}</a> : e}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <section aria-label="Criterion scores" className={styles.scores}>
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

      <section aria-label="Overall remarks" className={styles.remarks}>
        <label htmlFor="overall-remarks"><strong>Overall remarks</strong></label>
        <textarea
          id="overall-remarks"
          ref={notesRef}
          rows={4}
          value={notes}
          disabled={locked}
          maxLength={2000}
          onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
          aria-describedby="remarks-count provisional-total"
        />
        <p id="remarks-count" className={styles.meta}>{notes.length}/2000</p>
        {!locked && (
          <CommentBankPicker items={bank} onInsert={insertComment} onUndo={undoComment} canUndo={undoStack.length > 0} />
        )}
      </section>

      <p id="provisional-total" role="status" className={styles.total} data-testid="provisional-total">
        Provisional total {displayTotal} / 1000 · {displayAvg % 1 === 0 ? displayAvg.toFixed(0) : displayAvg.toFixed(1)} / 100. Final total confirmed on save.
      </p>

      <div className={styles.sticky} data-testid="sheet-actions">
        <SaveState state={saveState} />
        <span className={styles.rev} data-testid="revision">Revision {version}</span>
        {saveError && <span role="alert" className={styles.error}>{saveError}</span>}
        {!locked && <button type="button" onClick={() => void doSave('manual')} disabled={saveState === 'saving'}>Save draft</button>}
        {!locked && <button type="button" onClick={() => void handleSubmit()} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit evaluation'}</button>}
        {locked && <span role="status" className={styles.lockedNote}>Locked ({sheet.state}). {submitted ? 'Submitted — thank you.' : ''}</span>}
        <button type="button" onClick={() => void handleNext()} data-testid="next-student">Next student</button>
        <Link to={sheet.sessionId ? `/staff/programs/x/sessions/${sheet.sessionId}/roster` : '/staff'}>Back to roster</Link>
        <Link to="/staff/comment-bank">Comment bank</Link>
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
