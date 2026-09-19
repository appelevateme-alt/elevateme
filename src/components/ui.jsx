import { useEffect, useRef } from 'react';

/* ---------- Buttons (.button) ---------- */
export function Button({ variant, small, className = '', ...props }) {
  const cls = ['button'];
  if (variant) cls.push(variant);
  if (small) cls.push('small');
  if (className) cls.push(className);
  return <button {...props} className={cls.join(' ')} />;
}

/* ---------- Status pill (.status) ---------- */
const KIND = {
  Published: 'approved', Approved: 'approved', Confirmed: 'approved',
  Locked: 'approved', Replied: 'approved', Complete: 'complete',
  Completed: 'complete', Submitted: 'complete', Active: 'approved',
  Improving: 'improving',
  Pending: 'pending', PendingReview: 'pending', UnderReview: 'pending',
  Draft: 'pending', NotStarted: 'pending', InProgress: 'pending',
  Waitlisted: 'waiting', Soon: 'waiting',
  Open: 'action', New: 'action', 'High priority': 'action',
  Review: 'action', High: 'action',
  SubmittedState: 'complete',
  Release: 'pending', 'Ready to release': 'pending',
  'Changes requested': 'pending', ChangesRequested: 'pending',
  'In progress': 'pending', Scheduled: 'pending', Viewed: '',
  Rejected: 'closed', Suspended: 'closed', Closed: 'closed',
  Low: '', Medium: 'pending',
};

export function Status({ value }) {
  const kind = KIND[value] ?? '';
  return <span className={`status ${kind}`.trim()}>{value}</span>;
}

export function Tag({ children }) {
  return <span className="tag">{children}</span>;
}

/* ---------- Page head ---------- */
export function PageHead({ kicker, title, desc, action }) {
  return (
    <header className="page-head">
      <div>
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-description">{desc}</p>}
      </div>
      {action}
    </header>
  );
}

/* ---------- Metric strip ---------- */
export function Metrics({ items }) {
  return (
    <div className="metric-strip">
      {items.map((m, i) => (
        <div className="metric" key={i}>
          <label>{m[0]}</label>
          <b>{m[1]}</b>
          <small>{m[2]}</small>
        </div>
      ))}
    </div>
  );
}

/* ---------- Panel ---------- */
export function Panel({ title, action, children, bodyClass }) {
  return (
    <section className="panel">
      {(title || action) && (
        <div className="panel-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      <div className={`panel-body ${bodyClass || ''}`.trim()}>{children}</div>
    </section>
  );
}

/* ---------- Forms (.field) ---------- */
export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      <label>
        <span style={{ display: 'block', marginBottom: 7 }}>{label}</span>
        {children}
      </label>
      {hint && <span className="field-hint">{hint}</span>}
      {error && <p role="alert" className="field-error">{error}</p>}
    </div>
  );
}

export function Notice({ children }) {
  return <div className="notice">{children}</div>;
}

export function Empty({ title, body, action }) {
  return (
    <div className="empty" role="status">
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ErrorSummary({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div role="alert" className="alert-error">
      <strong>Check {items.length} item(s) before continuing</strong>
      <ul>{items.map((m, i) => <li key={i}>{m}</li>)}</ul>
    </div>
  );
}

/* ---------- Data table ---------- */
export function DataTable({ headers, rows, caption }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="pagination">
      <Button variant="secondary" small disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span aria-live="polite">Page {page} of {totalPages}</span>
      <Button variant="secondary" small disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

/* ---------- Feedback ---------- */
export function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  return (
    <div id="toast" role="status" aria-live="polite" className={`toast${message ? ' show' : ''}`}>
      {message || ''}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--line)', padding: '12px 0' }}>
          <div className="skeleton-line" style={{ width: '60%' }} />
          <div className="skeleton-line" style={{ width: '35%' }} />
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, max, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', margin: '0 0 6px' }}>{label}: step {value} of {max}</p>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={1} aria-valuemax={max} aria-label={label} className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const lastTrigger = useRef(null);

  useEffect(() => {
    if (!open) return;
    lastTrigger.current = document.activeElement;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Tab') {
        const buttons = Array.from(document.querySelectorAll('[data-confirm-dialog] button'));
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      lastTrigger.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" data-confirm-dialog className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button ref={confirmRef} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
