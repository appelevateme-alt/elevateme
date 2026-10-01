import { useEffect, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { EventRow } from '../../components/EventRow';
import { ApiError } from '../../lib/api';
import { createProgram, saveProgramDraft, submitProgram } from '../../features/programs/api';
import { conflictCopyFor409 } from '../../features/programs/helpers';
import {
  basicsSchema, datesLocationSchema, rulesSchema, sessionInputSchema, sessionsSchema,
  type BasicsInput, type DatesLocationInput, type RulesInput, type SessionInput,
} from '../../features/programs/schemas';
import styles from './ProgramBuilderPage.module.css';

const STEPS = ['Basics, type & theme', 'Dates & location', 'Sessions & committees', 'Registration rules', 'Preview & submit'];

/**
 * /staff/programs/new — 5-step builder.
 * RHF per step + Zod validation via zodResolver on step advance; explicit Save draft always
 * visible (sticky bar, no silent autosave); beforeunload + router blocker
 * warn on unsaved changes; submit => POST /programs then POST /submit.
 * A11y: per-field errors (formState.errors + aria-describedby), focusable
 * step-error summary (ref + tabIndex=-1 + focus on fail, input preserved).
 */
export function ProgramBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitKind, setSubmitKind] = useState<'forbidden' | 'not-found' | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});

  const stepErrorRef = useRef<HTMLParagraphElement>(null);
  const submitErrorRef = useRef<HTMLParagraphElement>(null);

  const basics = useForm<BasicsInput>({
    resolver: zodResolver(basicsSchema),
    defaultValues: { title: '', description: '', kind: 'MUN', theme: '', subtype: '', organizer: '', munCommittees: '', debateTopic: '' },
    mode: 'onTouched',
  });
  const dates = useForm<DatesLocationInput>({
    resolver: zodResolver(datesLocationSchema),
    defaultValues: { startsAt: '', endsAt: '', location: '', registrationDeadline: '' },
    mode: 'onTouched',
  });
  const rules = useForm<RulesInput>({
    resolver: zodResolver(rulesSchema),
    defaultValues: { capacity: 1, eligibility: '', visibility: 'PUBLISHED_PUBLIC' },
    mode: 'onTouched',
  });
  const [sessions, setSessions] = useState<SessionInput[]>([]);
  const [committees, setCommittees] = useState<Array<{ name: string; countries: string }>>([]);
  const [draftSession, setDraftSession] = useState<SessionInput>({ title: '', startsAt: '', endsAt: '', location: '', committee: '', capacity: undefined });

  const kind = basics.watch('kind');
  const basicsErrors = basics.formState.errors;
  const datesErrors = dates.formState.errors;
  const rulesErrors = rules.formState.errors;

  useEffect(() => {
    setDirty(true);
  }, [basics.watch('title'), basics.watch('description'), basics.watch('theme')]);

  // Focusable error summaries: move focus to summary on fail, preserve input values.
  useEffect(() => {
    if (stepError) stepErrorRef.current?.focus();
  }, [stepError]);

  useEffect(() => {
    if (submitError) submitErrorRef.current?.focus();
  }, [submitError]);

  // Unsaved-change warning: tab close/refresh.
  useEffect(() => {
    if (!dirty || done) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty, done]);

  // Unsaved-change warning: in-app navigation (react-router blocker).
  const blocker = useBlocker(dirty && !done);
  useEffect(() => {
    if (blocker.state === 'blocked') {
      const ok = window.confirm('You have unsaved changes. Leave without saving as draft?');
      if (ok) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  function markDirty() {
    setDirty(true);
  }

  async function nextFromBasics() {
    const ok = await basics.trigger();
    const r = basicsSchema.safeParse(basics.getValues());
    if (!ok || !r.success) {
      const msg = !r.success
        ? r.error.issues.map((i) => `${String(i.path[0] || 'field')}: ${i.message}`).join(' ')
        : 'Please fix the highlighted fields.';
      setStepError(msg);
      return;
    }
    setStepError(null);
    setStep(1);
  }

  async function nextFromDates() {
    const ok = await dates.trigger();
    const r = datesLocationSchema.safeParse(dates.getValues());
    if (!ok || !r.success) {
      const msg = !r.success
        ? r.error.issues.map((i) => `${String(i.path[0] || 'field')}: ${i.message}`).join(' ')
        : 'Please fix the highlighted fields.';
      setStepError(msg);
      return;
    }
    setStepError(null);
    setStep(2);
  }

  function nextFromSessions() {
    const r = sessionsSchema.safeParse({ sessions, committees });
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' ');
      setStepError(msg);
      // Map session/committee issues to draft-level hints where possible.
      const mapped: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const key = String(issue.path[1] ?? issue.path[0] ?? 'sessions');
        if (!mapped[key]) mapped[key] = issue.message;
      }
      setDraftErrors(mapped);
      return;
    }
    setDraftErrors({});
    setStepError(null);
    setStep(3);
  }

  async function nextFromRules() {
    const ok = await rules.trigger();
    const r = rulesSchema.safeParse(rules.getValues());
    if (!ok || !r.success) {
      const msg = !r.success
        ? r.error.issues.map((i) => `${String(i.path[0] || 'field')}: ${i.message}`).join(' ')
        : 'Please fix the highlighted fields.';
      setStepError(msg);
      return;
    }
    setStepError(null);
    setStep(4);
  }

  function addSession() {
    const r = sessionInputSchema.safeParse(draftSession);
    if (!r.success) {
      const msg = r.error.issues.map((i) => `${String(i.path[0] || 'field')}: ${i.message}`).join(' ');
      setStepError(msg);
      const mapped: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const key = String(issue.path[0] || 'field');
        if (!mapped[key]) mapped[key] = issue.message;
      }
      setDraftErrors(mapped);
      return;
    }
    setDraftErrors({});
    setStepError(null);
    setSessions((s) => [...s, r.data]);
    setDraftSession({ title: '', startsAt: '', endsAt: '', location: '', committee: '', capacity: undefined });
    markDirty();
  }

  function payload() {
    const b = basics.getValues();
    const d = dates.getValues();
    const r = rules.getValues();
    return {
      title: b.title,
      description: b.description,
      kind: b.kind,
      theme: b.theme,
      subtype: b.subtype || undefined,
      organizer: b.organizer || undefined,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      location: d.location,
      registrationDeadline: d.registrationDeadline || undefined,
      capacity: Number(r.capacity),
      eligibility: r.eligibility || undefined,
      visibility: r.visibility,
      sessions: sessions.map((s) => ({ ...s, capacity: s.capacity == null ? undefined : Number(s.capacity) })),
      committees: committees.map((c, i) => ({
        name: c.name,
        countries: c.countries.split(',').map((x) => x.trim()).filter(Boolean),
        id: String(i),
      })),
    };
  }

  /** Explicit Save draft — always visible in the sticky bar. No silent autosave. */
  async function saveDraft() {
    setSaveState('saving');
    setSubmitError(null);
    setSubmitKind(null);
    try {
      const body = payload();
      if (!body.title.trim()) {
        setSubmitError('Title is required before saving a draft.');
        setSaveState('error');
        return;
      }
      if (draftId) {
        await saveProgramDraft(draftId, body);
      } else {
        const created = await createProgram({ ...body, sessions: body.sessions.length > 0 ? body.sessions : [{ title: 'TBD', startsAt: body.startsAt || new Date().toISOString(), endsAt: body.endsAt || new Date().toISOString() }] });
        setDraftId(created.id);
      }
      setSaveState('saved');
      setDirty(false);
    } catch (e) {
      setSaveState('error');
      if (e instanceof ApiError && e.status === 403) {
        setSubmitKind('forbidden');
        setSubmitError(`${e.message} (code ${e.code})`);
      } else if (e instanceof ApiError && e.status === 404) {
        setSubmitKind('not-found');
        setSubmitError(`${e.message} (code ${e.code})`);
      } else if (e instanceof ApiError && e.status === 409) {
        setSubmitError(conflictCopyFor409(e));
      } else {
        setSubmitError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Saving draft failed.');
      }
    }
  }

  async function submitAll() {
    setSubmitError(null);
    setSubmitKind(null);
    try {
      const body = payload();
      const created = draftId ? { id: draftId } : await createProgram(body);
      await submitProgram(created.id);
      setCreatedId(created.id);
      setDone(true);
      setDirty(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSubmitKind('forbidden');
        setSubmitError(`${e.message} (code ${e.code})`);
      } else if (e instanceof ApiError && e.status === 404) {
        setSubmitKind('not-found');
        setSubmitError(`${e.message} (code ${e.code})`);
      } else if (e instanceof ApiError && e.status === 409) {
        setSubmitError(conflictCopyFor409(e));
      } else {
        setSubmitError(e instanceof ApiError ? `${e.message} (code ${e.code})` : 'Submit failed.');
      }
    }
  }

  if (done) {
    return (
      <main className={styles.page} data-testid="builder-success">
        <PageHeading title="Program submitted" desc="Your program is now in review." />
        <EmptyState
          title="Restricted edits from here"
          body="The program moved to SUBMITTED. Further edits are restricted — contact a coordinator for changes while it is under review."
          action={<button onClick={() => navigate(`/staff/programs/${createdId ?? ''}`)}>Open program workspace</button>}
        />
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="program-builder">
      <PageHeading title="New program" desc="5-step builder. Save a draft explicitly — nothing is autosaved." />
      <div className={styles.layout}>
        <ol className={styles.steps} aria-label="Builder steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={i === step ? styles.current : i < step ? styles.past : ''}>
              <button type="button" onClick={() => setStep(i)} disabled={i > step}>{i + 1}. {s}</button>
            </li>
          ))}
        </ol>
        <div className={styles.mobileProgress} role="status" aria-label="Progress">Step {step + 1} of {STEPS.length}: {STEPS[step]}</div>
        <section className={styles.body} aria-label={STEPS[step]}>
          {stepError && <p ref={stepErrorRef} tabIndex={-1} role="alert" data-testid="builder-step-error" className={styles.error}>{stepError}</p>}

          {step === 0 && (
            <div className={styles.grid}>
              <label htmlFor="basics-title">Title*</label>
              <input
                id="basics-title"
                {...basics.register('title', { onChange: markDirty })}
                aria-invalid={!!basicsErrors.title}
                aria-describedby={basicsErrors.title ? 'basics-title-error' : undefined}
              />
              {basicsErrors.title && <span id="basics-title-error" role="alert" className={styles.fieldError}>{basicsErrors.title.message}</span>}
              <label htmlFor="basics-description">Description</label>
              <textarea
                id="basics-description"
                {...basics.register('description', { onChange: markDirty })}
                rows={4}
                aria-invalid={!!basicsErrors.description}
                aria-describedby={basicsErrors.description ? 'basics-description-error' : undefined}
              />
              {basicsErrors.description && <span id="basics-description-error" role="alert" className={styles.fieldError}>{basicsErrors.description.message}</span>}
              <label htmlFor="basics-kind">Type*</label>
              <select
                id="basics-kind"
                {...basics.register('kind', { onChange: markDirty })}
                aria-invalid={!!basicsErrors.kind}
                aria-describedby={basicsErrors.kind ? 'basics-kind-error' : undefined}
              >
                <option value="MUN">MUN</option>
                <option value="DEBATE">Debate</option>
                <option value="CONTINUOUS">Continuous</option>
              </select>
              {basicsErrors.kind && <span id="basics-kind-error" role="alert" className={styles.fieldError}>{basicsErrors.kind.message}</span>}
              <label htmlFor="basics-theme">Theme*</label>
              <input
                id="basics-theme"
                {...basics.register('theme', { onChange: markDirty })}
                placeholder="e.g. Diplomacy"
                aria-invalid={!!basicsErrors.theme}
                aria-describedby={basicsErrors.theme ? 'basics-theme-error' : undefined}
              />
              {basicsErrors.theme && <span id="basics-theme-error" role="alert" className={styles.fieldError}>{basicsErrors.theme.message}</span>}
              <label htmlFor="basics-subtype">Subtype</label>
              <input
                id="basics-subtype"
                {...basics.register('subtype', { onChange: markDirty })}
                aria-invalid={!!basicsErrors.subtype}
                aria-describedby={basicsErrors.subtype ? 'basics-subtype-error' : undefined}
              />
              {basicsErrors.subtype && <span id="basics-subtype-error" role="alert" className={styles.fieldError}>{basicsErrors.subtype.message}</span>}
              <label htmlFor="basics-organizer">Organizer</label>
              <input
                id="basics-organizer"
                {...basics.register('organizer', { onChange: markDirty })}
                aria-invalid={!!basicsErrors.organizer}
                aria-describedby={basicsErrors.organizer ? 'basics-organizer-error' : undefined}
              />
              {basicsErrors.organizer && <span id="basics-organizer-error" role="alert" className={styles.fieldError}>{basicsErrors.organizer.message}</span>}
              {kind === 'MUN' && (
                <>
                  <label htmlFor="basics-munCommittees">MUN committees (comma-separated)</label>
                  <input
                    id="basics-munCommittees"
                    {...basics.register('munCommittees', { onChange: markDirty })}
                    placeholder="UNSC, WHO"
                    aria-invalid={!!basicsErrors.munCommittees}
                    aria-describedby={basicsErrors.munCommittees ? 'basics-munCommittees-error' : undefined}
                  />
                  {basicsErrors.munCommittees && <span id="basics-munCommittees-error" role="alert" className={styles.fieldError}>{basicsErrors.munCommittees.message}</span>}
                </>
              )}
              {kind === 'DEBATE' && (
                <>
                  <label htmlFor="basics-debateTopic">Debate topic / session seed</label>
                  <input
                    id="basics-debateTopic"
                    {...basics.register('debateTopic', { onChange: markDirty })}
                    placeholder="Motion or topic"
                    aria-invalid={!!basicsErrors.debateTopic}
                    aria-describedby={basicsErrors.debateTopic ? 'basics-debateTopic-error' : undefined}
                  />
                  {basicsErrors.debateTopic && <span id="basics-debateTopic-error" role="alert" className={styles.fieldError}>{basicsErrors.debateTopic.message}</span>}
                </>
              )}
              {kind === 'CONTINUOUS' && (
                <p className={styles.note}>Continuous programs need explicit recurring sessions — add each session in step 3. No implied cadence.</p>
              )}
              <div className={styles.nav}><span /><button type="button" onClick={() => void nextFromBasics()}>Continue →</button></div>
            </div>
          )}

          {step === 1 && (
            <div className={styles.grid}>
              <label htmlFor="dates-startsAt">Starts at*</label>
              <input
                id="dates-startsAt"
                type="datetime-local"
                {...dates.register('startsAt', { onChange: markDirty })}
                aria-invalid={!!datesErrors.startsAt}
                aria-describedby={datesErrors.startsAt ? 'dates-startsAt-error' : undefined}
              />
              {datesErrors.startsAt && <span id="dates-startsAt-error" role="alert" className={styles.fieldError}>{datesErrors.startsAt.message}</span>}
              <label htmlFor="dates-endsAt">Ends at*</label>
              <input
                id="dates-endsAt"
                type="datetime-local"
                {...dates.register('endsAt', { onChange: markDirty })}
                aria-invalid={!!datesErrors.endsAt}
                aria-describedby={datesErrors.endsAt ? 'dates-endsAt-error' : undefined}
              />
              {datesErrors.endsAt && <span id="dates-endsAt-error" role="alert" className={styles.fieldError}>{datesErrors.endsAt.message}</span>}
              <label htmlFor="dates-location">Location*</label>
              <input
                id="dates-location"
                {...dates.register('location', { onChange: markDirty })}
                aria-invalid={!!datesErrors.location}
                aria-describedby={datesErrors.location ? 'dates-location-error' : undefined}
              />
              {datesErrors.location && <span id="dates-location-error" role="alert" className={styles.fieldError}>{datesErrors.location.message}</span>}
              <label htmlFor="dates-deadline">Registration deadline</label>
              <input
                id="dates-deadline"
                type="datetime-local"
                {...dates.register('registrationDeadline', { onChange: markDirty })}
                aria-invalid={!!datesErrors.registrationDeadline}
                aria-describedby={datesErrors.registrationDeadline ? 'dates-deadline-error' : undefined}
              />
              {datesErrors.registrationDeadline && <span id="dates-deadline-error" role="alert" className={styles.fieldError}>{datesErrors.registrationDeadline.message}</span>}
              <div className={styles.nav}><button type="button" onClick={() => setStep(0)}>← Back</button><button type="button" onClick={() => void nextFromDates()}>Continue →</button></div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3>Sessions ({sessions.length}) — at least one required</h3>
              <ul>
                {sessions.map((s, i) => (
                  <li key={`${s.title}-${i}`}>{s.title} — {s.startsAt} → {s.endsAt}{s.committee ? ` · ${s.committee}` : ''}
                    <button type="button" onClick={() => { setSessions((p) => p.filter((_, j) => j !== i)); markDirty(); }}>Remove</button>
                  </li>
                ))}
              </ul>
              <div className={styles.grid}>
                <label htmlFor="draft-title">Session title*</label>
                <input
                  id="draft-title"
                  value={draftSession.title}
                  onChange={(e) => setDraftSession({ ...draftSession, title: e.target.value })}
                  aria-invalid={!!draftErrors['title']}
                  aria-describedby={draftErrors['title'] ? 'draft-title-error' : undefined}
                />
                {draftErrors['title'] && <span id="draft-title-error" role="alert" className={styles.fieldError}>{draftErrors['title']}</span>}
                <label htmlFor="draft-startsAt">Starts*</label>
                <input
                  id="draft-startsAt"
                  type="datetime-local"
                  value={draftSession.startsAt}
                  onChange={(e) => setDraftSession({ ...draftSession, startsAt: e.target.value })}
                  aria-invalid={!!draftErrors['startsAt']}
                  aria-describedby={draftErrors['startsAt'] ? 'draft-startsAt-error' : undefined}
                />
                {draftErrors['startsAt'] && <span id="draft-startsAt-error" role="alert" className={styles.fieldError}>{draftErrors['startsAt']}</span>}
                <label htmlFor="draft-endsAt">Ends*</label>
                <input
                  id="draft-endsAt"
                  type="datetime-local"
                  value={draftSession.endsAt}
                  onChange={(e) => setDraftSession({ ...draftSession, endsAt: e.target.value })}
                  aria-invalid={!!draftErrors['endsAt']}
                  aria-describedby={draftErrors['endsAt'] ? 'draft-endsAt-error' : undefined}
                />
                {draftErrors['endsAt'] && <span id="draft-endsAt-error" role="alert" className={styles.fieldError}>{draftErrors['endsAt']}</span>}
                <label htmlFor="draft-committee">Committee / topic</label>
                <input
                  id="draft-committee"
                  value={draftSession.committee ?? ''}
                  onChange={(e) => setDraftSession({ ...draftSession, committee: e.target.value })}
                  aria-invalid={!!draftErrors['committee']}
                  aria-describedby={draftErrors['committee'] ? 'draft-committee-error' : undefined}
                />
                {draftErrors['committee'] && <span id="draft-committee-error" role="alert" className={styles.fieldError}>{draftErrors['committee']}</span>}
                <label htmlFor="draft-capacity">Capacity</label>
                <input
                  id="draft-capacity"
                  type="number"
                  min={1}
                  value={draftSession.capacity ?? ''}
                  onChange={(e) => setDraftSession({ ...draftSession, capacity: e.target.value === '' ? undefined : Number(e.target.value) })}
                  aria-invalid={!!draftErrors['capacity']}
                  aria-describedby={draftErrors['capacity'] ? 'draft-capacity-error' : undefined}
                />
                {draftErrors['capacity'] && <span id="draft-capacity-error" role="alert" className={styles.fieldError}>{draftErrors['capacity']}</span>}
                <div><button type="button" onClick={addSession}>Add session</button></div>
              </div>
              {kind === 'MUN' && (
                <div>
                  <h3>Committees & countries</h3>
                  <button type="button" onClick={() => { setCommittees((c) => [...c, { name: '', countries: '' }]); markDirty(); }}>Add committee</button>
                  {committees.map((c, i) => (
                    <div key={i} className={styles.grid}>
                      <label htmlFor={`committee-${i}-name`}>Committee</label>
                      <input id={`committee-${i}-name`} value={c.name} onChange={(e) => setCommittees((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <label htmlFor={`committee-${i}-countries`}>Countries (comma-separated)</label>
                      <input id={`committee-${i}-countries`} value={c.countries} onChange={(e) => setCommittees((p) => p.map((x, j) => j === i ? { ...x, countries: e.target.value } : x))} />
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.nav}><button type="button" onClick={() => setStep(1)}>← Back</button><button type="button" onClick={nextFromSessions}>Continue →</button></div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.grid}>
              <label htmlFor="rules-capacity">Capacity (int ≥ 1)*</label>
              <input
                id="rules-capacity"
                type="number"
                min={1}
                step={1}
                {...rules.register('capacity', { onChange: markDirty, valueAsNumber: true })}
                aria-invalid={!!rulesErrors.capacity}
                aria-describedby={rulesErrors.capacity ? 'rules-capacity-error' : undefined}
              />
              {rulesErrors.capacity && <span id="rules-capacity-error" role="alert" className={styles.fieldError}>{String(rulesErrors.capacity.message)}</span>}
              <label htmlFor="rules-eligibility">Eligibility</label>
              <textarea
                id="rules-eligibility"
                {...rules.register('eligibility', { onChange: markDirty })}
                rows={3}
                aria-invalid={!!rulesErrors.eligibility}
                aria-describedby={rulesErrors.eligibility ? 'rules-eligibility-error' : undefined}
              />
              {rulesErrors.eligibility && <span id="rules-eligibility-error" role="alert" className={styles.fieldError}>{rulesErrors.eligibility.message}</span>}
              <label htmlFor="rules-visibility">Visibility</label>
              <select
                id="rules-visibility"
                {...rules.register('visibility', { onChange: markDirty })}
                aria-invalid={!!rulesErrors.visibility}
                aria-describedby={rulesErrors.visibility ? 'rules-visibility-error' : undefined}
              >
                <option value="PUBLISHED_PUBLIC">Standard (public)</option>
                <option value="PUBLISHED_TARGETED">Targeted development (invite-only)</option>
              </select>
              {rulesErrors.visibility && <span id="rules-visibility-error" role="alert" className={styles.fieldError}>{rulesErrors.visibility.message}</span>}
              <div className={styles.nav}><button type="button" onClick={() => setStep(2)}>← Back</button><button type="button" onClick={() => void nextFromRules()}>Review →</button></div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3>Preview — mirrors the public display</h3>
              <EventRow
                date={dates.getValues('startsAt')}
                kind={`${basics.getValues('kind')} · ${basics.getValues('theme')}`}
                title={basics.getValues('title') || '(untitled)'}
                meta={`${basics.getValues('description').slice(0, 140)} — ${basics.getValues('organizer')} — capacity ${rules.getValues('capacity')}`}
              />
              <ul>
                {sessions.map((s, i) => <li key={i}>{s.title} — {s.startsAt} → {s.endsAt}</li>)}
              </ul>
              {submitError && submitKind === 'forbidden' && <p ref={submitErrorRef} tabIndex={-1} role="alert" data-testid="forbidden" className={styles.error}>{submitError}</p>}
              {submitError && submitKind === 'not-found' && <p ref={submitErrorRef} tabIndex={-1} role="alert" data-testid="not-found" className={styles.error}>{submitError}</p>}
              {submitError && !submitKind && <p ref={submitErrorRef} tabIndex={-1} role="alert" className={styles.error}>{submitError}</p>}
              <div className={styles.nav}>
                <button type="button" onClick={() => setStep(3)}>← Back</button>
                <button type="button" onClick={() => void submitAll()}>Submit program</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className={styles.stickyBar} data-testid="builder-savebar">
        <button type="button" onClick={() => void saveDraft()} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : 'Save draft'}
        </button>
        <span role="status" aria-live="polite" className={styles.saveHint}>
          {saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Error — retry' : dirty ? 'Unsaved changes' : 'No unsaved changes'}
        </span>
        {submitError && step !== 4 && submitKind === 'forbidden' && <span role="alert" data-testid="forbidden" className={styles.error}>{submitError}</span>}
        {submitError && step !== 4 && submitKind === 'not-found' && <span role="alert" data-testid="not-found" className={styles.error}>{submitError}</span>}
        {submitError && step !== 4 && !submitKind && <span role="alert" className={styles.error}>{submitError}</span>}
      </div>
    </main>
  );
}
