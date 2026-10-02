import styles from './StatusBadge.module.css';

const LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  WAITLISTED: 'Waitlisted',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
  DRAFT: 'Draft',
  PENDING_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
  SUBMITTED: 'Submitted',
  LOCKED: 'Locked',
  draft: 'Draft',
  submitted: 'Submitted',
  released: 'Released',
  Pending: 'Pending',
  Draft: 'Draft',
  InReview: 'In review',
  Approved: 'Approved',
  Published: 'Published',
  Active: 'Active',
  Complete: 'Complete',
  Completed: 'Completed',
  Submitted: 'Submitted',
  Waitlisted: 'Waitlisted',
  Soon: 'Soon',
  Rejected: 'Rejected',
  Closed: 'Closed',
  Suspended: 'Suspended',
};

function plainLabel(value: string): string {
  if (LABEL[value]) return LABEL[value];
  const words = value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return words || value;
}

const KIND: Record<string, string> = {
  Approved: 'approved', Published: 'approved', Active: 'approved', Confirmed: 'approved',
  Complete: 'complete', Completed: 'complete', Submitted: 'complete',
  Pending: 'pending', Draft: 'pending', InReview: 'pending', 'Awaiting payment': 'pending', 'In review': 'pending', 'Changes requested': 'pending',
  Waitlisted: 'waiting', Soon: 'waiting',
  Rejected: 'closed', Closed: 'closed', Suspended: 'closed', Withdrawn: 'closed', Expired: 'closed', Archived: 'closed'
};

export function StatusBadge({ value }: { value: string }) {
  const label = plainLabel(value);
  const kind = KIND[value] ?? KIND[label] ?? '';
  return <span data-testid="status-badge" className={`${styles.badge} ${kind ? styles[kind] : ''}`.trim()}>{label}</span>;
}
