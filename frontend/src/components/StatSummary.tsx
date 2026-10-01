import styles from './StatSummary.module.css';

export function StatSummary({ items }: { items: Array<[string, string, string?]> }) {
  return (
    <div className={styles.strip} data-testid="stat-summary">
      {items.map(([label, value, sub], i) => (
        <div key={i} className={styles.metric}>
          <label>{label}</label>
          <b>{value}</b>
          {sub && <small>{sub}</small>}
        </div>
      ))}
    </div>
  );
}
