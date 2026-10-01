import { useEffect, useRef, useState } from 'react';
import { getStudentProfile, searchStudents, type StudentProfile } from '../features/students/api';
import styles from './StudentSelector.module.css';

function labelOf(p: StudentProfile): string {
  const name = p.displayName || p.email || p.id;
  const extra = p.elevateMeId ? ` (${p.elevateMeId})` : '';
  return `${name}${extra}`;
}

function fallbackLabel(id: string): string {
  const last4 = id.length > 4 ? id.slice(-4) : id;
  return `Student …${last4}`;
}

/**
 * Searchable student selector for the recommendation composer.
 * Type a name, pick from matches, selected IDs are shown as removable
 * chips with names (never raw IDs). Names for IDs the list did not
 * provide are looked up once via getStudentProfile; unknown IDs fall
 * back to "Student …last4" so the chip stays readable.
 */
export function StudentSelector({
  selected,
  onChange,
  names,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  names?: Record<string, string>;
}) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<Record<string, string>>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const query = q.trim();
    if (!query) {
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        setMatches(await searchStudents(query));
      } finally {
        setLoading(false);
        setOpen(true);
      }
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  // Resolve names for selected IDs we have not seen via search picks.
  useEffect(() => {
    const missing = selected.filter((id) => !(names?.[id] ?? known[id]));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: Record<string, string> = {};
      for (const id of missing.slice(0, 20)) {
        try {
          const p = await getStudentProfile(id);
          if (p) entries[id] = labelOf(p);
        } catch {
          continue;
        }
      }
      if (!cancelled && Object.keys(entries).length > 0) {
        setKnown((prev) => ({ ...prev, ...entries }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, names, known]);

  function displayFor(id: string): string {
    return names?.[id] ?? known[id] ?? fallbackLabel(id);
  }

  function pick(p: StudentProfile) {
    setKnown((prev) => (prev[p.id] ? prev : { ...prev, [p.id]: labelOf(p) }));
    if (!selected.includes(p.id)) onChange([...selected, p.id]);
    setQ('');
    setMatches([]);
    setOpen(false);
  }

  function remove(id: string) {
    onChange(selected.filter((s) => s !== id));
  }

  return (
    <div className={styles.wrap} data-testid="student-selector">
      {selected.length > 0 && (
        <ul className={styles.chips} aria-label="Selected students">
          {selected.map((id) => {
            const label = displayFor(id);
            return (
              <li key={id} className={styles.chip} data-testid="selected-student" title={id}>
                {label}
                <button type="button" onClick={() => remove(id)} aria-label={`Remove ${label}`}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <label className={styles.field}>Find students by name
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a student name"
          aria-label="Find students by name"
          role="combobox"
          aria-expanded={open}
          aria-controls="student-matches"
        />
      </label>
      {loading && <p role="status" className={styles.meta}>Searching…</p>}
      {open && matches.length === 0 && q.trim() && !loading && (
        <p className={styles.meta} role="status">
          No matches. Check the spelling or add the student from a session roster.
        </p>
      )}
      {open && matches.length > 0 && (
        <ul id="student-matches" className={styles.matches} role="listbox" aria-label="Matching students">
          {matches.map((m) => (
            <li key={m.id} role="option" aria-selected={selected.includes(m.id)}>
              <button type="button" onClick={() => pick(m)}>
                {labelOf(m)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
