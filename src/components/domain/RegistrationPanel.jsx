import { useState } from 'react';
import { Alert } from '../ui/Feedback.jsx';
import { Button } from '../ui/Button.jsx';
import { Field, Select } from '../ui/Field.jsx';

// Registration panel: relevant choices only, confirmation summary, exact
// post-submission state. Failed requests preserve input.
export function RegistrationPanel({ programTitle, sessions, closed }) {
  const [choice, setChoice] = useState(sessions[0]?.id || '');
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (closed) {
    return <Alert tone="warning" title="Registration closed">This program is no longer accepting registrations.</Alert>;
  }

  if (submitted) {
    const session = sessions.find((s) => s.id === choice);
    return (
      <Alert tone="success" title="Registration pending">
        Your request for <strong>{programTitle}</strong>
        {session && <> — <strong>{session.title}</strong></>} is <strong>Pending</strong>.
        A coordinator will confirm or waitlist it; you will be notified of the outcome.
      </Alert>
    );
  }

  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setError('');
        setSubmitting(true);
        setTimeout(() => {
          setSubmitting(false);
          if (!choice) {
            setError('Choose a session or committee before submitting. Your selection is preserved.');
            return;
          }
          setSubmitted(true);
        }, 600);
      }}
    >
      {sessions.length > 0 && (
        <Field label="Choose session / committee" hint="Only choices valid for this program type are shown.">
          <Select value={choice} onChange={(e) => { setChoice(e.target.value); setConfirming(false); }}>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} — {s.date}</option>
            ))}
          </Select>
        </Field>
      )}
      {confirming && (
        <Alert tone="info" title="Confirm your registration">
          {programTitle}
          {sessions.find((s) => s.id === choice) && <> — {sessions.find((s) => s.id === choice)?.title}</>}.
          Submitting creates a <strong>Pending</strong> registration for coordinator confirmation.
        </Alert>
      )}
      {error && <Alert tone="danger" title="Could not submit">{error}</Alert>}
      <div className="row">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : confirming ? 'Confirm registration' : 'Join this program'}
        </Button>
        {confirming && (
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
        )}
      </div>
      <p className="em-meta">Sign-in with a student profile is required. Duplicate, capacity, and eligibility checks run on submit.</p>
    </form>
  );
}
