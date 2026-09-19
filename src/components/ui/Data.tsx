import Link from "next/link";
import { Button } from "./Button";

// Filter bar: stacks vertically on mobile, inline on larger screens (§6).
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">{children}</div>;
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center gap-2">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <p className="em-meta" aria-live="polite">Page {page} of {totalPages}</p>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

export function DefinitionList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="em-meta">{term}</dt>
          <dd className="text-sm text-gray-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Metric as text line, not a boxed stat (§4: avoid every statistic in a box).
export function MetricLine({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <p className="text-sm text-gray-700">
      <span className="em-meta">{label}: </span>
      <strong className="font-semibold text-gray-900">{value}</strong>
      {hint && <span className="em-meta"> · {hint}</span>}
    </p>
  );
}

export function Timeline({ events }: { events: { date: string; title: string; body?: string }[] }) {
  return (
    <ol className="border-l border-gray-300 pl-4">
      {events.map((e, i) => (
        <li key={i} className="relative pb-4 last:pb-0">
          <span aria-hidden className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-gray-400 bg-white" />
          <p className="em-meta">{e.date}</p>
          <p className="em-item-title">{e.title}</p>
          {e.body && <p className="text-sm text-gray-600">{e.body}</p>}
        </li>
      ))}
    </ol>
  );
}

// Accessible chart frame: title, text summary, graphic, linked data table (§9, §15).
export function ChartFrame({
  title,
  summary,
  tableCaption,
  tableHeaders,
  tableRows,
  children,
}: {
  title: string;
  summary: string;
  tableCaption: string;
  tableHeaders: string[];
  tableRows: string[][];
  children: React.ReactNode;
}) {
  return (
    <figure className="border-y border-gray-200 py-4">
      <figcaption className="em-item-title">{title}</figcaption>
      <p className="mt-1 text-sm text-gray-600">{summary}</p>
      <div className="mt-3 min-h-[180px]" role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#1d4ed8]">View data table</summary>
        <table className="mt-2 w-full border-collapse text-left text-sm">
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr className="border-b border-gray-200">
              {tableHeaders.map((h) => (
                <th key={h} scope="col" className="py-1 pr-4 text-xs font-semibold uppercase text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="py-1 pr-4">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function RecordRow({
  href,
  title,
  meta,
  status,
}: {
  href?: string;
  title: string;
  meta: string;
  status?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="em-item-title">{title}</p>
        <p className="em-meta mt-0.5">{meta}</p>
      </div>
      {status}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="flex items-start justify-between gap-3 border-b border-gray-200 py-3 last:border-0 hover:bg-gray-50">
        {inner}
      </Link>
    );
  }
  return <div className="flex items-start justify-between gap-3 border-b border-gray-200 py-3 last:border-0">{inner}</div>;
}
