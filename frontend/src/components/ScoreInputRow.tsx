import styles from './ScoreInputRow.module.css';

export const RUBRIC_HINT = 'Rubric guidance pending DI review';

export function ScoreInputRow({
  index,
  label,
  criterionKey,
  value,
  onChange,
  error,
  disabled,
  inputId,
}: {
  index: number;
  label: string;
  criterionKey?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  error?: string | null;
  disabled?: boolean;
  inputId?: string;
}) {
  const id = inputId ?? `score-${criterionKey ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`;
  const describedBy = `${id}-hint${error ? ` ${id}-error` : ''}`;
  return (
    <div className={styles.row} data-testid="score-input-row" data-criterion={criterionKey ?? label}>
      <span className={styles.num} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div className={styles.labelWrap}>
        <label htmlFor={id} className={styles.label}>
          <strong>{label}</strong>
        </label>
        <p id={`${id}-hint`} className={styles.hint}>{RUBRIC_HINT}</p>
        {error && (
          <p id={`${id}-error`} role="alert" className={styles.error}>{error}</p>
        )}
      </div>
      <div className={styles.inputWrap}>
        <input
          id={id}
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          aria-label={`${label} score out of 100`}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          value={value ?? ''}
          placeholder="0–100"
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { onChange(null); return; }
            // Keep raw fractional input visible; validation rejects non-integers on save/submit.
            const n = Number(raw);
            onChange(Number.isNaN(n) ? null : n);
          }}
        />
        <span aria-hidden="true">/ 100</span>
      </div>
    </div>
  );
}
