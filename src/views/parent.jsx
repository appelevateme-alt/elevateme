import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, RecommendationRecord, ThreadMessage } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { toEvaluation, toProfile, toRecommendation, toReply, toThread } from '../lib/adapters.js';
import { total50 } from '../lib/scores.js';
import { useAuth } from '../lib/auth.jsx';
import { NotFound } from './public.jsx';

/* ---------- Parent overview (prototype) ---------- */
export function ParentOverview() {
  const { data: recRows } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 20 });
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 20 });
  const recs = (recRows || []).map(toRecommendation);
  const evals = (evalRows || []).map(toEvaluation);
  const topRec = recs[0];

  return (
    <div>
      <PageHead kicker="Parent overview" title="Nimuthu’s progress." desc="A clear summary of released performance, active programs and recommendations."
        action={<button className="button secondary" onClick={() => alert('One student linked — the switcher appears with more than one.')}>Switch student</button>} />
      <div className="notice">You are viewing information released for <strong>Nimuthu Fernando · EM-00124</strong>.</div>
      <div style={{ height: 22 }} />
      <Metrics items={[
        ['Overall total', '72 · 50 + 22', '+6 points this term'],
        ['Evaluations', evals.length > 0 ? String(evals.length).padStart(2, '0') : '06', 'All released'],
        ['Active programs', '02', 'Next session 24 October'],
        ['Open actions', recs.length > 0 ? String(recs.length).padStart(2, '0') : '02', '1 high priority'],
      ]} />
      <div className="grid two">
        <section className="panel">
          <div className="panel-head"><h2>Current development focus</h2><Link to="/parent/recommendations" className="button quiet small">All recommendations →</Link></div>
          <div className="panel-body">
            <Tag>{topRec?.skill || 'Counter Arguments'}</Tag>
            <h3 style={{ font: '700 1.5rem Manrope', margin: '10px 0' }}>{topRec?.title || 'Practice structured rebuttals'}</h3>
            <p style={{ color: 'var(--muted)' }}>{topRec?.body || 'This recommendation is connected to Nimuthu’s last two debate evaluations.'}</p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Latest performance</h2><Link to="/parent/performance" className="button quiet small">View detail →</Link></div>
          <div className="panel-body">
            <ChartSummary label="Overall total" value="72 · 50 + 22" status={<Status value="Improving" />} />
            <div className="progress-track"><div className="progress-fill" style={{ width: '72%' }} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Parent performance + recommendations ---------- */
export function ParentPerformance() {
  const { data: evalRows, loading, error } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 20 });
  const { data: scoreRows } = useSupabaseList({ table: 'evaluation_scores', page: 1, pageSize: 100 });
  const evals = (evalRows || []).map(toEvaluation).filter((e) => e.released);
  const evalIds = new Set(evals.map((e) => e.id));
  const myScores = (scoreRows || []).filter((s) => evalIds.has(s.evaluation_id ?? s.evaluationId));
  const totals = evals.map((e) => {
    const levels = myScores.filter((s) => (s.evaluation_id ?? s.evaluationId) === e.id).map((s) => s.level);
    return (levels.length > 0 ? total50(levels.map((l) => ({ level: l }))) : total50(e.scores || [])).total;
  });
  const currentTotal = totals.length > 0 ? totals[totals.length - 1] : null;
  const summaryValue = currentTotal != null ? `${currentTotal} · 50 + ${currentTotal - 50}` : '72 · 50 + 22';

  if (loading) return <div><PageHead kicker="Performance" title="Nimuthu’s progress." desc="Same released scores and remarks the student sees. Scoped to your linked student." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Performance" title="Nimuthu’s progress." desc="Same released scores and remarks the student sees. Scoped to your linked student." /><div className="notice"><strong>Couldn’t load performance.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Performance" title="Nimuthu’s progress." desc="Same released scores and remarks the student sees. Scoped to your linked student." />
      <div className="grid dashboard">
        <section className="chart-panel">
          <ChartSummary label="Current total" value={summaryValue} status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Insights</h2><span className="tag">3 findings</span></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Improving', text: totals.length >= 2 ? `Total rose from ${totals[0]} to ${currentTotal} across the last ${totals.length} sessions.` : 'Total rose from 64 to 72 across the last four sessions.', small: `Based on ${evals.length || 4} released evaluations` },
              { label: 'Strongest', text: 'Preparation remains the strongest skill, most often VG.' },
              { label: 'Next focus', text: 'Counter Arguments is the clearest development opportunity.' },
            ]} />
          </div>
        </section>
      </div>
    </div>
  );
}

