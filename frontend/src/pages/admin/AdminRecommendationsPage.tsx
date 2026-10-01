import { useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { ApiError } from '../../lib/api';
import { previewAudience, createRecommendations } from '../../features/recommendations/api';
import { normalizePriorityForBackend } from '../../features/recommendations/helpers';
import { dedupe, PIN_MAX } from '../../features/admin-targeting/types';
import styles from './AdminPhase5.module.css';

/**
 * /admin/recommendations — composer: target individuals/institution/rule,
 * preview count (POST /admin/audiences/preview), confirm publish
 * (POST /admin/recommendations {title,action,reason,skillArea,priority HIGH|MED|LOW,...}).
 */
export function AdminRecommendationsPage() {
  const [title, setTitle] = useState('');
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [skillArea, setSkillArea] = useState('');
  const [criterion, setCriterion] = useState('');
  const [comparator, setComparator] = useState('LT');
  const [threshold, setThreshold] = useState('');
  const [priority, setPriority] = useState<'HIGH' | 'MED' | 'LOW'>('MED');
  const [dueDate, setDueDate] = useState('');
  const [linkedReportId, setLinkedReportId] = useState('');
  const [pinned, setPinned] = useState(false);
  const [studentIds, setStudentIds] = useState('');
  const [instituteId, setInstituteId] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function audience() {
    const ids = dedupe(studentIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
    return {
      individualIds: ids.length > 0 ? ids : null,
      institutionId: instituteId.trim() || null,
      criterionRule: criterion.trim()
        ? {
            criterion: criterion.trim(),
            comparator: comparator.trim() || 'LT',
            threshold: threshold.trim() === '' ? null : Number(threshold),
          }
        : null,
      explicitBatch: null,
    };
  }

  async function handlePreview() {
    setError(null);
    try {
      const res = await previewAudience(audience());
      setCount(res.count);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Preview failed.');
    }
  }

  async function handlePublish() {
    if (!title.trim() || !action.trim() || !reason.trim()) {
      setError('Title, action, and reason are required.');
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
        ...audience(),
      });
      setNotice('Published.');
      setConfirming(false);
      setTitle(''); setAction(''); setReason('');
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Publish failed.');
    }
  }

  return (
    <main className={styles.page} data-testid="page-admin-recommendations">
      <PageHeading title="Recommendations" desc="Compose targeted guidance. Pin max 3 per student." />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <label className={styles.field}>Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Recommendation title" />
        </label>
        <label className={styles.field}>Action
          <input value={action} onChange={(e) => setAction(e.target.value)} aria-label="Recommendation action" />
        </label>
        <label className={styles.field}>Reason
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-label="Recommendation reason" />
        </label>
        <label className={styles.field}>Skill area (optional)
          <input value={skillArea} onChange={(e) => setSkillArea(e.target.value)} aria-label="Skill area" />
        </label>
        <label className={styles.field}>Criterion (optional)
          <input value={criterion} onChange={(e) => setCriterion(e.target.value)} aria-label="Criterion" />
        </label>
        <label className={styles.field}>Comparator
          <select value={comparator} onChange={(e) => setComparator(e.target.value)} aria-label="Comparator">
            <option value="LT">LT</option>
            <option value="LTE">LTE</option>
            <option value="GT">GT</option>
            <option value="GTE">GTE</option>
            <option value="EQ">EQ</option>
          </select>
        </label>
        <label className={styles.field}>Threshold (optional)
          <input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" aria-label="Threshold" />
        </label>
        <label className={styles.field}>Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as 'HIGH' | 'MED' | 'LOW')} aria-label="Priority">
            <option value="HIGH">HIGH</option>
            <option value="MED">MED</option>
            <option value="LOW">LOW</option>
          </select>
        </label>
        <label className={styles.field}>Due date (optional, ISO)
          <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="2026-06-01T00:00:00Z" aria-label="Due date" />
        </label>
        <label className={styles.field}>Linked report (optional)
          <input value={linkedReportId} onChange={(e) => setLinkedReportId(e.target.value)} aria-label="Linked report" />
        </label>
        <label className={styles.field}>Pinned
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} aria-label="Pinned" />
        </label>
        <div className={styles.section} aria-label="Targeting">
          <h2>Audience</h2>
          <label className={styles.field}>Individuals (IDs, comma-separated)
            <input value={studentIds} onChange={(e) => setStudentIds(e.target.value)} aria-label="Target individuals" />
          </label>
          <label className={styles.field}>Institution
            <input value={instituteId} onChange={(e) => setInstituteId(e.target.value)} aria-label="Target institution" />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={handlePreview}>Preview count</button>
          </div>
          {count != null && <p className={styles.meta}>Audience preview: {count} recipient{count === 1 ? '' : 's'}. Pin max {PIN_MAX}.</p>}
        </div>
        {!confirming ? (
          <div className={styles.actions}>
            <button type="button" onClick={() => setConfirming(true)}>Confirm publish</button>
          </div>
        ) : (
          <>
            <p className={styles.notice}>Publish to {count ?? 'the targeted'} recipient(s)? This cannot be undone from here.</p>
            <div className={styles.actions}>
              <button type="button" onClick={handlePublish}>Publish</button>
              <button type="button" onClick={() => setConfirming(false)}>Back</button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
