import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Empty, Metrics, PageHead, Panel, Status, Tag } from '../components/ui.jsx';
import { ChartSummary, InsightList, LineChart, RecommendationRecord, ThreadMessage } from '../components/domain.jsx';
import { mockRecommendations, mockThreadDetails, mockThreads } from '../lib/mock-data.js';
import { NotFound } from './public.jsx';

/* ---------- Parent overview (prototype) ---------- */
export function ParentOverview() {
  return (
    <div>
      <PageHead kicker="Parent overview" title="Nimuthu’s progress." desc="A clear summary of released performance, active programs and recommendations."
        action={<button className="button secondary" onClick={() => alert('One student linked — the switcher appears with more than one.')}>Switch student</button>} />
      <div className="notice">You are viewing information released for <strong>Nimuthu Fernando · EM-00124</strong>.</div>
      <div style={{ height: 22 }} />
      <Metrics items={[
        ['Overall total', '72 · 50 + 22', '+6 points this term'],
        ['Evaluations', '06', 'All released'],
        ['Active programs', '02', 'Next session 24 October'],
        ['Open actions', '02', '1 high priority'],
      ]} />
      <div className="grid two">
        <section className="panel">
          <div className="panel-head"><h2>Current development focus</h2><Link to="/parent/recommendations" className="button quiet small">All recommendations →</Link></div>
          <div className="panel-body">
            <Tag>Counter Arguments</Tag>
            <h3 style={{ font: '700 1.5rem Manrope', margin: '10px 0' }}>Practice structured rebuttals</h3>
            <p style={{ color: 'var(--muted)' }}>This recommendation is connected to Nimuthu’s last two debate evaluations.</p>
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
  return (
    <div>
      <PageHead kicker="Performance" title="Nimuthu’s progress." desc="Same released scores and remarks the student sees. Scoped to your linked student." />
      <div className="grid dashboard">
        <section className="chart-panel">
          <ChartSummary label="Current total" value="72 · 50 + 22" status={<Status value="Improving" />} />
          <LineChart />
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Insights</h2><span className="tag">3 findings</span></div>
          <div className="panel-body">
            <InsightList items={[
              { label: 'Improving', text: 'Total rose from 64 to 72 across the last four sessions.', small: 'Based on 4 released evaluations' },
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
  return (
    <div>
      <PageHead kicker="Development" title="Recommendations." desc="Development actions for Nimuthu Fernando · EM-00124." />
      <section>
        {mockRecommendations.map((r) => (
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

export function ParentStudent() {
  const { studentId } = useParams();
  return (
    <div>
      <PageHead kicker="Linked student" title="Nimuthu Fernando." desc={`${studentId} · Royal College, Colombo`} />
      <StudentBanner studentId={studentId} />
      <div className="grid two">
        <Panel title="Performance" action={<Link to={`/parent/students/${studentId}/performance`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Overall trend and criterion comparison.</p>
        </Panel>
        <Panel title="Recommendations" action={<Link to={`/parent/students/${studentId}/recommendations`} className="button quiet small">Open →</Link>}>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem' }}>{mockRecommendations.length} active recommendations.</p>
        </Panel>
      </div>
    </div>
  );
}

export function ParentStudentPerformance() {
  const { studentId } = useParams();
  return (
    <div>
      <PageHead kicker="Linked student" title="Performance." desc={`Nimuthu Fernando · ${studentId}`} />
      <StudentBanner studentId={studentId} />
      <section className="chart-panel">
        <ChartSummary label="Current total" value="72 · 50 + 22" status={<Status value="Improving" />} />
        <LineChart />
      </section>
    </div>
  );
}

export function ParentStudentRecommendations() {
  const { studentId } = useParams();
  return (
    <div>
      <PageHead kicker="Linked student" title="Recommendations." desc={`Development actions for Nimuthu Fernando · ${studentId}.`} />
      <StudentBanner studentId={studentId} />
      <section>
        {mockRecommendations.map((r) => (
          <RecommendationRecord key={r.id} date={r.date} status={r.priority} title={r.title} body={r.body}
            tags={<Tag>{r.skill}</Tag>} action={<Status value={r.status} />} />
        ))}
      </section>
    </div>
  );
}

/* ---------- Messages (prototype messages/openThread/newMessage) ---------- */
export function ParentMessages() {
  const [filter, setFilter] = useState('All messages');
  const [q, setQ] = useState('');
  const visible = mockThreads.filter((t) =>
    (filter === 'All messages' || t.state === filter) &&
    (!q || t.subject.toLowerCase().includes(q.toLowerCase())));
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
    </div>
  );
}

export function NewParentMessage() {
  const navigate = useNavigate();
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
        <div><Button onClick={() => {
          if (!subject.trim() || !body.trim()) { setError('Subject and message are required. Your input is preserved.'); return; }
          navigate('/parent/messages/m-2');
        }}>Send message</Button></div>
      </div></section>
    </div>
  );
}

export function ThreadDetail() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const thread = mockThreadDetails.find((t) => t.id === threadId);
  const [reply, setReply] = useState('');
  const [replies, setReplies] = useState(thread ? thread.replies : []);
  const [state, setState] = useState(thread ? thread.state : 'Open');
  const [error, setError] = useState('');
  if (!thread) return <NotFound />;

  return (
    <div>
      <PageHead kicker="Messages" title={`${thread.subject}.`} desc={`Linked student: ${thread.studentName}`}
        action={<Button variant="secondary" onClick={() => navigate('/parent/messages')}>← Back to messages</Button>} />
      <ThreadMessage author={thread.author} when={thread.authorWhen} body={thread.body} />
      {replies.map((r, i) => <ThreadMessage key={i} author={r.author} when={r.when} body={r.body} admin />)}
      {state === 'Closed' ? (
        <div className="notice" style={{ maxWidth: 760, marginTop: 24 }}>
          <strong>Thread closed.</strong> Reopen it to reply.
          <div style={{ marginTop: 10 }}><Button variant="secondary" small onClick={() => setState('Open')}>Reopen thread</Button></div>
        </div>
      ) : (
        <div className="field" style={{ maxWidth: 760, marginTop: 24 }}>
          <label>Reply to this message
            <textarea placeholder="Write your reply..." value={reply} onChange={(e) => setReply(e.target.value)} />
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={() => {
              if (!reply.trim()) { setError('Write a reply first. Your draft is preserved.'); return; }
              setError(''); setReplies((r) => [...r, { author: 'S. Fernando (parent)', when: 'today', body: reply }]);
              setReply(''); setState('Replied');
            }}>Send reply</Button>
          </div>
        </div>
      )}
    </div>
  );
}
