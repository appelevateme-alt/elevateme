import styles from './FollowUpList.module.css';

export function FollowUpList({ items }: { items: Array<{ id: string; body: string; when: string }> }) {
  return (
    <div className={styles.list} data-testid="follow-up-list">
      {items.map((m) => (
        <article key={m.id} className={styles.item}><span>{m.when}</span><p>{m.body}</p></article>
      ))}
    </div>
  );
}
