export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{children}</p>;
}

export function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3">
      <div>
        <h2 className="em-section-title">{title}</h2>
        {meta && <p className="em-meta mt-0.5">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

export function ContentSection({ children }: { children: React.ReactNode }) {
  return <section className="border-b border-gray-200 py-6 first:pt-0 last:border-0 last:pb-0">{children}</section>;
}

export function Divider() {
  return <hr className="border-gray-200" />;
}

// Editorial split: main content + quiet sidebar. No floating cards.
export function SplitLayout({
  main,
  aside,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <div className="min-w-0">{main}</div>
      <aside className="min-w-0 border-t border-gray-200 pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        {aside}
      </aside>
    </div>
  );
}

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
