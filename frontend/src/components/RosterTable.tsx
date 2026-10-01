import { SaveState, type SaveKind } from './SaveState';
import styles from './RosterTable.module.css';

export interface RosterRow { id: string; name: string; elevateMeId: string; status: string }

/** Phase 2 full roster row (name, photo thumbnail, ElevateMe ID, allocation, attendance, evaluator, report status). */
export interface FullRosterRowView {
  id: string;
  name: string;
  photoUrl?: string;
  elevateMeId: string;
  allocation: string;
  attendance: 'attended' | 'absent' | 'unmarked';
  assignedEvaluator?: string;
  reportStatus: 'draft' | 'submitted' | 'released';
}

export function RosterTable({
  rows,
  onNext,
  full,
  onToggleAttendance,
  savingId,
  saveState,
}: {
  rows: RosterRow[];
  onNext?: (id: string) => void;
  /** Full Phase 2 columns (photo/allocation/attendance/evaluator/report status). */
  full?: FullRosterRowView[];
  onToggleAttendance?: (id: string, mark: 'attended' | 'absent') => void;
  savingId?: string | null;
  saveState?: SaveKind;
}) {
  if (full) {
    return (
      <div data-testid="roster-table" className={styles.wrap} role="region" aria-label="Session roster" tabIndex={0}>
        <table>
          <caption className={styles.sr}>Session roster</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Photo</th>
              <th scope="col">ElevateMe ID</th>
              <th scope="col">Allocation</th>
              <th scope="col">Attendance</th>
              <th scope="col">Assigned evaluator</th>
              <th scope="col">Report status</th>
            </tr>
          </thead>
          <tbody>
            {full.map((r) => (
              <tr key={r.id} data-testid="roster-row">
                <td>{r.name}</td>
                <td>
                  {r.photoUrl ? (
                    <img src={r.photoUrl} alt={`${r.name} photo`} className={styles.thumb} loading="lazy" decoding="async" />
                  ) : (
                    <span className={styles.noPhoto} aria-label="No photo">—</span>
                  )}
                </td>
                <td>{r.elevateMeId}</td>
                <td>{r.allocation}</td>
                <td>
                  <div className={styles.att} role="group" aria-label={`Attendance for ${r.name}`}>
                    <button
                      type="button"
                      aria-pressed={r.attendance === 'attended'}
                      className={r.attendance === 'attended' ? styles.on : ''}
                      onClick={() => onToggleAttendance?.(r.id, 'attended')}
                    >
                      Attended
                    </button>
                    <button
                      type="button"
                      aria-pressed={r.attendance === 'absent'}
                      className={r.attendance === 'absent' ? styles.on : ''}
                      onClick={() => onToggleAttendance?.(r.id, 'absent')}
                    >
                      Absent
                    </button>
                    {savingId === r.id && saveState && <SaveState state={saveState} />}
                  </div>
                </td>
                <td>{r.assignedEvaluator ?? '—'}</td>
                <td>{r.reportStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div data-testid="roster-table" className={styles.wrap} role="region" aria-label="Session roster" tabIndex={0}>
      <table>
        <caption className={styles.sr}>Session roster</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">ID</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{r.name}</td><td>{r.elevateMeId}</td><td>{r.status}</td>
              <td>{onNext && <button onClick={() => onNext(r.id)}>Next</button>}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
