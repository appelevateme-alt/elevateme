import { Link } from 'react-router-dom';
import { Badge } from '../ui/Badge.jsx';
import { ChartFrame, MetricLine } from '../ui/Data.jsx';

export function ProgramRow({ program }) {
  const closed = program.status === 'RegistrationClosed';
  return (
    <article className="program-row">
      <div style={{ minWidth: 0 }}>
        <p className="em-meta">{program.startDate} · {program.singleEventType || program.category} · {program.institute}</p>
        <h3 className="em-item-title">
          <Link to={`/programs/${program.id}`}>{program.title}</Link>
        </h3>
        <p className="body-text">{program.description}</p>
        <p className="em-meta">{program.registered}/{program.capacity} registered</p>
      </div>
      <div className="record-side">
        <Badge value={program.status} />
        <Link to={`/programs/${program.id}`} className="btn" aria-disabled={closed}>
          {closed ? 'Registration closed' : 'View details'}
        </Link>
      </div>
    </article>
  );
}

export function RoleBadge({ role }) {
  return <span className="role-badge">{role}</span>;
}

const LEVEL_HELP = { L: 'Limited', G: 'Good', VG: 'Very Good', E: 'Excellent' };

export function CriterionScoreInput({ criterionKey, label, rubric, value, onChange }) {
  const levels = ['L', 'G', 'VG', 'E'];
  return (
    <fieldset style={{ border: 0, borderBottom: '1px solid #f3f4f6', padding: '12px 0', margin: 0 }}>
      <legend className="em-item-title">{label}</legend>
      <p className="em-meta">{rubric}</p>
      <div role="radiogroup" aria-label={`${label} score`} className="score-grid">
        {levels.map((level) => {
          const selected = value === level;
          return (
            <label key={level} className={`score-option${selected ? ' selected' : ''}`}>
              <input
                type="radio"
                name={`score-${criterionKey}`}
                value={level}
                checked={selected}
                onChange={() => onChange(level)}
                className="sr-only"
              />
              <span>{level}</span>
              <span className="sr-only">{LEVEL_HELP[level]}</span>
              <small aria-hidden>{LEVEL_HELP[level]}</small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PerformanceTrendChart({ points }) {
  const W = 560;
  const H = 180;
  const PAD = 28;
  const max = 5;
  const min = 1;
  const x = (i) => PAD + (i * (W - PAD * 2)) / Math.max(1, points.length - 1);
  const y = (v) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {[1, 2, 3, 4, 5].map((g) => (
        <line key={g} x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} stroke="#e5e7eb" strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke="#1d4ed8" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={x(i)} cy={y(p.value)} r={5} fill="#1d4ed8" stroke="#fff" strokeWidth={2} />
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b7280">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function PerformanceChartBlock() {
  const points = [
    { label: 'S1', value: 3 },
    { label: 'S2', value: 3.5 },
    { label: 'S3', value: 3 },
    { label: 'S4', value: 4 },
  ];
  return (
    <div>
      <div className="row" style={{ gap: 24 }}>
        <MetricLine label="Latest value" value="4.0 (Very Good)" hint="Session 4" />
        <MetricLine label="Change" value="+1.0" hint="across last four sessions" />
        <MetricLine label="Evaluations" value="4 released" hint="min 3 for trends" />
      </div>
      <ChartFrame
        title="Overall average trend"
        summary="Confidence improved from 3.0 to 4.0 across the last four evaluated sessions."
        tableCaption="Overall average by session"
        tableHeaders={['Session', 'Average']}
        tableRows={points.map((p) => [p.label, p.value.toFixed(1)])}
      >
        <PerformanceTrendChart points={points} />
      </ChartFrame>
    </div>
  );
}

export function InsightItem({ tone, label, statement, evidence, action }) {
  return (
    <li className="record">
      <div className="record-main">
        <p className="em-meta">{tone}</p>
        <p className="em-item-title">{label}</p>
        <p className="body-text">{statement}</p>
        <p className="em-meta">Evidence: {evidence}</p>
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </li>
  );
}

export function RecommendationItem({ title, meta, action, reason, footer }) {
  return (
    <article className="record">
      <div className="record-main">
        <h3 className="em-item-title">{title}</h3>
        <p className="em-meta">{meta}</p>
        <p className="body-text"><strong>Action:</strong> {action}</p>
        <p className="body-text"><strong>Reason:</strong> {reason}</p>
        {footer && <div className="row" style={{ marginTop: 8 }}>{footer}</div>}
      </div>
    </article>
  );
}

export function AnnouncementItem({ title, meta, body }) {
  return (
    <article className="record">
      <div className="record-main">
        <h3 className="em-item-title">{title}</h3>
        <p className="em-meta">{meta}</p>
        <p className="body-text">{body}</p>
      </div>
    </article>
  );
}

export function MessageRecord({ subject, meta, body, replies, stateBadge, replyForm }) {
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="em-section-title">{subject}</h2>
          <p className="em-meta">{meta}</p>
        </div>
        {stateBadge}
      </div>
      <div className="message-box">
        <p style={{ margin: 0, fontSize: 14 }}>{body}</p>
      </div>
      {replies.length > 0 && (
        <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
          {replies.map((r, i) => (
            <li key={i} className="message-reply">
              <p className="em-meta">{r.author} · {r.date}</p>
              <p style={{ margin: '4px 0 0', fontSize: 14 }}>{r.body}</p>
            </li>
          ))}
        </ol>
      )}
      {replyForm && <div style={{ marginTop: 16 }}>{replyForm}</div>}
    </div>
  );
}

export function ApprovalRecord({ title, meta, submitted, review, actions }) {
  return (
    <article className="em-card">
      <h3 className="em-item-title">{title}</h3>
      <p className="em-meta">{meta}</p>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <h4 className="eyebrow">Submitted information</h4>
          <div style={{ fontSize: 14 }}>{submitted}</div>
        </div>
        <div>
          <h4 className="eyebrow">Review panel</h4>
          <div style={{ fontSize: 14 }}>{review}</div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>{actions}</div>
    </article>
  );
}