export function ParentRecommendations() {
  const { data, loading, error } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 20 });
  const items = (data || []).map(toRecommendation);
  if (loading) return <div><PageHead kicker="Development" title="Recommendations." desc="Development actions for Nimuthu Fernando · EM-00124." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Development" title="Recommendations." desc="Development actions for Nimuthu Fernando · EM-00124." /><div className="notice"><strong>Couldn’t load recommendations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Development actions for Nimuthu Fernando · EM-00124." />
      <section>
        {items.length === 0 && <Empty title="No recommendations." body="Check back later." />}
        {items.map((r) => (
          <RecommendationRecord key={r.id} date={r.date} status={r.priority} title={r.title} body={r.body}
            tags={<><Tag>{r.skill}</Tag>{r.related && <> · {r.related}</>}</>} action={<Status value={r.status} />} />
        ))}
      </section>
    </div>
  );
}

function StudentBanner({ studentId }) {
  return <div className="notice" style={{ marginBottom: 22 }}>You are viewing information released for <strong>Nimuthu Fernando · {studentId}</strong>.</div>;
}

function useLinkedStudentId(studentIdParam) {
  const { data } = useSupabaseList({
    table: 'profiles',
    filters: studentIdParam ? { elevate_me_id: studentIdParam } : {},
    page: 1,
    pageSize: 1,
  });
  const rows = (data || []).map(toProfile);
  return rows[0]?.id || rows[0]?.userId || null;
}

export function ParentStudent() {
  const { studentId } = useParams();
  const linkedId = useLinkedStudentId(studentId);
  const { data: recRows } = useSupabaseList({
    table: 'recommendations',
    filters: linkedId ? { student_id: linkedId } : {},
    page: 1,
    pageSize: 20,
  });
  const recCount = (recRows || []).length;
  return (
    <div>
      <PageHead kicker="Linked student" title="Nimuthu Fernando." desc={`${studentId} · Royal College, Colombo`} />
      <StudentBanner studentId={studentId} />
      <div className="grid two">
        <Panel title="Performance" action={<Link to={`/parent/students/${studentId}/performance`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Overall trend and criterion comparison.</p>
        </Panel>
        <Panel title="Recommendations" action={<Link to={`/parent/students/${studentId}/recommendations`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{recCount || 3} active recommendations.</p>
        </Panel>
      </div>
    </div>
  );
}

export function ParentStudentPerformance() {
  const { studentId } = useParams();
  const linkedId = useLinkedStudentId(studentId);
  const { data: evalRows, loading, error } = useSupabaseList({
    table: 'evaluations',
    filters: linkedId ? { student_id: linkedId, released: true } : { released: true },
    page: 1,
    pageSize: 20,
  });
  const evals = (evalRows || []).map(toEvaluation).filter((e) => e.released);
  if (loading) return <div><PageHead kicker="Linked student" title="Performance." desc={`Nimuthu Fernando · ${studentId}`} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Linked student" title="Performance." desc={`Nimuthu Fernando · ${studentId}`} /><div className="notice"><strong>Couldn’t load performance.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Linked student" title="Performance." desc={`Nimuthu Fernando · ${studentId}`} />
      <StudentBanner studentId={studentId} />
      <section className="chart-panel">
        <ChartSummary label="Current total" value="72 · 50 + 22" status={<Status value="Improving" />} />
        <LineChart />
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 8 }}>Based on {evals.length} released evaluation{evals.length === 1 ? '' : 's'} in scope.</p>
      </section>
    </div>
  );
}

export function ParentStudentRecommendations() {
  const { studentId } = useParams();
  const linkedId = useLinkedStudentId(studentId);
  const { data, loading, error } = useSupabaseList({
    table: 'recommendations',
    filters: linkedId ? { student_id: linkedId } : {},
    page: 1,
    pageSize: 20,
  });
  const items = (data || []).map(toRecommendation);
  if (loading) return <div><PageHead kicker="Linked student" title="Recommendations." desc={`Development actions for Nimuthu Fernando · ${studentId}.`} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Linked student" title="Recommendations." desc={`Development actions for Nimuthu Fernando · ${studentId}.`} /><div className="notice"><strong>Couldn’t load recommendations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Linked student" title="Recommendations." desc={`Development actions for Nimuthu Fernando · ${studentId}.`} />
      <StudentBanner studentId={studentId} />
      <section>
        {items.length === 0 && <Empty title="No recommendations." body="Check back later." />}
        {items.map((r) => (
          <RecommendationRecord key={r.id} date={r.date} status={r.priority} title={r.title} body={r.body}
            tags={<Tag>{r.skill}</Tag>} action={<Status value={r.status} />} />
        ))}
      </section>
    </div>
  );
}

