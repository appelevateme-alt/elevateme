import { useState } from 'react';
import { PageHeading } from '../../components/PageHeading';
import { ApiError } from '../../lib/api';
import { adminCreateDevelopment, adminAssignDevelopment, removeAssignee } from '../../features/development/api';
import { dedupe } from '../../features/admin-targeting/types';
import styles from './AdminPhase5.module.css';

/**
 * /admin/development — builder + assign + removal.
 * Builder + assign are separate steps (two calls, never combined).
 */
export function AdminDevelopmentPage() {
  const [details, setDetails] = useState('');
  const [date, setDate] = useState('');
  const [capacity, setCapacity] = useState('');
  const [billingType, setBillingType] = useState('FREE');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('LKR');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [partner, setPartner] = useState('');
  const [deadline, setDeadline] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [assignIds, setAssignIds] = useState('');
  const [assignInstitution, setAssignInstitution] = useState('');
  const [assignSkill, setAssignSkill] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [assignCount, setAssignCount] = useState<number | null>(null);
  const [removeStudentId, setRemoveStudentId] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuild() {
    setError(null);
    if (!details.trim()) {
      setError('Details are required.');
      return;
    }
    try {
      const created = await adminCreateDevelopment({
        details: details.trim(),
        date: date.trim() || null,
        capacity: capacity.trim() === '' ? null : Number(capacity),
        billingType: billingType.trim() || null,
        price: price.trim() === '' ? null : Number(price),
        currency: currency.trim() || null,
        paymentUrl: paymentUrl.trim() || null,
        partner: partner.trim() || null,
        deadline: deadline.trim() || null,
      });
      setCreatedId(created.id);
      setStep(2);
      setNotice('Draft built. Now assign it (separate step).');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Build failed.');
    }
  }

  async function handleAssign() {
    if (!createdId) return;
    setError(null);
    try {
      const ids = dedupe(assignIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
      const institutionId = assignInstitution.trim();
      const skill = assignSkill.trim();
      // Backend AssignRequest: explicit IDs and/or an institution audience rule.
      // Skill is sent as the criterion hint; the server currently matches by
      // institution only and records skill context in the reason line.
      const audienceRule = institutionId || skill
        ? {
          institutionId: institutionId || null,
          criterion: skill || null,
          comparator: null,
          threshold: null,
        }
        : null;
      const reasonParts = [assignReason.trim(), skill ? `Skill focus: ${skill}` : '']
        .filter(Boolean)
        .join(' · ');
      const res = await adminAssignDevelopment(createdId, {
        recipientIds: ids,
        audienceRule,
        reason: reasonParts || null,
      });
      setAssignCount((res as { assigned?: number }).assigned ?? ids.length);
      setNotice(`Assigned to ${(res as { assigned?: number }).assigned ?? ids.length} student(s).`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Assign failed.');
    }
  }

  async function handleRemove() {
    if (!createdId || !removeStudentId.trim()) {
      setError('A draft and a student are required for removal.');
      return;
    }
    setError(null);
    try {
      await removeAssignee(createdId, removeStudentId.trim());
      setNotice('Removed. Confirmed registrations are never silently cancelled.');
      setRemoveStudentId('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Removal failed.');
    }
  }

  return (
    <main className={styles.page} data-testid="page-admin-development">
      <PageHeading title="Development" desc="Step 1 builds the program. Step 2 assigns it." />
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <section aria-label="Step 1 — build">
        <h2>Step 1 — Build</h2>
        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          <label className={styles.field}>Details
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} aria-label="Development details" />
          </label>
          <label className={styles.field}>Date (optional)
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-06-01" aria-label="Date" />
          </label>
          <label className={styles.field}>Capacity (optional)
            <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" aria-label="Capacity" />
          </label>
          <label className={styles.field}>Billing type
            <select value={billingType} onChange={(e) => setBillingType(e.target.value)} aria-label="Billing type">
              <option value="FREE">FREE</option>
              <option value="PAID">PAID</option>
            </select>
          </label>
          <label className={styles.field}>Price (blank = free)
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" aria-label="Price" />
          </label>
          <label className={styles.field}>Currency
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" />
          </label>
          <label className={styles.field}>Payment URL (external, PAID only)
            <input value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} aria-label="Payment URL" />
          </label>
          <label className={styles.field}>Partner (optional)
            <input value={partner} onChange={(e) => setPartner(e.target.value)} aria-label="Partner" />
          </label>
          <label className={styles.field}>Deadline (optional)
            <input value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="2026-06-01" aria-label="Deadline" />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={handleBuild}>Build draft</button>
          </div>
        </form>
      </section>
      <section aria-label="Step 2 — assign" className={styles.section}>
        <h2>Step 2 — Assign</h2>
        {step === 1 && <p className={styles.meta}>Build the draft first; assignment is a separate action.</p>}
        {step === 2 && (
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <p className={styles.meta}>Draft ready. Assign it to students.</p>
            <p className={styles.meta}>
              Only approved students are assigned. Repeat IDs are counted once.
              Students who are not assigned cannot see this event.
            </p>
            <label className={styles.field}>Student IDs (comma-separated)
              <input value={assignIds} onChange={(e) => setAssignIds(e.target.value)} aria-label="Assign student IDs" />
            </label>
            <label className={styles.field}>Institution (optional, adds everyone there)
              <input
                value={assignInstitution}
                onChange={(e) => setAssignInstitution(e.target.value)}
                aria-label="Assign institution"
                placeholder="Exact institute name"
              />
            </label>
            <label className={styles.field}>Skill focus (optional, recorded with the reason)
              <input
                value={assignSkill}
                onChange={(e) => setAssignSkill(e.target.value)}
                aria-label="Assign skill focus"
                placeholder="For example: public speaking"
              />
            </label>
            <label className={styles.field}>Reason (optional)
              <input value={assignReason} onChange={(e) => setAssignReason(e.target.value)} aria-label="Assign reason" />
            </label>
            <div className={styles.actions}>
              <button type="button" onClick={handleAssign}>Assign</button>
            </div>
            {assignCount != null && <p className={styles.meta}>Assigned: {assignCount}</p>}
          </form>
        )}
      </section>
      <section aria-label="Removal" className={styles.section}>
        <h2>Removal</h2>
        <p className={styles.meta}>
          Removing blocks new registration
          but never silently cancels a confirmed registration.
        </p>
        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          <label className={styles.field}>Student ID to remove
            <input value={removeStudentId} onChange={(e) => setRemoveStudentId(e.target.value)} aria-label="Remove student ID" />
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={handleRemove} disabled={!createdId}>Remove</button>
          </div>
        </form>
      </section>
    </main>
  );
}
