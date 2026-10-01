import styles from './EmptyState.module.css';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.empty} role="status" data-testid="empty-state">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
