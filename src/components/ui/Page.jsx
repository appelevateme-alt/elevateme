export function EmptyState({ title, body, action }) {
  return (
    <div className="em-card" role="status">
      <p className="em-item-title">{title}</p>
      <p className="body-text">{body}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, action }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="em-page-title">{title}</h1>
        {description && <p className="body-text" style={{ maxWidth: 640 }}>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
