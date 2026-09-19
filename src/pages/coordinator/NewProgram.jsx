import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { Alert, Progress } from '../../components/ui/Feedback.jsx';
import { DefinitionList } from '../../components/ui/Data.jsx';

const STEPS = ['Basics', 'Schedule and location', 'Program structure', 'Registration rules', 'Media and description', 'Review and submit'];

export default function NewProgram() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('SingleEvent');
  const [eventType, setEventType] = useState('ModelUN');
  const [venue, setVenue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [capacity, setCapacity] = useState('60');
  const [structure, setStructure] = useState('UNHRC — Committee A; DISEC — Committee B');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const warn = (e) => { if (dirty && !submitted) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, submitted]);

  const validate = (s) => {
    if (s === 1 && !title.trim()) return ['Enter a program title.'];
    if (s === 2 && (!start || !end || !venue.trim())) return ['Enter start date, end date, and venue.'];
    if (s === 3 && !structure.trim()) return ['Describe committees, sessions, or tracks.'];
    if (s === 4 && (!capacity || Number(capacity) < 1)) return ['Capacity must be at least 1.'];
    return [];
  };

  if (submitted) {
    return (
      <div>
        <Eyebrow>Program builder</Eyebrow>
        <PageHeader title="Submitted for approval" description="Your draft entered Submitted → Under Review. Editing is now restricted." />
        <Alert tone="success" title="What happens next">
          An administrator reviews <strong>{title || 'your program'}</strong> and approves, requests changes, or rejects it.
          Approved events publish to the public directory and student app.
        </Alert>
        <div className="row" style={{ marginTop: 16 }}>
          <Link to="/coordinator/programs" className="btn">Back to programs</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Program builder</Eyebrow>
      <PageHeader
        title="New program"
        description="Progressive steps. Save draft stays visible; review mirrors the public display."
        action={<Button variant="secondary" onClick={() => { setSavedAt(new Date().toLocaleTimeString()); setDirty(false); }}>Save draft{savedAt ? ` · saved ${savedAt}` : ''}</Button>}
      />
      <div className="builder-grid">
        <ol aria-label="Builder steps" className="step-list">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button onClick={() => setStep(i + 1)} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'active' : ''}>
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
        <div>
          <Progress value={step} max={STEPS.length} label={STEPS[step - 1]} />
          {errors.length > 0 && (
            <div role="alert" className="alert alert-danger">
              <ul className="list-plain">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          <Card title={STEPS[step - 1]} meta={`Step ${step} of ${STEPS.length}`}>
            {step === 1 && (
              <div className="form-stack">
                <Field label="Title"><TextInput value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="e.g. Model United Nations — Colombo 2026" /></Field>
                <Field label="Category">
                  <Select value={category} onChange={(e) => { setCategory(e.target.value); setDirty(true); }}>
                    <option value="SingleEvent">Single Event</option>
                    <option value="ContinuousProgramme">Continuous Programme</option>
                    <option value="SpecialProgramme">Special Programme</option>
                  </Select>
                </Field>
                {category === 'SingleEvent' && (
                  <Field label="Single-event type">
                    <Select value={eventType} onChange={(e) => { setEventType(e.target.value); setDirty(true); }}>
                      <option value="ModelUN">Model United Nations</option>
                      <option value="FriendlyDebate">Friendly Debate</option>
                      <option value="Competition">Competition</option>
                      <option value="Special">Special</option>
                    </Select>
                  </Field>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="form-stack">
                <Field label="Venue or online link"><TextInput value={venue} onChange={(e) => { setVenue(e.target.value); setDirty(true); }} placeholder="Main Hall, Colombo / https://…" /></Field>
                <div className="grid-2">
                  <Field label="Start date"><TextInput type="date" value={start} onChange={(e) => { setStart(e.target.value); setDirty(true); }} /></Field>
                  <Field label="End date"><TextInput type="date" value={end} onChange={(e) => { setEnd(e.target.value); setDirty(true); }} /></Field>
                </div>
              </div>
            )}
            {step === 3 && (
              <div className="form-stack">
                {category === 'SingleEvent' && eventType === 'ModelUN' && <Alert tone="info" title="MUN structure">Add committees plus optional country/portfolio choices.</Alert>}
                {category === 'SingleEvent' && eventType === 'FriendlyDebate' && <Alert tone="info" title="Debate structure">Add sessions, motions/topics, teams, and dates.</Alert>}
                {category === 'ContinuousProgramme' && <Alert tone="info" title="Continuous structure">Add recurring sessions, cohort dates, and attendance expectations.</Alert>}
                {category === 'SpecialProgramme' && <Alert tone="info" title="Special programme">Generic structure for MVP — describe the format below.</Alert>}
                <Field label="Committees / sessions / tracks">
                  <textarea className="textarea" value={structure} onChange={(e) => { setStructure(e.target.value); setDirty(true); }} />
                </Field>
              </div>
            )}
            {step === 4 && (
              <div className="form-stack">
                <Field label="Capacity"><TextInput type="number" min={1} value={capacity} onChange={(e) => { setCapacity(e.target.value); setDirty(true); }} /></Field>
                <Field label="Eligibility" hint="Validated again on registration."><TextInput placeholder="e.g. Open to all registered students" /></Field>
              </div>
            )}
            {step === 5 && (
              <div className="form-stack">
                <Field label="Cover image" hint="JPG or PNG, max 5 MB."><TextInput type="file" accept="image/png,image/jpeg" /></Field>
                <Field label="Description">
                  <textarea className="textarea" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} placeholder="Public description, contact, visibility…" />
                </Field>
              </div>
            )}
            {step === 6 && (
              <div>
                <p className="em-meta">Review mirrors the eventual public display.</p>
                <div style={{ marginTop: 8 }}>
                  <DefinitionList
                    items={[
                      ['Title', title || '—'],
                      ['Type', category === 'SingleEvent' ? eventType : category],
                      ['Schedule', `${start || '—'} → ${end || '—'} · ${venue || '—'}`],
                      ['Capacity', capacity],
                      ['Structure', structure || '—'],
                      ['Description', description || '—'],
                    ]}
                  />
                </div>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
              <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</Button>
              {step < STEPS.length ? (
                <Button onClick={() => { const list = validate(step); setErrors(list); if (list.length === 0) setStep((s) => s + 1); }}>Continue</Button>
              ) : (
                <Button onClick={() => { const all = [1, 2, 3, 4].flatMap(validate); setErrors(all); if (all.length === 0) setSubmitted(true); }}>Submit for approval</Button>
              )}
            </div>
          </Card>
          {dirty && <p className="em-meta" style={{ marginTop: 8 }}>Unsaved changes — use Save draft before leaving.</p>}
        </div>
      </div>
    </div>
  );
}
