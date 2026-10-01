import styles from './PublicHeader.module.css';

export function PublicHeader() {
  return (
    <header className={styles.header} data-testid="public-header">
      <a className={styles.brand} href="/">ElevateMe</a>
      <nav aria-label="Public">
        <a href="/programs">Programs</a>
        <a href="/sign-in">Sign in</a>
      </nav>
    </header>
  );
}
