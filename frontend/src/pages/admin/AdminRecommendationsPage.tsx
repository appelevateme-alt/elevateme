import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { StudentSelector } from '../../components/StudentSelector';
import { ApiError, get } from '../../lib/api';
import { CRITERIA_10, CRITERIA_LABELS } from '../../lib/scoring';
import { previewAudience, createRecommendations } from '../../features/recommendations/api';
import { normalizePriorityForBackend } from '../../features/recommendations/helpers';
import { getStudentProfile, listStudentReports, type StudentProfile } from '../../features/students/api';
import { dedupe, PIN_MAX } from '../../features/admin-targeting/types';
import styles from './AdminPhase5.module.css';

const COMPARATORS = [
  { value: 'LT', label: 'Below' },
  { value: 'LTE', label: 'At or below' },
  { value: 'GT', label: 'Above' },
  { value: 'GTE', label: 'At or above' },
  { value: 'EQ', label: 'Equals' },
] as const;

function parseTypedIds(raw: string): string[] {
  return dedupe(raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
}

function shortId(id: string): string {
  return id.length > 4 ? `…${id.slice(-4)}` : id;
}

function reportNumber(r: Record<string, unknown>): number | null {
  const norm = r['normalized'];
  if (typeof norm === 'number' && Number.isFinite(norm)) return norm;
  for (const key of ['total', 'score', 'best', 'points']) {
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v > 100 ? Math.round(v / 10) : v;
    }
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      const n = Number(v);
      return n > 100 ? Math.round(n / 10) : n;
    }
  }
  return null;
}

function reportLabel(r: Record<string, unknown>, i: number): string {
  const id = String(r['id'] ?? `report-${i + 1}`);
  const name = String(r['programName'] ?? r['program_name'] ?? r['title'] ?? `Report ${i + 1}`);
  const n = reportNumber(r);
  return n == null ? `${name} (${id})` : `${name} — ${n}/100 (${id})`;
}

/**
 * /admin/recommendations — composer: pick who gets this, check the
 * count, then publish. The preview freezes the recipient list; publish
 * always sends that frozen list so late edits cannot silently resend
 * to different students.
 */
