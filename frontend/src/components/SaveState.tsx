import styles from './SaveState.module.css';

export type SaveKind = 'saving' | 'saved' | 'offline' | 'error';

// Autosave 1s Saving/Saved/Offline-error indicator.
export function SaveState({ state }: { state: SaveKind }) {
  const label = state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'offline' ? 'Offline — will retry' : 'Error — retrying';
  return <span data-testid="save-state" role="status" aria-live="polite" className={styles[state]}>{label}</span>;
}
