export function Card({ title, meta, action, children }) {
  return (
    <section className="em-card">
      {(title || action) && (
        <div className="em-card-head">
          <div>
            {title && <h2 className="em-section-title">{title}</h2>}
            {meta && <p className="em-meta">{meta}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
