import styles from './ScoreHistoryTable.module.css';

export function ScoreHistoryTable({ rows }: { rows: Array<{ session: string; total: number; date: string }> }) {
  return (
    <div className={styles.wrap} data-testid="score-history-table">
      <table>
        <caption className={styles.sr}>Score history</caption>
        <thead><tr><th scope="col">Session</th><th scope="col">Date</th><th scope="col">Total</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td>{r.session}</td><td>{r.date}</td><td>{r.total}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
