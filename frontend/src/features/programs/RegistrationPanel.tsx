import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { registerForProgram } from './api';
import { buildRegistrationSummary, conflictCopyFor409, nextStepsForStatus, registrationRequiresChoice, remainingCapacity } from './helpers';
import type { Program, Registration } from './types';
import styles from './RegistrationPanel.module.css';

/**
 * Registration panel: dynamic committee/country/session choices per program type,
 * confirmation summary before POST, 409 => inline error, result shows exact
 * status + next steps. Never infers attendance from registration.
 */
export function RegistrationPanel({ program }: { program: Program }) {
  const need = registrationRequiresChoice(program.kind);
  const committees = program.committees ?? [];
  const sessions = program.sessions ?? [];
  const [committee, setCommittee] = useState('');
  const [country, setCountry] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Registration | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const countries = useMemo(() => {
    const c = committees.find((k) => k.name === committee || k.id === committee);
    return c?.countries ?? [];
  }, [committees, committee]);

  const left = remainingCapacity(program);
  const choiceValid =
    (need === 'none' ? true : need === 'session' ? sessionId !== '' : committee !== '' && country !== '');

  const summary = buildRegistrationSummary(program.title, { committee, country, sessionId });

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const reg = await registerForProgram(program.id, {
        committee: committee || undefined,
        country: country || undefined,
        sessionId: sessionId || undefined,
      });
      setResult(reg);
      setConfirming(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(conflictCopyFor409(e));
      } else if (e instanceof ApiError && e.status === 422) {
        const inline = e.fieldErrors.length > 0 ? e.fieldErrors.map((f) => `${f.field}: ${f.message}`).join(' ') : e.message;
        setError(inline);
      } else if (e instanceof ApiError) {
        setError(`${e.message} (code ${e.code})`);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className={styles.panel} data-testid="registration-result" aria-live="polite">
        <h2>Registration {result.status}</h2>
        <p>
          Status: <strong>{result.status}</strong>
        </p>
        <p>{nextStepsForStatus(result.status)}</p>
        {result.allocation && <p>Allocation: {result.allocation}</p>}
      </section>
    );
  }

  return (
    <section className={styles.panel} data-testid="registration-panel" aria-label="Registration">
      <h2>Register</h2>
      <p className={styles.meta}>
        {left} of {program.capacity} seats remaining.
      </p>
      {need === 'committee-country' && (
        <>
          <label className={styles.field}>
            Committee
            <select value={committee} onChange={(e) => { setCommittee(e.target.value); setCountry(''); }} required>
              <option value="">Select a committee</option>
              {committees.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Country
            <select value={country} onChange={(e) => setCountry(e.target.value)} required disabled={!committee}>
              <option value="">Select a country</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {need === 'session' && (
        <label className={styles.field}>
          Session
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} required>
            <option value="">Select a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} — {s.startsAt}</option>
            ))}
          </select>
        </label>
      )}
      {error && <p ref={errorRef} tabIndex={-1} data-testid="registration-error" className={styles.error} role="alert">{error}</p>}
      {!confirming ? (
        <button type="button" disabled={!choiceValid || left <= 0} onClick={() => setConfirming(true)}>
          {left <= 0 ? 'Program full' : 'Review registration'}
        </button>
      ) : (
        <div className={styles.confirm} data-testid="registration-confirm">
          <h3>{summary.title}</h3>
          <ul>
            {summary.lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <div className={styles.actions}>
            <button type="button" onClick={() => setConfirming(false)}>Back</button>
            <button type="button" disabled={submitting} onClick={submit}>
              {submitting ? 'Submitting…' : 'Confirm & register'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
