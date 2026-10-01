import { Link } from 'react-router-dom';
import styles from './EventRow.module.css';
import { StatusBadge } from './StatusBadge';

export function EventRow({ date, kind, title, meta, status, to }: { date: string; kind: string; title: string; meta: string; status?: string; to?: string }) {
  return (
    <article className={styles.row} data-testid="event-row">
      <div className={styles.meta}>{date}<br />{kind}</div>
      <div><h3>{to ? <Link to={to}>{title}</Link> : title}</h3><p>{meta}</p></div>
      <div>{status && <StatusBadge value={status} />}</div>
    </article>
  );
}
