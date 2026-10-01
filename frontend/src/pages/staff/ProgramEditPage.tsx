import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { ApiError, toErrorStateFrom } from '../../lib/api';
import { getProgram, saveProgramDraft } from '../../features/programs/api';
import type { Program } from '../../features/programs/types';
import styles from '../admin/AdminPhase5.module.css';

/**
 * /staff/programs/:id/edit — edit a draft program (title, description,
 * location, capacity). Saves as draft; returns to the workspace preserving
 * the tab (?returnTab=).
 */
export function ProgramEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTab = searchParams.get('returnTab') || 'Overview';
  const [program, setProgram] = useState<Program | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await getProgram(id ?? '');
        setProgram(p);
        setTitle(p.title);
        setDescription(p.description);
        setLocation(p.location);
        setCapacity(String(p.capacity));
      } catch (e) {
        const kind = toErrorStateFrom(e);
        if (kind === 'denied' || kind === 'pending') setDenied(true);
        else setError(e instanceof ApiError ? e.message : 'Could not load program.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!title.trim()) {
      setNotice('A title is required before saving.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const cap = capacity.trim() === '' ? undefined : Number(capacity);
      await saveProgramDraft(id, {
        title: title.trim(),
        description,
        location: location.trim() || undefined,
        capacity: cap,
      } as never);
      navigate(`/staff/programs/${encodeURIComponent(id)}?tab=${encodeURIComponent(returnTab)}`, { replace: true });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Saving failed — try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className={styles.page}><p role="status">Loading program…</p></main>;
  if (denied) {
    return (
      <main className={styles.page} data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body="Staff access is required to edit programs." />
      </main>
    );
  }
  if (error || !program) {
    return (
      <main className={styles.page} data-testid="not-found">
        <PageHeading title="Program not found" />
        <EmptyState title="Program not found" body={error ?? 'This program is unavailable.'} action={<Link to="/staff/programs">Back to programs</Link>} />
      </main>
    );
  }

  const backTo = `/staff/programs/${encodeURIComponent(program.id)}?tab=${encodeURIComponent(returnTab)}`;
  const locked = program.lifecycle !== 'DRAFT';

  return (
    <main className={styles.page} data-testid="program-edit">
      <nav aria-label="Breadcrumb">
        <Link to="/staff/programs">Programs</Link>
        {' / '}
        <Link to={`/staff/programs/${encodeURIComponent(program.id)}`}>{program.title}</Link>
        {' / Edit'}
      </nav>
      <PageHeading title={`Edit — ${program.title}`} desc="Changes save as a draft. Nothing goes live until review." />
      {locked && (
        <p role="note" className={styles.meta}>
          This program is {program.lifecycle} — editing is restricted. Contact a coordinator for changes while under review.
        </p>
      )}
      <form onSubmit={(e) => void handleSave(e)} className={styles.form}>
        <label className={styles.field}>Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={locked} aria-label="Program title" />
        </label>
        <label className={styles.field}>Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} disabled={locked} aria-label="Program description" />
        </label>
        <label className={styles.field}>Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} disabled={locked} aria-label="Program location" />
        </label>
        <label className={styles.field}>Capacity
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" disabled={locked} aria-label="Program capacity" />
        </label>
        <div className={styles.actions}>
          {!locked && (
            <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button>
          )}
          <button type="button" onClick={() => navigate(backTo)}>Return to workspace</button>
        </div>
      </form>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
    </main>
  );
}
