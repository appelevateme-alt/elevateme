import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { PageHeader } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { Alert, Toast } from '../../components/ui/Feedback.jsx';
import { AnnouncementItem, RecommendationItem } from '../../components/domain/Domain.jsx';
import { mockAnnouncements, mockEvaluations, mockRecommendations } from '../../lib/mock-data.js';

export function AdminRecommendations() {
  const [recipient, setRecipient] = useState('Amaya Perera · EM-00100');
  const [title, setTitle] = useState('');
  const [action, setAction] = useState('');
  const [skill, setSkill] = useState('Counter Arguments');
  const [evaluation, setEvaluation] = useState('e-1');
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState('');

  const ref = mockEvaluations.find((e) => e.id === evaluation);

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Recommendations" description="Targeted development actions. Compose on the left, live list on the right." />
      <div className="grid-2">
        <Card title="Compose" meta="Draft → publish · audience preview required">
          <div className="form-stack">
            <Field label="Recipient">
              <Select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                <option>Amaya Perera · EM-00100</option>
                <option>Speaking Cohort A (32 students)</option>
                <option>Role: all students</option>
              </Select>
            </Field>
            <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Work on counter-arguments" /></Field>
            <Field label="Action"><textarea className="textarea" style={{ minHeight: 80 }} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Concrete next step…" /></Field>
            <Field label="Skill">
              <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
                <option>Counter Arguments</option>
                <option>Sound</option>
                <option>Confidence</option>
              </Select>
            </Field>
            <Field label="Related released evaluation (optional)" hint="References released scores only. Staff-only remarks are never exposed.">
              <Select value={evaluation} onChange={(e) => setEvaluation(e.target.value)}>
                {mockEvaluations.filter((e) => e.released).map((e) => (
                  <option key={e.id} value={e.id}>{e.session} (released)</option>
                ))}
              </Select>
            </Field>
            <div className="row">
              <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
              <Button onClick={() => { setToast('Recommendation published and notified.'); setPreview(false); }}>Publish</Button>
            </div>
            {preview && (
              <Alert tone="info" title="Audience preview">
                “{title || '(untitled)'}” → {recipient}. Skill: {skill}. Linked evaluation: {ref?.session || 'none'} (released scores only).
              </Alert>
            )}
          </div>
        </Card>
        <Card title="Live recommendations" meta={`${mockRecommendations.length} targeted`}>
          {mockRecommendations.map((r) => (
            <RecommendationItem key={r.id} title={r.title} meta={`${r.studentName} · ${r.skill} · priority ${r.priority}`} action={r.action} reason={r.reason} footer={<Badge value={r.status} />} />
          ))}
          <div style={{ marginTop: 8 }}>
            <Link to="/admin/announcements" className="btn btn-ghost">Manage announcements →</Link>
          </div>
        </Card>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

export function AdminAnnouncements() {
  const [audience, setAudience] = useState('All students');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publish, setPublish] = useState('2026-09-20');
  const [preview, setPreview] = useState(false);
  const [toast, setToast] = useState('');

  return (
    <div>
      <Eyebrow>Administration</Eyebrow>
      <PageHeader title="Announcements" description="List, create, schedule, publish, archive. Always preview audience before publishing." />
      <div className="grid-2">
        <Card title="Compose" meta="Draft → scheduled → published">
          <div className="form-stack">
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option>All students</option>
                <option>Cohort A</option>
                <option>Coordinators</option>
                <option>Parents</option>
              </Select>
            </Field>
            <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" /></Field>
            <Field label="Body"><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Brief message…" /></Field>
            <Field label="Publish date"><TextInput type="date" value={publish} onChange={(e) => setPublish(e.target.value)} /></Field>
            <div className="row">
              <Button variant="secondary" onClick={() => setPreview(true)}>Preview audience</Button>
              <Button onClick={() => { setToast('Announcement scheduled — plain text only, no raw HTML.'); setPreview(false); }}>Schedule</Button>
            </div>
            {preview && (
              <Alert tone="info" title={`Audience preview — ${audience}`}>
                “{title || '(untitled)'}” reaches ~{audience === 'All students' ? '119 students + linked parents' : '32 recipients'} on {publish}. No raw HTML is rendered.
              </Alert>
            )}
          </div>
        </Card>
        <Card title="Published" meta={`${mockAnnouncements.length} live`}>
          {mockAnnouncements.map((a) => (
            <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.audience} · ${a.date}`} body={a.body} />
          ))}
        </Card>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}