/* ---------- Messages (Supabase-backed) ---------- */
export function ParentMessages() {
  const [filter, setFilter] = useState('All messages');
  const [q, setQ] = useState('');
  const { data, loading, error } = useSupabaseList({
    table: 'message_threads',
    search: q ? { col: 'subject', term: q } : null,
    filters: filter === 'All messages' ? {} : { state: filter },
    order: { col: 'updated_at', ascending: false },
    page: 1,
    pageSize: 20,
  });
  const visible = (data || []).map(toThread);
  return (
    <div>
      <PageHead kicker="Communication" title="Messages." desc="Send a message to Diplomatic Impact or reply to a message addressed to you."
        action={<Link to="/parent/messages/new" className="button">New message</Link>} />
      <div className="filter-bar">
        <select aria-label="Filter messages" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All messages</option><option>Open</option><option>Replied</option><option>Closed</option>
        </select>
        <input type="search" placeholder="Search by subject" aria-label="Search messages" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && <SkeletonRows rows={3} />}
      {error && <div className="notice"><strong>Couldn’t load messages.</strong> {error.message}</div>}
      {!loading && !error && (
        <div className="message-list">
          {visible.length === 0 && <Empty title="No messages found." body="Try another search or filter." action={<Button variant="secondary" small onClick={() => { setFilter('All messages'); setQ(''); }}>Clear</Button>} />}
          {visible.map((t) => (
            <Link key={t.id} to={`/parent/messages/${t.id}`} className="message-item">
              <div className="row-meta">{t.date}<br />{t.from}</div>
              <div><h3>{t.subject}</h3><p>{t.preview}</p></div>
              <Status value={t.state} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function NewParentMessage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { create: createThread, saving: savingThread } = useSupabaseMutation({ table: 'message_threads' });
  const { create: createReply } = useSupabaseMutation({ table: 'message_replies' });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  return (
    <div>
      <PageHead kicker="Messages" title="New message." desc="Send a direct request to Diplomatic Impact."
        action={<Button variant="secondary" onClick={() => navigate('/parent/messages')}>Cancel</Button>} />
      <section className="panel"><div className="panel-body form-grid">
        <div className="field"><label>Linked student<select><option>Nimuthu Fernando · EM-00124</option></select></label></div>
        <div className="field"><label>Subject<input placeholder="What is this about?" value={subject} onChange={(e) => setSubject(e.target.value)} /></label></div>
        <div className="field span-two"><label>Message<textarea placeholder="Write your message clearly..." value={body} onChange={(e) => setBody(e.target.value)} /></label></div>
        {error && <p role="alert" className="field-error span-two">{error}</p>}
        <div><Button disabled={savingThread} onClick={async () => {
          if (!subject.trim() || !body.trim()) { setError('Subject and message are required. Your input is preserved.'); return; }
          setError('');
          try {
            const res = await createThread({
              subject: subject.trim(),
              preview: body.trim().slice(0, 120),
              state: 'Open',
            });
            if (res?.error) throw new Error(res.error.message);
            const createdRow = Array.isArray(res?.data) ? res.data[0] : res?.data;
            const threadId = createdRow?.id;
            if (threadId) {
              const replyRes = await createReply({
                thread_id: threadId,
                author_name: session?.name || 'S. Fernando (parent)',
                body: body.trim(),
              });
              if (replyRes?.error) throw new Error(replyRes.error.message);
              navigate(`/parent/messages/${threadId}`);
            } else {
              navigate('/parent/messages');
            }
          } catch (err) {
            setError(`${err?.message || 'Could not send your message.'} Your input is preserved.`);
          }
        }}>{savingThread ? 'Sending…' : 'Send message'}</Button></div>
      </div></section>
    </div>
  );
}

export function ThreadDetail() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { data: threadRow, loading, error, refetch: refetchThread } = useSupabaseRecord({ table: 'message_threads', id: threadId });
  const { data: replyRows, loading: repliesLoading, error: repliesError, refetch: refetchReplies } = useSupabaseList({
    table: 'message_replies',
    filters: { thread_id: threadId },
    order: { col: 'created_at', ascending: true },
    page: 1,
    pageSize: 50,
  });
  const { create: createReply, saving: savingReply } = useSupabaseMutation({ table: 'message_replies' });
  const { update: updateThread, saving: savingThread } = useSupabaseMutation({ table: 'message_threads' });
  const [reply, setReply] = useState('');
  const [localError, setLocalError] = useState('');

  if (loading || repliesLoading) return <div><p>Loading…</p><SkeletonRows rows={3} /></div>;
  if (error) return <div className="notice"><strong>Couldn’t load this message.</strong> {error.message}</div>;
  if (repliesError) return <div className="notice"><strong>Couldn’t load replies.</strong> {repliesError.message}</div>;
  if (!threadRow) return <NotFound />;
  const thread = toThread(threadRow);
  const replies = (replyRows || []).map(toReply);
  const linkedLabel = threadRow?.student_id || 'Linked student';

  const threadState = thread.state || 'Open';

  return (
    <div>
      <PageHead kicker="Messages" title={`${thread.subject}.`} desc={`Linked student: ${linkedLabel}`}
        action={<Button variant="secondary" onClick={() => navigate('/parent/messages')}>← Back to messages</Button>} />
      <ThreadMessage author={thread.from || 'Parent'} when={thread.date || thread.updatedAt} body={thread.preview} />
      {replies.map((r, i) => <ThreadMessage key={i} author={r.author} when={r.when} body={r.body} admin={/diplomatic|impact/i.test(r.author || '')} />)}
      {threadState === 'Closed' ? (
        <div className="notice" style={{ maxWidth: 760, marginTop: 24 }}>
          <strong>Thread closed.</strong> Reopen it to reply.
          <div style={{ marginTop: 10 }}><Button variant="secondary" small disabled={savingThread} onClick={async () => {
            try {
              const res = await updateThread(threadId, { state: 'Open' });
              if (res?.error) throw new Error(res.error.message);
              refetchThread?.();
            } catch (err) {
              setLocalError(err?.message || 'Could not reopen this thread.');
            }
          }}>Reopen thread</Button></div>
          {localError && <p role="alert" className="field-error" style={{ marginTop: 10 }}>{localError}</p>}
        </div>
      ) : (
        <div className="field" style={{ maxWidth: 760, marginTop: 24 }}>
          <label>Reply to this message
            <textarea placeholder="Write your reply..." value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          {localError && <p role="alert" className="field-error">{localError}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button disabled={savingReply} onClick={async () => {
              if (!reply.trim()) { setLocalError('Write a reply first. Your draft is preserved.'); return; }
              setLocalError('');
              try {
                const replyRes = await createReply({
                  thread_id: threadId,
                  author_name: session?.name || 'S. Fernando (parent)',
                  body: reply.trim(),
                });
                if (replyRes?.error) throw new Error(replyRes.error.message);
                setReply('');
                try {
                  const stateRes = await updateThread(threadId, { state: 'Replied' });
                  if (stateRes?.error) throw new Error(stateRes.error.message);
                } catch { /* keep reply even if state update fails */ }
                refetchReplies?.();
                refetchThread?.();
              } catch (err) {
                setLocalError(`${err?.message || 'Could not send your reply.'} Your draft is preserved.`);
              }
            }}>{savingReply ? 'Sending…' : 'Send reply'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
