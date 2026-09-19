export function Eyebrow({ children }) {
  return <p className="eyebrow">{children}</p>;
}

export function SectionHeader({ title, meta, action }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="em-section-title">{title}</h2>
        {meta && <p className="em-meta">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

export function ContentSection({ children }) {
  return <section className="content-section">{children}</section>;
}

export function Divider() {
  return <hr className="divider" />;
}

export function SplitLayout({ main, aside }) {
  return (
    <div className="split">
      <div style={{ minWidth: 0 }}>{main}</div>
      <aside style={{ minWidth: 0 }}>{aside}</aside>
    </div>
  );
}

export function StickyActionBar({ children }) {
  return (
    <div className="sticky-bar">
      <div className="sticky-bar-inner">{children}</div>
    </div>
  );
}
