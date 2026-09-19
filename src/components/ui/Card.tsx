export function Card({
  title,
  meta,
  action,
  children,
}: {
  title?: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="em-card p-5">
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="em-section-title">{title}</h2>}
            {meta && <p className="em-meta mt-0.5">{meta}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
