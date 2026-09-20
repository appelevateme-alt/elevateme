import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, SkeletonRows, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, RecommendationRecord, ThreadMessage } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseRecord, useSupabaseMutation } from '../lib/useSupabase.js';
import { toEvaluation, toProfile, toRecommendation, toReply, toThread } from '../lib/adapters.js';
import { formatTotal, total1000 } from '../lib/scores.js';
import { useAuth } from '../lib/auth.jsx';
import { NotFound } from './public.jsx';

/* ---------- Parent overview (prototype) ---------- */
function useLinkedStudent() {
  const { session } = useAuth();
  const { data: linkRows } = useSupabaseList({
    table: 'parent_links',
    filters: session?.userId ? { parent_id: session.userId, status: ['Approved', 'Verified'] } : {},
    page: 1,
    pageSize: 5,
  });
  const studentId = linkRows?.[0]?.student_id ?? null;
  const { data: profileRows } = useSupabaseList({
    table: 'profiles',
    filters: studentId ? { id: studentId } : {},
    page: 1,
    pageSize: 1,
  });
  const p = (profileRows || []).map(toProfile)[0];
  if (p) return { id: p.userId || p.id, name: p.name, elevateMeId: p.elevateMeId };
  if (studentId) return { id: studentId, name: null, elevateMeId: null };
  return null;
}

function linkedTitle(linked, fallback) {
  if (linked?.name) return `${linked.name.split(' ')[0]}’s ${fallback}.`;
  return `Linked student ${fallback}.`;
}

