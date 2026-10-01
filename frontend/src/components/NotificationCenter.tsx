import styles from './NotificationCenter.module.css';

export function NotificationCenter({ items }: { items: Array<{ id: string; title: string; body: string }> }) {
  return (
    <div className={styles.center} data-testid="notification-center" role="status" aria-label="Notifications">
      {items.length === 0 ? <p>No notifications.</p> : items.map((n) => (
        <article key={n.id}><h3>{n.title}</h3><p>{n.body}</p></article>
      ))}
    </div>
  );
}
