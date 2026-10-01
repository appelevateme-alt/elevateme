import { Link } from 'react-router-dom';
import styles from './RecommendationItem.module.css';
import { StatusBadge } from './StatusBadge';

/**
 * Flat recommendation record: DI author, title, action, reason,
 * criterion/report link, priority, due date. Legacy date/status/title/body
 * props still work for the dashboard pinned list.
 */
export function RecommendationItem(props: {
  date?: string;
  status?: string;
  title: string;
  body?: string;
  author?: string | null;
  action?: string | null;
  reason?: string | null;
  criterion?: string | null;
  reportId?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  canComplete?: boolean;
  canUndo?: boolean;
  onComplete?: () => void;
  onUndo?: () => void;
  completing?: boolean;
}) {
  const { date, status, title, body, author, action, reason, criterion, reportId, priority, dueDate } = props;
  const flat = action != null || reason != null || author != null || criterion != null || priority != null || dueDate != null || reportId != null;
  return (
    <article className={styles.card} data-testid="recommendation-item">
      <div className={styles.meta}>
        {date && <span>{date}</span>}
        {status && <span><StatusBadge value={status} /></span>}
        {priority && <span>Priority: {String(priority).toUpperCase()}</span>}
        {dueDate && <span>Due: {dueDate}</span>}
      </div>
      <div>
        <h3>{title}</h3>
        {flat ? (
          <>
            {author && <p className={styles.meta}>From: {author}</p>}
            {action && <p>Action: {action}</p>}
            {reason && <p>Reason: {reason}</p>}
            <p className={styles.meta}>
              {criterion ? `Criterion: ${criterion} ` : ''}
              {reportId ? <Link to={`/app/reports/${encodeURIComponent(reportId)}`}>Open report</Link> : null}
            </p>
          </>
        ) : (
          body && <p>{body}</p>
        )}
        {(props.canComplete || props.canUndo) && (
          <div className={styles.actions}>
            {props.canComplete && <button type="button" disabled={props.completing} onClick={props.onComplete}>Mark complete</button>}
            {props.canUndo && <button type="button" disabled={props.completing} onClick={props.onUndo}>Undo</button>}
          </div>
        )}
      </div>
    </article>
  );
}
