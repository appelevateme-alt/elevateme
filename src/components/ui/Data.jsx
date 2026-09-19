import { Link } from 'react-router-dom';
import { Button } from './Button.jsx';

export function FilterBar({ children }) {
  return <div className="filter-bar">{children}</div>;
}

export function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="row" style={{ marginTop: 16 }}>
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <p className="em-meta" aria-live="polite">Page {page} of {totalPages}</p>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  );
}

export function DefinitionList({ items }) {
  return (
    <dl className="def-list">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="em-meta">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function MetricLine({ label, value, hint }) {
  return (
    <p className="metric-line">
      <span className="em-meta">{label}: </span>
      <strong>{value}</strong>
      {hint && <span className="em-meta"> · {hint}</span>}
    </p>
  );
}

export function Timeline({ events }) {
  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={i}>
          <p className="em-meta">{e.date}</p>
          <p className="em-item-title">{e.title}</p>
          {e.body && <p className="body-text">{e.body}</p>}
        </li>
      ))}
    </ol>
  );
}

export function ChartFrame({ title, summary, tableCaption, tableHeaders, tableRows, children }) {
  return (
    <figure style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '16px 0', margin: '12px 0' }}>
      <figcaption className="em-item-title">{title}</figcaption>
      <p className="body-text">{summary}</p>
      <div className="chart-wrap" role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
      <details className="chart-data">
        <summary>View data table</summary>
        <table className="em-table" style={{ marginTop: 8 }}>
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr>{tableHeaders.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function RecordRow({ href, title, meta, status }) {
  const inner = (
    <>
      <div className="record-main">
        <p className="em-item-title">{title}</p>
        <p className="em-meta">{meta}</p>
      </div>
      {status}
    </>
  );
  if (href) {
    return <Link to={href} className="record">{inner}</Link>;
  }
  return <div className="record">{inner}</div>;
}

export function Table({ headers, rows, caption }) {
  return (
    <div className="em-table-wrap">
      <table className="em-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>{headers.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>{cells.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
