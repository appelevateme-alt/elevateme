import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    // Restore focus to the opener on close (a11y focus management).
    restoreRef.current = document.activeElement;
    confirmRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      const d = dialogRef.current;
      if (!d) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      // Focus trap: keep Tab/Shift+Tab inside the dialog.
      if (e.key !== 'Tab') return;
      const focusables = d.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const items = [...focusables].filter((el) => !el.hasAttribute('disabled'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !d.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      (restoreRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onCancel} data-testid="confirm-dialog">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby="cd-b" className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 id="cd-t">{title}</h2>
        <p id="cd-b">{body}</p>
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button ref={confirmRef} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
