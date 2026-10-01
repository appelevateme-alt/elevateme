import { useState } from 'react';
import styles from './InsightMessage.module.css';
import type { InsightItem } from '../features/performance/api';

// Feed only: deterministic versioned templates + evidence, no input box,
// no typing indicator, no AI branding. Top 5 + Expand. Based-on scope label.
export function InsightMessage({
  items,
  scopeLabel,
  evidenceWindow,
}: {
  items: InsightItem[];
  scopeLabel?: string;
  evidenceWindow?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 5);
  const hidden = Math.max(0, items.length - visible.length);
  if (items.length === 0) {
    return (
      <div className={styles.feed} data-testid="insight-message">
        <div className={styles.item}>
          <label>baseline</label>
          <p>Your first report will start your progress record.</p>
          {scopeLabel && <p className={styles.basedOn}>Based on {scopeLabel}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.feed} data-testid="insight-message">
      {scopeLabel && (
        <p className={styles.scope} data-testid="insight-scope">
          Based on {scopeLabel}
          {evidenceWindow ? ` · ${evidenceWindow}` : ''}
        </p>
      )}
      {visible.map((it, i) => (
        <div key={`${it.type}-${it.criterionKey ?? it.criterion ?? i}`} className={styles.item}>
          <label>{it.criterionLabel ?? it.label ?? it.type}</label>
          <p>{it.message}</p>
          {(it.basedOn || it.criterionLabel) && (
            <p className={styles.basedOn}>{it.basedOn ?? `Based on ${it.criterionLabel ?? it.label}`}</p>
          )}
        </div>
      ))}
      {items.length > 5 && (
        <button
          type="button"
          className={styles.expand}
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : `Expand all (${hidden} more)`}
        </button>
      )}
    </div>
  );
}
