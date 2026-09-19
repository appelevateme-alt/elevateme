import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { FilterBar } from '../../components/ui/Data.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { Alert, ConfirmDialog } from '../../components/ui/Feedback.jsx';
import { MessageRecord } from '../../components/domain/Domain.jsx';
import { mockThreads, mockThreadDetails } from '../../lib/mock-data.js';
import NotFound from '../public/NotFound.jsx';

export function ParentMessages() {
  const [filter, setFilter] = useState('all');
  const filtered = mockThreads.filter((t) => filter === 'all' || t.state === filter);

  return (
    <div>
      <Eyebrow>Parent communication</Eyebrow>
      <PageHeader
        title="Messages"
        description="Message-and-reply records with Diplomatic Impact — not chat. Viewing: Amaya Perera · EM-00100."
        action={<Link to="/parent/messages/new" className="btn btn-primary">New message</Link>}
      />
      <FilterBar>
        <Field label="State">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All states</option>
            <option value="Open">Open</option>
            <option value="Replied">Replied</option>
            <option value="Closed">Closed</option>
          </Select>
        </Field>
      </FilterBar>
      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
        {filtered.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title="No messages in this state" body="Try a different state filter." action={<Button variant="secondary" onClick={() => setFilter('all')}>Clear filter</Button>} />
          </div>
        ) : (
          filtered.map((t) => (
            <article key={t.id} className="record">
              <div className="record-main">
                <p className="em-item-title"><Link to={`/parent/messages/${t.id}`}>{t.subject}</Link></p>
                <p className="em-meta">{t.studentName} · Diplomatic Impact · {t.updatedAt}</p>
                <p className="body-text">{t.preview}</p>
              </div>
              <div className="record-side">
                <Badge value={t.state} />
                <Link to={`/parent/messages/${t.id}`} className="btn">Open</Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function NewParentMessage() {
  const navigate = useNavigate();
  const [student, setStudent] = useState('EM-00100');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  return (
    <div>
      <Eyebrow>Parent communication</Eyebrow>
      <PageHeader title="New message" description="Conventional form: student, subject, message. Either side can start." />
      <Card title="Compose" meta="Mock — creates record m-new">
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!subject.trim() || !body.trim()) {
              setError('Subject and message are required. Your input is preserved.');
              return;
            }
            setError('');
            navigate('/parent/messages/m-2');
          }}
        >
          <Field label="Linked student">
            <Select value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="EM-00100">Amaya Perera · EM-00100</option>
            </Select>
          </Field>
          <Field label="Subject"><TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Session absence — Oct 24" /></Field>
          <Field label="Message"><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" /></Field>
          {error && <Alert tone="danger" title="Check the form">{error}</Alert>}
          <div className="row">
            <Button type="submit">Send message</Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/parent/messages')}>Cancel</Button>
          </div>
        </form>
      </Card>
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
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState('');

  if (!thread) return <NotFound />;

  return (
    <div>
      <Eyebrow>Message detail</Eyebrow>
      <MessageRecord
        subject={thread.subject}
        meta={`${thread.studentName} · updated ${thread.updatedAt}`}
        body={thread.body}
        replies={replies}
        stateBadge={<Badge value={state} />}
        replyForm={
          state === 'Closed' ? (
            <Alert tone="info" title="Thread closed">
              This record is closed. Reopen it to reply.
              <div style={{ marginTop: 8 }}><Button variant="secondary" onClick={() => setState('Open')}>Reopen thread</Button></div>
            </Alert>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reply.trim()) {
                  setError('Write a reply before sending. Your draft is preserved.');
                  return;
                }
                setError('');
                setReplies((r) => [...r, { author: 'Nimal Perera (parent)', date: 'today', body: reply }]);
                setReply('');
                setState('Replied');
              }}
            >
              <Field label="Reply" hint="One reply form at the bottom. No typing indicators or read receipts.">
                <textarea className="textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply…" />
              </Field>
              {error && <Alert tone="danger" title="Could not send">{error}</Alert>}
              <div className="row">
                <Button type="submit">Send reply</Button>
                <Button type="button" variant="secondary" onClick={() => setConfirmClose(true)}>Close thread</Button>
              </div>
            </form>
          )
        }
      />
      <ConfirmDialog
        open={confirmClose}
        title="Close this thread?"
        body="Closing marks the record Closed. Either side can reopen it later."
        confirmLabel="Close thread"
        onConfirm={() => { setConfirmClose(false); setState('Closed'); }}
        onCancel={() => setConfirmClose(false)}
      />
      <div style={{ marginTop: 16 }}>
        <Button variant="ghost" onClick={() => navigate('/parent/messages')}>Back to inbox</Button>
      </div>
    </div>
  );
}
