import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { toColomboDisplay } from '../../lib/time';
import { getProgram, submitProgram } from '../../features/programs/api';
import { nextActionForLifecycle, remainingCapacity } from '../../features/programs/helpers';
import type { Program } from '../../features/programs/types';
import styles from './ProgramWorkspacePage.module.css';

const TABS = ['Overview', 'Sessions', 'Students', 'Evaluators', 'Performance', 'Settings'] as const;

/**
 * /staff/programs/:id — workspace tabs with header (name/date/status +
 * next valid action button, never in overflow menu).
 */
export function ProgramWorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as (typeof TABS)[number]) || 'Overview';
  const [program, setProgram] = useState<Program | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>(
    (TABS as readonly string[]).includes(initialTab) ? initialTab : 'Overview',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [denied, setDenied] = useState(false);
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProgram(id ?? '');
        setProgram(p);
      } catch (e) {
        const state = toErrorStateFrom(e);
        if (state === 'denied' || state === 'pending') {
          setDenied(true);
          setErrorKind('forbidden');
        } else if (state === 'notfound') {
          setErrorKind('not-found');
          setError(e instanceof ApiError ? e.message : 'Not found.');
        } else setError(e instanceof ApiError ? e.message : 'Failed to load program.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function nextAction() {
    if (!program) return;
    if (program.lifecycle !== 'DRAFT') return;
    setActing(true);
    try {
      const updated = await submitProgram(program.id);
      setProgram(updated);
      setNotice('Submitted. Edits are now restricted while under review.');
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <main className={styles.page}><p role="status">Loading…</p></main>;
  if (denied) return <main className={styles.page} data-testid="forbidden"><PageHeading title="Permission denied" /><EmptyState title="Permission denied" body="Staff access required." /></main>;
  if (errorKind === 'not-found') return <main className={styles.page} data-testid="not-found"><p role="alert" className={styles.error}>{error ?? 'Not found.'}</p></main>;
  if (errorKind === 'forbidden' && error) return <main className={styles.page} data-testid="forbidden"><p role="alert" className={styles.error}>{error}</p></main>;
  if (error || !program) return <main className={styles.page}><p role="alert" className={styles.error}>{error ?? 'Not found.'}</p></main>;

  const next = nextActionForLifecycle(program.lifecycle);

  return (
    <main className={styles.page} data-testid="program-workspace">
      <nav aria-label="Breadcrumb" className={styles.meta}>
        <Link to="/staff/programs">Back to programs</Link>
        {' / '}
        <span aria-current="page">{program.title}</span>
      </nav>
      <header className={styles.header}>
        <div>
          <PageHeading kicker={`${program.kind} · ${program.theme}`} title={program.title} desc={`${toColomboDisplay(program.startsAt)} → ${toColomboDisplay(program.endsAt)} · ${program.location}`} />
          <p><StatusBadge value={program.lifecycle} /> <span className={styles.meta}>{remainingCapacity(program)} of {program.capacity} seats left</span></p>
        </div>
        <div className={styles.action}>
          {next.action === 'submit' ? (
            <button type="button" disabled={acting} onClick={() => void nextAction()}>{acting ? 'Submitting…' : next.label}</button>
          ) : next.action === 'manage' ? (
            <button type="button" onClick={() => setTab('Sessions')}>{next.label}</button>
          ) : (
            <span role="note" className={styles.meta}>
              {next.label}{' '}
              <button type="button" onClick={() => setTab(next.action === 'view' ? 'Overview' : 'Sessions')}>
                {next.action === 'view' ? 'View overview' : 'View sessions'}
              </button>
            </span>
          )}
        </div>
      </header>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {program.lifecycle === 'PENDING_REVIEW' && (
        <p className={styles.restricted} role="note">Sent for review — edits are restricted while under review.</p>
      )}
      <nav className={styles.tabs} aria-label="Program workspace">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            aria-selected={tab === t}
            role="tab"
            className={tab === t ? styles.active : ''}
            onClick={() => {
              setTab(t);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', t);
                return next;
              }, { replace: true });
            }}
          >
            {t}
          </button>
        ))}
      </nav>
      <section aria-label={tab} className={styles.tabBody}>
        {tab === 'Overview' && (
          <div>
            <p>{program.description}</p>
            {program.eligibility && <p>Eligibility: {program.eligibility}</p>}
          </div>
        )}
        {tab === 'Sessions' && (
          <ul>
            {program.sessions.map((s) => (
              <li key={s.id}>
                {s.title} — {toColomboDisplay(s.startsAt)} → {toColomboDisplay(s.endsAt)}{' '}
                <button type="button" onClick={() => navigate(`/staff/programs/${program.id}/sessions/${s.id}/roster`)}>Open roster</button>
              </li>
            ))}
            {program.sessions.length === 0 && <li>No sessions yet.</li>}
          </ul>
        )}
        {tab === 'Students' && <p>Enrolled students appear here via session rosters. <Link to="#sessions" onClick={(e) => { e.preventDefault(); setTab('Sessions'); }}>Open a session roster</Link>.</p>}
        {tab === 'Evaluators' && <p>Evaluator assignments are managed per session (Phase 3).</p>}
        {tab === 'Performance' && <p>Aggregates use attendance-only distinct counts — never inferred from registration.</p>}
        {tab === 'Settings' && (
          <div>
            <p>Visibility: {program.visibility} · Lifecycle: {program.lifecycle}</p>
            {program.lifecycle !== 'DRAFT' && <p className={styles.meta}>Settings are read-only after submission.</p>}
            {program.lifecycle === 'DRAFT' && (
              <p>
                <Link to={`/staff/programs/${encodeURIComponent(program.id)}/edit?returnTab=${encodeURIComponent(tab)}`}>
                  Edit draft
                </Link>
                {' · '}
                <Link to="/staff/comment-bank">Open comment bank</Link>
              </p>
            )}
            {program.lifecycle !== 'DRAFT' && (
              <p>
                <Link to="/staff/comment-bank">Open comment bank</Link>
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
