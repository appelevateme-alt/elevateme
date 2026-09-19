const tone = {
  Published: 'badge-green', Approved: 'badge-green', Confirmed: 'badge-green',
  Locked: 'badge-green', Replied: 'badge-green', Completed: 'badge-green',
  InProgress: 'badge-blue', Submitted: 'badge-blue',
  Pending: 'badge-amber', PendingReview: 'badge-amber', UnderReview: 'badge-amber',
  Open: 'badge-amber', Waitlisted: 'badge-amber', ChangesRequested: 'badge-amber',
  New: '', High: 'badge-red', Medium: 'badge-amber', Low: '',
  Rejected: 'badge-red', Suspended: 'badge-red',
  Draft: '', NotStarted: '',
};

export function Badge({ value }) {
  const cls = tone[value] || '';
  return (
    <span className={`badge ${cls}`.trim()}>
      <span aria-hidden className="badge-dot" />
      {value}
    </span>
  );
}
