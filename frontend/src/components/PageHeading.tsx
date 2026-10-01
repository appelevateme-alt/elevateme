import styles from './PageHeading.module.css';

export function PageHeading({ title, kicker, desc }: { title: string; kicker?: string; desc?: string }) {
  return (
    <header className={styles.head}>
      {kicker && <div className={styles.kicker}>{kicker}</div>}
      <h1 className={styles.title}>{title}</h1>
      {desc && <p className={styles.desc}>{desc}</p>}
    </header>
  );
}
