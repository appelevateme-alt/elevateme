import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './CompanionNotice.module.css';

export type CompanionSlot = 'idle' | 'wave' | 'report' | 'reply' | 'celebration';

export function companionMuteKey(userId?: string | null): string {
  return `em:companion-muted:${userId ?? 'anon'}`;
}

export function companionGreetKey(userId?: string | null): string {
  return `em:companion-greeted:${userId ?? 'anon'}`;
}

interface CompanionNoticeProps {
  slot?: CompanionSlot;
  message: string;
  /** Per-account mute scope; mute key is `em:companion-muted:<userId>`. */
  userId?: string | null;
  /** When set (e.g. report destination), the message is clickable to that route. */
  link?: string | null;
  onLinkOpen?: () => void;
}

// Pip placeholder SVG + slots + minimized/mute + prefers-reduced-motion + concise aria-live once.
export function CompanionNotice({ slot = 'idle', message, userId, link, onLinkOpen }: CompanionNoticeProps) {
  const muteKey = companionMuteKey(userId);
  const greetKey = companionGreetKey(userId);

  const [minimized, setMinimized] = useState(() => {
    // Once-per-visit greeting guard: repeat idle greetings in the same tab start minimized.
    try {
      if (slot === 'idle' && sessionStorage.getItem(greetKey) === '1') return true;
    } catch { /* noop */ }
    return false;
  });
  const [muted, setMuted] = useState(() => {
    try {
      if (localStorage.getItem(muteKey) === '1') return true;
      // One-time migration from legacy global key.
      if (localStorage.getItem('em:companion-muted') === '1') return true;
    } catch { /* noop */ }
    return false;
  });

  // Re-scope mute state when the account changes.
  useEffect(() => {
    try {
      setMuted(
        localStorage.getItem(muteKey) === '1' ||
          localStorage.getItem('em:companion-muted') === '1',
      );
    } catch { /* noop */ }
  }, [muteKey]);

  // Mark this visit as greeted (sessionStorage, once per tab lifetime).
  useEffect(() => {
    try {
      if (!sessionStorage.getItem(greetKey)) sessionStorage.setItem(greetKey, '1');
    } catch { /* noop */ }
  }, [greetKey]);

  const toggleMute = () => {
    setMuted((m) => { try { localStorage.setItem(muteKey, m ? '0' : '1'); } catch { /* noop */ } return !m; });
  };
  if (minimized) {
    return <button type="button" data-testid="companion-notice" className={styles.mini} onClick={() => setMinimized(false)} aria-label="Expand companion">Pip</button>;
  }
  const body = link ? (
    <p className={styles.msg}>
      <Link to={link} onClick={onLinkOpen} aria-live="polite">{message}</Link>
    </p>
  ) : (
    !muted && <p aria-live="polite" className={styles.msg}>{message}</p>
  );
  return (
    <div data-testid="companion-notice" data-slot={slot} className={styles.notice}>
      <svg viewBox="0 0 48 48" role="img" aria-label="Pip companion placeholder" className={`${styles.pip} ${styles[slot] ?? ''}`}>
        <circle cx="24" cy="24" r="18" className={styles.body} />
        <circle cx="18" cy="20" r="2.6" className={styles.eye} />
        <circle cx="30" cy="20" r="2.6" className={styles.eye} />
        {slot === 'idle' && <path d="M17 30 Q24 34 31 30" fill="none" strokeWidth="2" className={styles.mouth} />}
        {slot === 'wave' && (
          <g>
            <path d="M17 29 Q24 35 31 29" fill="none" strokeWidth="2" className={styles.mouth} />
            <path d="M40 18 Q44 12 42 8" fill="none" strokeWidth="2" strokeLinecap="round" className={styles.arm} />
          </g>
        )}
        {slot === 'report' && (
          <g>
            <path d="M17 30 L31 30" fill="none" strokeWidth="2" className={styles.mouth} />
            <rect x="32" y="28" width="9" height="11" className={styles.doc} />
          </g>
        )}
        {slot === 'reply' && (
          <g>
            <path d="M17 30 Q24 33 31 30" fill="none" strokeWidth="2" className={styles.mouth} />
            <path d="M34 12 L40 12 L37 16 Z" className={styles.bubble} />
          </g>
        )}
        {slot === 'celebration' && (
          <g>
            <path d="M16 29 Q24 37 32 29" fill="none" strokeWidth="2" className={styles.mouth} />
            <path d="M10 10 L13 14 M38 10 L35 14 M24 4 L24 9" strokeWidth="2" strokeLinecap="round" className={styles.rays} />
          </g>
        )}
      </svg>
      {body}
      <div className={styles.actions}>
        <button type="button" onClick={() => setMinimized(true)}>Minimize</button>
        <button type="button" onClick={toggleMute} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
      </div>
    </div>
  );
}
