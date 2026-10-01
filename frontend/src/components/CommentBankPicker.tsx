import { useMemo, useState } from 'react';
import styles from './CommentBankPicker.module.css';

export type BankScope = 'ADMIN_SHARED' | 'TEACHER_PRIVATE' | 'admin' | 'shared' | 'teacher-private';
export interface BankItem { id: string; text: string; scope: BankScope; criterionKey?: string | null }

function normScope(s: BankScope): 'shared' | 'private' {
  const v = String(s).toUpperCase();
  if (v === 'ADMIN_SHARED' || v === 'ADMIN' || v === 'SHARED') return 'shared';
  return 'private';
}

// Comment bank (no AI): human-authored snippets only. Insert at cursor + Undo,
// shared vs private tabs. Parent owns the remarks value + textarea ref.
export function CommentBankPicker({
  items,
  onInsert,
  onUndo,
  canUndo,
  disabled,
}: {
  items: BankItem[];
  onInsert: (text: string, pos: number) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<'shared' | 'private'>('shared');
  const [cursorHint, setCursorHint] = useState<number | null>(null);
  const filtered = useMemo(() => items.filter((it) => normScope(it.scope) === tab), [items, tab]);
  const sharedCount = useMemo(() => items.filter((it) => normScope(it.scope) === 'shared').length, [items]);
  const privateCount = useMemo(() => items.filter((it) => normScope(it.scope) === 'private').length, [items]);

  return (
    <div className={styles.wrap} data-testid="comment-bank-picker">
      <div className={styles.tabs} role="tablist" aria-label="Comment bank scope">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'shared'}
          className={tab === 'shared' ? styles.active : ''}
          onClick={() => setTab('shared')}
        >
          Shared ({sharedCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'private'}
          className={tab === 'private' ? styles.active : ''}
          onClick={() => setTab('private')}
        >
          Private ({privateCount})
        </button>
      </div>
      <p className={styles.note}>Human-authored snippets only — no AI suggestions.</p>
      <div className={styles.list} role="tabpanel" aria-label={tab === 'shared' ? 'Shared snippets' : 'Private snippets'}>
        {filtered.length === 0 && <p className={styles.empty}>No {tab} snippets yet.</p>}
        {filtered.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={disabled}
            title={it.text}
            onClick={(e) => {
              // Best-effort cursor position: parent tracks the real textarea; we pass
              // the click-time hint only when the parent cannot resolve it.
              const pos = cursorHint ?? (e.clientX >= 0 ? -1 : -1);
              onInsert(it.text, pos);
            }}
            onFocus={() => setCursorHint(null)}
          >
            {it.text.slice(0, 48)}
          </button>
        ))}
      </div>
      {onUndo && (
        <button type="button" disabled={!canUndo} onClick={onUndo} data-testid="comment-bank-undo">
          Undo insert
        </button>
      )}
    </div>
  );
}
