import styles from './FilterBar.module.css';

export interface FilterOption { value: string; label: string }

export function FilterBar({ selects, onReset }: {
  selects: Array<{ label: string; value: string; options: FilterOption[]; onChange: (v: string) => void }>;
  onReset?: () => void;
}) {
  return (
    <div className={styles.bar} data-testid="filter-bar">
      {selects.map((s) => (
        <label key={s.label} className={styles.field}>{s.label}
          <select value={s.value} onChange={(e) => s.onChange(e.target.value)}>
            {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      ))}
      {onReset && <button onClick={onReset}>Reset</button>}
    </div>
  );
}
