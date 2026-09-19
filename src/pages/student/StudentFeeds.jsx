import { useState } from 'react';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader, EmptyState } from '../../components/ui/Page.jsx';
import { Eyebrow } from '../../components/ui/Structure.jsx';
import { FilterBar } from '../../components/ui/Data.jsx';
import { Field, Select } from '../../components/ui/Field.jsx';
import { RecommendationItem, AnnouncementItem } from '../../components/domain/Domain.jsx';
import { mockAnnouncements, mockRecommendations } from '../../lib/mock-data.js';

export function StudentRecommendations() {
  const [status, setStatus] = useState('all');
  const [skill, setSkill] = useState('all');
  const [done, setDone] = useState({});

  const filtered = mockRecommendations.filter((r) => {
    if (status !== 'all' && r.status !== status && !(status === 'Completed' && done[r.id])) return false;
    if (skill !== 'all' && r.skill !== skill) return false;
    return true;
  });

  return (
    <div>
      <Eyebrow>Development</Eyebrow>
      <PageHeader title="Recommendations" description="One-way development actions from Diplomatic Impact." />
      <FilterBar>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="New">New</option>
            <option value="Viewed">Viewed</option>
            <option value="Completed">Completed</option>
          </Select>
        </Field>
        <Field label="Skill">
          <Select value={skill} onChange={(e) => setSkill(e.target.value)}>
            <option value="all">All skills</option>
            <option value="Counter Arguments">Counter Arguments</option>
            <option value="Sound">Sound</option>
          </Select>
        </Field>
      </FilterBar>
      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
        {filtered.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <EmptyState title="No recommendations for these filters" body="Try a different status or skill." action={<Button variant="secondary" onClick={() => { setStatus('all'); setSkill('all'); }}>Clear filters</Button>} />
          </div>
        ) : (
          filtered.map((r) => (
            <RecommendationItem
              key={r.id} title={r.title} meta={`${r.skill} · priority ${r.priority} · From Diplomatic Impact`}
              action={r.action} reason={r.reason}
              footer={<><Badge value={done[r.id] ? 'Completed' : r.status} />{!done[r.id] && <Button variant="secondary" onClick={() => setDone((d) => ({ ...d, [r.id]: true }))}>Mark complete</Button>}</>}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function StudentAnnouncements() {
  return (
    <div>
      <Eyebrow>Updates</Eyebrow>
      <PageHeader title="Announcements" description="Chronological flat feed. Pinned items first, then by date." />
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {mockAnnouncements.map((a) => (
          <AnnouncementItem key={a.id} title={a.title} meta={`${a.sender} · ${a.audience} · ${a.date}`} body={a.body} />
        ))}
      </div>
    </div>
  );
}
