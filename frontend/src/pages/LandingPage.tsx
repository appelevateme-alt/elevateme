import { Link } from 'react-router-dom';
import { PublicHeader } from '../components/PublicHeader';
import { PageHeading } from '../components/PageHeading';
import styles from './LandingPage.module.css';

const THEMES: { name: string; desc: string }[] = [
  {
    name: 'Public Speaking',
    desc: 'Speak clearly in front of a group and share ideas with confidence.',
  },
  {
    name: 'Communication',
    desc: 'Listen well and explain ideas in a simple and respectful way.',
  },
  {
    name: 'Negotiation',
    desc: 'Find fair solutions when people see things differently.',
  },
  {
    name: 'Leadership',
    desc: 'Guide a team, take responsibility, and help others do their best.',
  },
];

const STEPS: { title: string; desc: string }[] = [
  { title: 'Participate', desc: 'Join a program and take part in the sessions.' },
  { title: 'Receive feedback', desc: 'Get clear and kind feedback from trained reviewers.' },
  { title: 'Improve', desc: 'Track progress over time and keep building skills.' },
];

/**
 * Public landing (Phase 4A): real intro, no placeholder.
 * Student growth platform by Diplomatic Impact. Themes + steps + CTAs.
 * No testimonials, no stats.
 */
export function LandingPage() {
  return (
    <>
      <PublicHeader />
      <main className={styles.page} data-testid="page-home">
        <PageHeading
          title="Grow your skills with ElevateMe"
          desc="Student growth platform by Diplomatic Impact."
        />
        <p className={styles.intro}>
          ElevateMe helps students build practical skills through guided programs,
          honest feedback, and steady progress.
        </p>

        <section className={styles.section} aria-label="Program themes">
          <h2>Explore four themes</h2>
          <ul className={styles.themes}>
            {THEMES.map((t) => (
              <li key={t.name} className={styles.card}>
                <h3>{t.name}</h3>
                <p>{t.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-label="How it works">
          <h2>How it works</h2>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.card}>
                <h3>
                  Step {i + 1}: {s.title}
                </h3>
                <p>{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} aria-label="Get started">
          <h2>Get started</h2>
          <div className={styles.actions}>
            <Link to="/programs" className={styles.primary}>
              Browse programs
            </Link>
            <Link to="/sign-up" className={styles.secondary}>
              Create account
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