export function ParentOverview() {
  const { data: recRows } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 20 });
  const { data: evalRows } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 20 });
  const { data: scoreRows } = useSupabaseList({ table: 'evaluation_scores', page: 1, pageSize: 100 });
  const recs = (recRows || []).map(toRecommendation);
  const evals = (evalRows || []).map(toEvaluation);
  const topRec = recs[0];
  const latestTotals = (() => {
    if (evals.length === 0) return null;
    const last = evals[evals.length - 1];
    const nums = (scoreRows || [])
      .filter((s) => (s.evaluation_id ?? s.evaluationId) === last.id)
      .map((s) => s.score ?? s.value);
    return nums.length > 0 ? total1000(nums) : null;
  })();

  const linked = useLinkedStudent();
  const whoName = linked?.name || 'Linked student';
  const whoId = linked?.elevateMeId ? ` · ${linked.elevateMeId}` : '';

  return (
    <div>
      <PageHead kicker="Parent overview" title={linkedTitle(linked, 'progress')} desc="A clear summary of released performance, active programs and recommendations."
        action={<button className="button secondary" onClick={() => alert('One student linked — the switcher appears with more than one.')}>Switch student</button>} />
      {linked && <div className="notice">You are viewing information released for <strong>{whoName}{whoId}</strong>.</div>}
      <div style={{ height: 22 }} />
      <Metrics items={[
        ['Overall total', latestTotals ? formatTotal(latestTotals) : 'No released scores', evals.length > 0 ? `${evals.length} released` : 'Awaiting first release'],
        ['Evaluations', String(evals.length).padStart(2, '0'), 'All released'],
        ['Active programs', '00', 'None yet'],
        ['Open actions', String(recs.length).padStart(2, '0'), recs.length > 0 ? 'Needs attention' : 'None yet'],
      ]} />
      <div className="grid two">
        <section className="panel">
          <div className="panel-head"><h2>Current development focus</h2><Link to="/parent/recommendations" className="button quiet small">All recommendations →</Link></div>
          <div className="panel-body">
            {topRec ? (
              <>
                <Tag>{topRec.skill}</Tag>
                <h3 style={{ font: '700 1.5rem Manrope', margin: '10px 0' }}>{topRec.title}</h3>
                <p style={{ color: 'var(--muted)' }}>{topRec.body}</p>
              </>
            ) : (
              <Empty title="No recommendations yet." body="Development actions from evaluators will appear here." />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Latest performance</h2><Link to="/parent/performance" className="button quiet small">View detail →</Link></div>
          <div className="panel-body">
            {latestTotals ? (
              <>
                <ChartSummary label="Overall total" value={formatTotal(latestTotals)} status={<Status value="Improving" />} />
                <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, latestTotals.scaled)}%` }} /></div>
              </>
            ) : (
              <Empty title="No released scores yet." body="Released evaluations will appear here." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Parent performance + recommendations ---------- */
export function ParentPerformance() {
  const linked = useLinkedStudent();
  const perfTitle = linkedTitle(linked, 'progress');
  const { data: evalRows, loading, error } = useSupabaseList({ table: 'evaluations', filters: { released: true }, page: 1, pageSize: 20 });
  const { data: scoreRows } = useSupabaseList({ table: 'evaluation_scores', page: 1, pageSize: 100 });
  const evals = (evalRows || []).map(toEvaluation).filter((e) => e.released);
  const evalIds = new Set(evals.map((e) => e.id));
  const myScores = (scoreRows || []).filter((s) => evalIds.has(s.evaluation_id ?? s.evaluationId));
  const totals = evals.map((e) => {
    const nums = myScores
      .filter((s) => (s.evaluation_id ?? s.evaluationId) === e.id)
      .map((s) => s.score ?? s.value);
    return nums.length > 0 ? total1000(nums) : total1000((e.scores || []).map((s) => s.score));
  });
  const currentTotal = totals.length > 0 ? totals[totals.length - 1] : null;
  const summaryValue = currentTotal != null ? formatTotal(currentTotal) : 'No released scores';

  if (loading) return <div><PageHead kicker="Performance" title={perfTitle} desc="Same released scores and remarks the student sees. Scoped to your linked student." /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Performance" title={perfTitle} desc="Same released scores and remarks the student sees. Scoped to your linked student." /><div className="notice"><strong>Couldn’t load performance.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Performance" title={perfTitle} desc="Same released scores and remarks the student sees. Scoped to your linked student." />
      <div className="grid dashboard">
        <section className="chart-panel">
          <ChartSummary label="Current total" value={summaryValue} status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Insights</h2><span className="tag">{evals.length > 0 ? '3 findings' : 'No data'}</span></div>
          <div className="panel-body">
            {evals.length > 0 ? (
              <InsightList items={[
                { label: 'Improving', text: totals.length >= 2 ? `Final score rose from ${totals[0].scaled} to ${currentTotal.scaled} across the last ${totals.length} sessions.` : `Latest final score is ${currentTotal.scaled} / 100.`, small: `Based on ${evals.length} released evaluation${evals.length === 1 ? '' : 's'}` },
                { label: 'Strongest', text: 'Preparation remains the strongest skill, most often above 85.' },
                { label: 'Next focus', text: 'Counter Arguments is the clearest development opportunity.' },
              ]} />
            ) : (
              <Empty title="No insights yet." body="Insights appear once evaluations are released." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ParentRecommendations() {
  const linked = useLinkedStudent();
  const recDesc = linked?.name ? `Development actions for ${linked.name}${linked.elevateMeId ? ` · ${linked.elevateMeId}` : ''}.` : 'Development actions for your linked student.';
  const { data, loading, error } = useSupabaseList({ table: 'recommendations', page: 1, pageSize: 20 });
  const items = (data || []).map(toRecommendation);
  if (loading) return <div><PageHead kicker="Development" title="Recommendations." desc={recDesc} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Development" title="Recommendations." desc={recDesc} /><div className="notice"><strong>Couldn’t load recommendations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc={recDesc} />
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

function StudentBanner({ studentId, linked }) {
  const label = linked?.name ? `${linked.name}${linked.elevateMeId ? ` · ${linked.elevateMeId}` : ''}` : studentId;
  return <div className="notice" style={{ marginBottom: 22 }}>You are viewing information released for <strong>{label}</strong>.</div>;
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
  const linked = useLinkedStudent();
  const studentName = linked?.name || 'Linked student';
  const { data: recRows } = useSupabaseList({
    table: 'recommendations',
    filters: linkedId ? { student_id: linkedId } : {},
    page: 1,
    pageSize: 20,
  });
  const recCount = (recRows || []).length;
  return (
    <div>
      <PageHead kicker="Linked student" title={`${studentName}.`} desc={linked?.elevateMeId || studentId} />
      <StudentBanner studentId={studentId} linked={linked} />
      <div className="grid two">
        <Panel title="Performance" action={<Link to={`/parent/students/${studentId}/performance`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Overall trend and criterion comparison.</p>
        </Panel>
        <Panel title="Recommendations" action={<Link to={`/parent/students/${studentId}/recommendations`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{recCount} active recommendations.</p>
        </Panel>
      </div>
    </div>
  );
}

export function ParentStudentPerformance() {
  const { studentId } = useParams();
  const linkedId = useLinkedStudentId(studentId);
  const linked = useLinkedStudent();
  const whoDesc = linked?.name ? `${linked.name}${linked.elevateMeId ? ` · ${linked.elevateMeId}` : ''}` : studentId;
  const { data: evalRows, loading, error } = useSupabaseList({
    table: 'evaluations',
    filters: linkedId ? { student_id: linkedId, released: true } : { released: true },
    page: 1,
    pageSize: 20,
  });
  const evals = (evalRows || []).map(toEvaluation).filter((e) => e.released);
  if (loading) return <div><PageHead kicker="Linked student" title="Performance." desc={whoDesc} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Linked student" title="Performance." desc={whoDesc} /><div className="notice"><strong>Couldn’t load performance.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Linked student" title="Performance." desc={whoDesc} />
      <StudentBanner studentId={studentId} linked={linked} />
      <section className="chart-panel">
        <ChartSummary label="Released evaluations" value={evals.length > 0 ? String(evals.length).padStart(2, '0') : 'None yet'} status={<Status value="Improving" />} />
        <LineChart />
        <p style={{ fontSize: '.82rem', color: 'var(--muted)', marginTop: 8 }}>Based on {evals.length} released evaluation{evals.length === 1 ? '' : 's'} in scope.</p>
      </section>
    </div>
  );
}

export function ParentStudentRecommendations() {
  const { studentId } = useParams();
  const linkedId = useLinkedStudentId(studentId);
  const linked = useLinkedStudent();
  const whoDesc = linked?.name ? `Development actions for ${linked.name}${linked.elevateMeId ? ` · ${linked.elevateMeId}` : ''}.` : 'Development actions for your linked student.';
  const { data, loading, error } = useSupabaseList({
    table: 'recommendations',
    filters: linkedId ? { student_id: linkedId } : {},
    page: 1,
    pageSize: 20,
  });
  const items = (data || []).map(toRecommendation);
  if (loading) return <div><PageHead kicker="Linked student" title="Recommendations." desc={whoDesc} /><SkeletonRows rows={3} /></div>;
  if (error) return <div><PageHead kicker="Linked student" title="Recommendations." desc={whoDesc} /><div className="notice"><strong>Couldn’t load recommendations.</strong> {error.message}</div></div>;
  return (
    <div>
      <PageHead kicker="Linked student" title="Recommendations." desc={whoDesc} />
      <StudentBanner studentId={studentId} linked={linked} />
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
  const linked = useLinkedStudent();
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
        <div className="field"><label>Linked student<select><option>{linked?.name ? `${linked.name}${linked.elevateMeId ? ` · ${linked.elevateMeId}` : ''}` : 'No linked student'}</option></select></label></div>
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
                author_name: session?.name || 'Parent',
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