export function AdminRecommendationsPage() {
  const [searchParams] = useSearchParams();
  const [title, setTitle] = useState('');
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [skillArea, setSkillArea] = useState('');
  const [criterion, setCriterion] = useState('');
  const [comparator, setComparator] = useState<string>('LT');
  const [threshold, setThreshold] = useState('');
  const [priority, setPriority] = useState<'HIGH' | 'MED' | 'LOW'>('MED');
  const [dueDate, setDueDate] = useState('');
  const [linkedReportId, setLinkedReportId] = useState('');
  const [pinned, setPinned] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState('');
  const [instituteId, setInstituteId] = useState('');

  const [count, setCount] = useState<number | null>(null);
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [frozenCount, setFrozenCount] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [prefillProfile, setPrefillProfile] = useState<StudentProfile | null>(null);
  const [prefillStats, setPrefillStats] = useState<{ best: number | null; gain: number | null } | null>(null);
  const [reportOptions, setReportOptions] = useState<Array<Record<string, unknown>>>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  const [knownInstitutes, setKnownInstitutes] = useState<string[]>([]);

  const typedIds = useMemo(() => parseTypedIds(studentIds), [studentIds]);
  const combinedIds = useMemo(() => dedupe([...selectedIds, ...typedIds]), [selectedIds, typedIds]);
  const singleId = combinedIds.length === 1 ? combinedIds[0] : null;

  const targetKey = useMemo(
    () =>
      JSON.stringify({
        ids: [...combinedIds].sort(),
        inst: instituteId.trim(),
        crit: criterion,
        comp: comparator,
        thresh: threshold.trim(),
      }),
    [combinedIds, instituteId, criterion, comparator, threshold],
  );

  const fresh = count != null && frozenIds != null && previewKey != null && previewKey === targetKey;
  const dirtyAfterPreview = previewKey != null && previewKey !== targetKey;

  // Prefill from StudentDetail: /admin/recommendations?student=<id>.
  useEffect(() => {
    const sid = searchParams.get('student')?.trim();
    if (!sid) return;
    setSelectedIds([sid]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mini-profile for a single picked student (name, ID, best/gain).
  useEffect(() => {
    if (!singleId) {
      setPrefillProfile(null);
      setPrefillStats(null);
      setReportOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await getStudentProfile(singleId);
        if (!cancelled) setPrefillProfile(p);
      } catch {
        if (!cancelled) setPrefillProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [singleId]);

  // Reports for the linked-report picker (single student only).
  useEffect(() => {
    if (!singleId) return;
    let cancelled = false;
    setReportsLoading(true);
    (async () => {
      try {
        const rows = await listStudentReports(singleId);
        if (cancelled) return;
        setReportOptions(rows);
        const totals = rows.map(reportNumber).filter((n): n is number => n != null);
        if (totals.length === 0) {
          setPrefillStats({ best: null, gain: null });
        } else {
          const best = Math.max(...totals);
          setPrefillStats({ best, gain: best - totals[0] });
        }
      } catch {
        if (!cancelled) {
          setReportOptions([]);
          setPrefillStats(null);
        }
      } finally {
        if (!cancelled) setReportsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [singleId]);

  // Resolve names for manually typed IDs so the list shows people, not codes.
  useEffect(() => {
    const missing = typedIds.filter((id) => !extraNames[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      for (const id of missing.slice(0, 20)) {
        try {
          const p = await getStudentProfile(id);
          if (p) entries[id] = p.displayName || p.elevateMeId || p.email || `Student ${shortId(id)}`;
        } catch {
          continue;
        }
      }
      if (!cancelled && Object.keys(entries).length > 0) {
        setExtraNames((prev) => ({ ...prev, ...entries }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typedIds, extraNames]);

  // Known institutes for the datalist (best-effort; free text always allowed).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const path of ['/institutes', '/programs?limit=50']) {
        try {
          const res = await get<unknown>(path);
          const items = Array.isArray(res)
            ? res
            : Array.isArray((res as { items?: unknown }).items)
              ? (res as { items: unknown[] }).items
              : [];
          const names = dedupe(
            items
              .map((it) => {
                if (typeof it === 'string') return it;
                const o = it as Record<string, unknown>;
                const v = o['name'] ?? o['institute'] ?? o['instituteId'] ?? o['location'];
                return typeof v === 'string' ? v.trim() : '';
              })
              .filter(Boolean),
          ).slice(0, 50);
          if (!cancelled && names.length > 0) {
            setKnownInstitutes(names);
            return;
          }
        } catch {
          continue;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Any targeting change makes the old preview stale.
  useEffect(() => {
    if (previewKey != null && targetKey !== previewKey) setCount(null);
  }, [targetKey, previewKey]);

  // Targeting change handlers — each one clears the count immediately
  // (the effect above is the backstop for programmatic changes).
  function handleSelectedChange(ids: string[]) {
    setSelectedIds(ids);
    setCount(null);
  }
  function handleStudentIdsChange(v: string) {
    setStudentIds(v);
    setCount(null);
  }
  function handleInstituteChange(v: string) {
    setInstituteId(v);
    setCount(null);
  }
  function handleCriterionChange(v: string) {
    setCriterion(v);
    setCount(null);
  }
  function handleComparatorChange(v: string) {
    setComparator(v);
    setCount(null);
  }
  function handleThresholdChange(v: string) {
    setThreshold(v);
    setCount(null);
  }

  function ruleForPreview() {
    if (!criterion) return null;
    const t = threshold.trim();
    return {
      criterion,
      comparator,
      threshold: t === '' ? null : Number(t),
    };
  }

  function ruleError(): string | null {
    if (!criterion) return null;
    const t = threshold.trim();
    if (t === '') return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 100) return 'Threshold must be a whole number from 0 to 100.';
    return null;
  }

  function ruleHelper(): string | null {
    if (!criterion) return null;
    const critLabel = CRITERIA_LABELS[criterion as keyof typeof CRITERIA_LABELS] ?? criterion;
    const compLabel =
      COMPARATORS.find((c) => c.value === comparator)?.label.toLowerCase() ?? 'below';
    const t = threshold.trim();
    return t === '' ? `${critLabel} ${compLabel} …` : `${critLabel} ${compLabel} ${t}`;
  }

  async function handlePreview() {
    setError(null);
    setNotice(null);
    const bad = ruleError();
    if (bad) {
      setError(bad);
      return;
    }
    setPreviewing(true);
    try {
      const res = await previewAudience({
        individualIds: combinedIds.length > 0 ? combinedIds : null,
        institutionId: instituteId.trim() || null,
        criterionRule: ruleForPreview(),
        explicitBatch: null,
      });
      setCount(res.count);
      setFrozenIds(res.recipientIds ?? []);
      setFrozenCount(res.count);
      setPreviewKey(targetKey);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check the audience. Try again.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handlePublish() {
    if (!title.trim() || !action.trim() || !reason.trim()) {
      setError('Add a title, an action, and a reason before publishing.');
      return;
    }
    if (!fresh || frozenIds == null) {
      setError('The preview is outdated — refresh the preview before publishing.');
      return;
    }
    setError(null);
    try {
      await createRecommendations({
        title: title.trim(),
        action: action.trim(),
        reason: reason.trim(),
        skillArea: skillArea.trim() || null,
        priority: normalizePriorityForBackend(priority),
        dueDate: dueDate.trim() || null,
        linkedReportId: linkedReportId.trim() || null,
        pinned,
        // Frozen snapshot: publish sends only the IDs from the preview,
        // never rebuilt from the current inputs.
        individualIds: null,
        institutionId: null,
        criterionRule: null,
        explicitBatch: frozenIds,
      });
      setNotice(`Published to ${frozenIds.length} student${frozenIds.length === 1 ? '' : 's'}.`);
      setConfirming(false);
      setTitle('');
      setAction('');
      setReason('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Publish failed. Try again.');
    }
  }

  const helper = ruleHelper();

  return (
    <main className={styles.page} data-testid="page-admin-recommendations">
      <PageHeading title="Recommendations" desc="Write guidance, choose who gets it, check the count, then publish." />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <label className={styles.field}>Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Recommendation title" />
        </label>
        <label className={styles.field}>Action — what the student should do
          <input value={action} onChange={(e) => setAction(e.target.value)} aria-label="Recommendation action" />
        </label>
        <label className={styles.field}>Reason — why this helps
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-label="Recommendation reason" />
        </label>
        <label className={styles.field}>Skill area (optional)
          <input value={skillArea} onChange={(e) => setSkillArea(e.target.value)} aria-label="Skill area" />
        </label>

        <label className={styles.field}>Skill to filter by (optional)
          <select value={criterion} onChange={(e) => handleCriterionChange(e.target.value)} aria-label="Criterion">
            <option value="">Everyone picked below (no score filter)</option>
            {CRITERIA_10.map((key) => (
              <option key={key} value={key}>{CRITERIA_LABELS[key]}</option>
            ))}
          </select>
        </label>
        {criterion && (
          <>
            <label className={styles.field}>Show students
              <select value={comparator} onChange={(e) => handleComparatorChange(e.target.value)} aria-label="Comparator">
                {COMPARATORS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>Score cutoff, 0 to 100 (optional)
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={threshold}
                onChange={(e) => handleThresholdChange(e.target.value)}
                aria-label="Threshold"
              />
            </label>
            {helper && <p className={styles.meta}>Means: {helper}.</p>}
          </>
        )}

        <label className={styles.field}>Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as 'HIGH' | 'MED' | 'LOW')} aria-label="Priority">
            <option value="HIGH">High</option>
            <option value="MED">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>
        <label className={styles.field}>Due date (optional)
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" />
        </label>
        {singleId && reportOptions.length > 0 ? (
          <label className={styles.field}>Linked report (optional)
            <select
              value={linkedReportId}
              onChange={(e) => setLinkedReportId(e.target.value)}
              aria-label="Linked report"
            >
              <option value="">No linked report</option>
              {reportOptions.map((r, i) => {
                const id = String(r['id'] ?? `report-${i + 1}`);
                return (
                  <option key={id} value={id}>{reportLabel(r, i)}</option>
                );
              })}
            </select>
          </label>
        ) : (
          <label className={styles.field}>Report ID (optional, from the student profile)
            <input
              value={linkedReportId}
              onChange={(e) => setLinkedReportId(e.target.value)}
              aria-label="Linked report"
              placeholder="Copy the report ID from the student profile"
            />
          </label>
        )}
        {singleId && (
          <p className={styles.meta}>
            Find report IDs on the <Link to={`/admin/users/${encodeURIComponent(singleId)}`}>student profile</Link>.
            {reportsLoading ? ' Loading reports…' : reportOptions.length === 0 ? ' No reports found yet.' : ''}
          </p>
        )}
        <label className={styles.field}>Pinned
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} aria-label="Pinned" />
        </label>

        <div className={styles.section} aria-label="Targeting">
          <h2>Who should get this</h2>
          {singleId && prefillProfile && (
            <p className={styles.meta} data-testid="prefill-profile">
              To: {prefillProfile.displayName || prefillProfile.elevateMeId || prefillProfile.email || 'Student'}
              {' '}({prefillProfile.id})
              {prefillStats && prefillStats.best != null
                ? ` — best ${prefillStats.best}/100, change ${prefillStats.gain != null && prefillStats.gain >= 0 ? '+' : ''}${prefillStats.gain}`
                : ' — no scores yet'}
            </p>
          )}
          <StudentSelector selected={selectedIds} onChange={handleSelectedChange} />
          <label className={styles.field}>Extra student IDs (optional, comma-separated)
            <input
              value={studentIds}
              onChange={(e) => handleStudentIdsChange(e.target.value)}
              aria-label="Additional student IDs"
              placeholder="Paste extra IDs separated by commas"
            />
          </label>
          {typedIds.length > 0 && (
            <ul className={styles.meta} aria-label="Extra students">
              {typedIds.map((id) => (
                <li key={id}>{extraNames[id] ? `${extraNames[id]} (${shortId(id)})` : `Student ${shortId(id)} — looking up…`}</li>
              ))}
            </ul>
          )}
          <label className={styles.field}>Institute (optional)
            <input
              value={instituteId}
              onChange={(e) => handleInstituteChange(e.target.value)}
              aria-label="Target institution"
              list="institute-options"
              placeholder="Use the exact institute name from the student profile"
            />
          </label>
          <datalist id="institute-options">
            {knownInstitutes.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <p className={styles.meta}>Use the exact institute name shown on the student profile.</p>
          <div className={styles.actions}>
            <button type="button" onClick={handlePreview} disabled={previewing}>
              {previewing ? 'Checking…' : 'Check how many will get it'}
            </button>
          </div>
          {count != null && fresh && (
            <p className={styles.meta}>About {count} student{count === 1 ? '' : 's'} will get this. Pin max {PIN_MAX}.</p>
          )}
          {frozenIds != null && frozenCount != null && previewKey != null && !fresh && (
            <p role="status" className={styles.meta}>
              Preview outdated — refresh before publishing.
              {dirtyAfterPreview
                ? ` The last check found ${frozenCount} student${frozenCount === 1 ? '' : 's'}, but who gets this changed since.`
                : ''}
            </p>
          )}
          {count == null && previewKey == null && (
            <p className={styles.meta}>Check the count first — publishing needs a fresh check.</p>
          )}
          {frozenIds != null && dirtyAfterPreview && (
            <p role="status" className={styles.meta}>
              Publishing uses the frozen list of {frozenIds.length} from the last check, not the edited picks.
            </p>
          )}
        </div>

        {!confirming ? (
          <div className={styles.actions}>
            <button type="button" onClick={() => setConfirming(true)} disabled={!fresh}>
              Confirm publish
            </button>
          </div>
        ) : (
          <>
            <p className={styles.notice}>
              Publish to {frozenIds?.length ?? count ?? 'the checked'} student{((frozenIds?.length ?? count ?? 2) === 1) ? '' : 's'}?
              This uses the frozen list from the last check. This cannot be undone from here.
            </p>
            <div className={styles.actions}>
              <button type="button" onClick={handlePublish} disabled={!fresh}>Publish</button>
              <button type="button" onClick={() => setConfirming(false)}>Back</button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
