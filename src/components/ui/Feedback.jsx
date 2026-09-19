import { useEffect, useRef } from 'react';
import { Button } from './Button.jsx';

const alertClass = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  danger: 'alert-danger',
};

export function Alert({ tone = 'info', title, children }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`alert ${alertClass[tone]}`}>
      {title && <p className="alert-title">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div role="status" className="toast">{message}</div>;
}

export function Progress({ value, max, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <p className="progress-label">{label}: step {value} of {max}</p>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={1} aria-valuemax={max} aria-label={label} className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${92 - i * 12}%` }} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }) {
  return (
    <div role="status" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
          <div className="skeleton-line" style={{ width: '66%' }} />
          <div className="skeleton-line" style={{ width: '33%' }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body = 'We could not load this. Your input is preserved — try again.', onRetry }) {
  return (
    <div role="alert" className="alert alert-danger">
      <p className="alert-title">{title}</p>
      <p>{body}</p>
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  const lastTrigger = useRef(null);

  useEffect(() => {
    if (open) {
      lastTrigger.current = document.activeElement;
      confirmRef.current?.focus();
      const onKey = (e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Tab') {
          const buttons = Array.from(document.querySelectorAll('[data-confirm-dialog] button'));
          if (buttons.length === 0) return;
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('keydown', onKey);
        lastTrigger.current?.focus?.();
      };
    }
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        data-confirm-dialog
        className="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="em-section-title">{title}</h2>
        <p className="body-text" id="confirm-body">{body}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button ref={confirmRef} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
