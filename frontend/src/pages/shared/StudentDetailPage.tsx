import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { getStudentProfile, listStudentHistory, listStudentReports, type StudentProfile } from '../../features/students/api';
import styles from '../admin/AdminPhase5.module.css';

function displayName(p: StudentProfile): string {
  return p.displayName || p.elevateMeId || p.email || 'Student';
}

/**
 * Shared student detail (staff: /staff/students/:id, admin: /admin/users/:id).
 * Profile (name, ElevateMe ID, institute, photo), released reports list,
 * completion history, and a link to compose a recommendation.
 * Cross-student reads the server denies render as Not found (no enumeration).
 */
export function StudentDetailPage({ base }: { base: 'staff' | 'admin' }) {
  const { id } = useParams();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [history, setHistory] = useState<Array<{ id: string; programName?: string | null; status?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const p = await getStudentProfile(id);
      if (!p) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProfile(p);
      const [r, h] = await Promise.all([listStudentReports(p.id), listStudentHistory(p.id)]);
      setReports(r);
      setHistory(h as Array<{ id: string; programName?: string | null; status?: string | null }>);
      setLoading(false);
    })();
  }, [id]);

  const backTo = base === 'staff' ? '/staff/programs' : '/admin/users';

  if (loading) return <main className={styles.page}><p role="status">Loading student…</p></main>;
  if (notFound || !profile) {
    return (
      <main className={styles.page} data-testid="not-found">
        <PageHeading title="Student not found" />
        <EmptyState
          title="Student not found"
          body="This student is unavailable or outside your assigned programs."
          action={<Link to={backTo}>{base === 'staff' ? 'Back to programs' : 'Back to account review'}</Link>}
        />
      </main>
    );
  }

  return (
    <main className={styles.page} data-testid="page-student-detail">
      <nav aria-label="Breadcrumb">
        <Link to={backTo}>{base === 'staff' ? 'Programs' : 'Account review'}</Link>
        {' / '}
        {displayName(profile)}
      </nav>
      <PageHeading
        kicker={profile.elevateMeId ? `ElevateMe ID ${profile.elevateMeId}` : undefined}
        title={displayName(profile)}
        desc={profile.institute ?? profile.instituteId ?? 'Institute on file'}
      />
      {profile.photo && (
        <img src={profile.photo} alt={`Photo of ${displayName(profile)}`} width={96} height={96} />
      )}
      <p className={styles.meta}>
        {profile.email ?? 'No email on file'}
      </p>
      <div className={styles.actions}>
        <Link to={base === 'staff' ? '/staff/comment-bank' : '/admin/comment-bank'}>Open comment bank</Link>
        {' · '}
        {base === 'staff' ? (
          <span className={styles.meta}>Recommendations are admin-only</span>
        ) : (
          <Link to={`/admin/recommendations?student=${encodeURIComponent(profile.id)}`}>Compose recommendation for this student</Link>
        )}
      </div>
      <section aria-label="Released reports" className={styles.section}>
        <h2>Released reports ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className={styles.meta}>No released reports yet.</p>
        ) : (
          <ul>
            {reports.map((r, i) => (
              <li key={String(r['id'] ?? i)}>
                {String(r['programName'] ?? r['program_name'] ?? r['title'] ?? `Report ${i + 1}`)}
                {' — '}
                {String(r['total'] ?? r['score'] ?? '')}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Completion history" className={styles.section}>
        <h2>Completion history ({history.length})</h2>
        {history.length === 0 ? (
          <p className={styles.meta}>No completed programs yet.</p>
        ) : (
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                {h.programName ?? 'Program'}
                {h.status ? ` — ${h.status}` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
