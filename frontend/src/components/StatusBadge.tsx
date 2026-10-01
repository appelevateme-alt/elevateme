import styles from './StatusBadge.module.css';

const KIND: Record<string, string> = {
  Approved: 'approved', Published: 'approved', Active: 'approved',
  Complete: 'complete', Completed: 'complete', Submitted: 'complete',
  Pending: 'pending', Draft: 'pending', InReview: 'pending',
  Waitlisted: 'waiting', Soon: 'waiting',
  Rejected: 'closed', Closed: 'closed', Suspended: 'closed'
};

export function StatusBadge({ value }: { value: string }) {
  const kind = KIND[value] ?? '';
  return <span data-testid="status-badge" className={`${styles.badge} ${kind ? styles[kind] : ''}`.trim()}>{value}</span>;
}
