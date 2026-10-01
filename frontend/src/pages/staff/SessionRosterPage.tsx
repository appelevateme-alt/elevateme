import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { FilterBar } from '../../components/FilterBar';
import { RosterTable } from '../../components/RosterTable';
import { type SaveKind } from '../../components/SaveState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import {
  getProgram,
  getReleaseState,
  getSessionRoster,
  patchAttendance,
  previewReleaseReports,
  releaseIdempotencyKey,
  releaseReports,
  type ReleasePreview,
} from '../../features/programs/api';
import type { FullRosterRow } from '../../features/programs/types';
import styles from './SessionRosterPage.module.css';

const PAGE_SIZE = 20;

/**
 * /staff/programs/:id/sessions/:sessionId/roster — server-side search
 * (?q=&committee=&status=) + pagination, attendance toggle via PATCH with
 * SaveState, Next-student flow + sticky Release Reports bar (Phase 3 preview,
 * confirm, idempotency-Key repeat-safe).
 */
export function SessionRosterPage() {
  const { id, sessionId } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [committee, setCommittee] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<FullRosterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [denied, setDenied] = useState(false);
  const [committeeOptions, setCommitteeOptions] = useState<Array<{ value: string; label: string }>>([{ value: '', label: 'All' }]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveKind>('saved');
  const [release, setRelease] = useState<{ submitted: number; expected: number; unavailable: boolean; released?: boolean }>({ submitted: 0, expected: 0, unavailable: true });
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseNotice, setReleaseNotice] = useState<string | null>(null);
  const idemKeyRef = useRef<string | null>(null);

  const load = useCallback(async (reset: boolean, nextPage: number) => {
    setError(null);
    setErrorKind(null);
    if (reset) setLoading(true);
    try {
      const res = await getSessionRoster(sessionId ?? '', {
        q: q || undefined,
        committee: committee || undefined,
        status: status || undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setRows((prev) => (reset ? res.rows : [...prev, ...res.rows]));
      setTotal(res.total);
      setPage(nextPage);
      setHasMore(res.rows.length === PAGE_SIZE);
      setRelease(await getReleaseState(sessionId ?? '', res.total));
      const pv = await previewReleaseReports(sessionId ?? '');
      setPreview(pv);
    } catch (e) {
      const state = toErrorStateFrom(e);
      if (state === 'denied' || state === 'pending') {
        setDenied(true);
        setErrorKind('forbidden');
      } else if (state === 'notfound') {
        setErrorKind('not-found');
        setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Not found.');
      } else setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Failed to load roster.');
    } finally {
      setLoading(false);
    }
  }, [sessionId, q, committee, status]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await getProgram(id);
        const opts = [{ value: '', label: 'All' }, ...(p.committees ?? []).map((c) => ({ value: c.name, label: c.name }))];
        setCommitteeOptions(opts);
      } catch {
        /* keep All-only fallback */
      }
    })();
  }, [id]);

  useEffect(() => {
    void load(true, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    void load(true, 1);
  }

  async function toggleAttendance(rowId: string, mark: 'attended' | 'absent') {
    const prev = rows;
    setRows((r) => r.map((x) => (x.id === rowId ? { ...x, attendance: mark } : x)));
    setSavingId(rowId);
    setSaveState('saving');
    try {
      const present = rows.filter((x) => (x.id === rowId ? mark === 'attended' : x.attendance === 'attended')).map((x) => x.id);
      await patchAttendance(sessionId ?? '', present);
      setSaveState('saved');
    } catch {
      setRows(prev);
      setSaveState('error');
    } finally {
      setSavingId(null);
    }
  }

  const submittedCount = rows.filter((r) => r.reportStatus === 'submitted' || r.reportStatus === 'released').length;

  function openNextDraft() {
    // Next-student flow: first draft row in stable order; draft is autosaved on the
    // sheet before leaving (sheet blocks navigation while dirty — never discards).
    const next = rows.find((r) => r.reportStatus === 'draft') ?? rows[0];
    if (!next) return;
    const after = rows.slice(rows.indexOf(next) + 1).find((r) => r.reportStatus === 'draft');
    const suffix = after ? `?next=${encodeURIComponent(after.id)}` : '';
    navigate(`/staff/evaluations/${encodeURIComponent(next.id)}${suffix}`);
  }

  async function confirmRelease() {
    if (!sessionId) return;
    if (!idemKeyRef.current) idemKeyRef.current = releaseIdempotencyKey(sessionId);
    setReleasing(true);
    setReleaseNotice(null);
    try {
      const res = await releaseReports(sessionId, idemKeyRef.current);
      setReleaseNotice(
        res.repeated
          ? `Already released (${res.releaseId}). Repeat-safe — no duplicate.`
          : `Released ${res.released} report(s). Submitted ${res.submitted}/expected ${res.expected}, excluded ${res.excluded}.`,
      );
      setPreviewOpen(false);
      const pv = await previewReleaseReports(sessionId);
      setPreview(pv);
      if (pv) setRelease({ released: (pv.alreadyReleased ?? 0) > 0, submitted: pv.submitted, expected: pv.expected, unavailable: false });
      void load(true, 1);
    } catch (e) {
      setReleaseNotice(e instanceof ApiError ? `${e.message} (code ${e.code}) — draft preserved, retry with the same key.` : 'Release failed — retry with the same key.');
    } finally {
      setReleasing(false);
    }
  }

  if (denied) {
    return <main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="Staff access required for rosters." /></main>;
  }

  return (
    <main className={styles.page} data-testid="session-roster">
      <PageHeading title="Session roster" desc={`Program ${id} · Session ${sessionId}`} />
      <p><Link to={`/staff/programs/${id}`}>← Back to program workspace</Link></p>
      <p role="status" className={styles.meta} data-testid="roster-counts">
        Submitted {preview?.submitted ?? submittedCount} / Total {preview?.expected ?? total}
        {preview ? ` · To release ${preview.toRelease} · Excluded ${preview.excluded} · Recipients ${preview.toRelease}` : ''}
      </p>
      <div className={styles.nextRow}>
        <button type="button" onClick={openNextDraft} disabled={rows.length === 0} data-testid="roster-next">
          Next student
        </button>
      </div>
      <form onSubmit={search} className={styles.search} role="search">
        <label>Search name / ElevateMe ID
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or EM-ID" />
        </label>
        <button type="submit">Search</button>
      </form>
      <FilterBar
        selects={[
          { label: 'Committee', value: committee, options: committeeOptions, onChange: setCommittee },
          { label: 'Status', value: status, options: [{ value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'submitted', label: 'Submitted' }, { value: 'released', label: 'Released' }], onChange: setStatus },
        ]}
        onReset={() => { setQ(''); setCommittee(''); setStatus(''); void load(true, 1); }}
      />
      {loading && <p role="status">Loading roster…</p>}
      {error && errorKind === 'not-found' && <p role="alert" data-testid="not-found" className={styles.error}>{error}</p>}
      {error && errorKind !== 'not-found' && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && rows.length === 0 && <EmptyState title="No students" body="No roster entries match these filters." />}
      {rows.length > 0 && (
        <>
          <p className={styles.meta} role="status">{total} student{total === 1 ? '' : 's'}</p>
          <RosterTable
            rows={[]}
            full={rows}
            onToggleAttendance={(rid, mark) => void toggleAttendance(rid, mark)}
            savingId={savingId}
            saveState={saveState}
          />
          <ul className={styles.sheetLinks}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/staff/evaluations/${encodeURIComponent(r.id)}`} data-testid={`open-sheet-${r.id}`}>
                  Open sheet — {r.name}
                </Link>
              </li>
            ))}
          </ul>
          {hasMore && <button type="button" onClick={() => void load(false, page + 1)}>Load more</button>}
        </>
      )}
      <div className={styles.stickyFooter} data-testid="release-bar">
        <span>
          {preview
            ? `Preview: submitted ${preview.submitted}/expected ${preview.expected}, excluded ${preview.excluded}, recipients ${preview.toRelease}`
            : `Reports submitted: ${release.submitted} / expected ${release.expected}`}
        </span>
        <button
          type="button"
          disabled={!preview || releasing || (preview.toRelease === 0 && preview.alreadyReleased > 0)}
          title={!preview ? 'Report release preview is not available yet.' : 'Preview then release reports'}
          onClick={() => setPreviewOpen(true)}
        >
          {releasing ? 'Releasing…' : 'Release Reports'}
        </button>
      </div>
      {releaseNotice && <p role="status" className={styles.meta} data-testid="release-notice">{releaseNotice}</p>}
      <ConfirmDialog
        open={previewOpen}
        title="Release reports?"
        body={preview
          ? `Submitted ${preview.submitted}/expected ${preview.expected}, excluded ${preview.excluded}, recipients ${preview.toRelease}. Already released ${preview.alreadyReleased}. Absent/excluded are never released as zero. Repeat-safe via idempotency key.`
          : 'Release reports.'}
        confirmLabel="Confirm release"
        onConfirm={() => void confirmRelease()}
        onCancel={() => setPreviewOpen(false)}
      />
    </main>
  );
}
