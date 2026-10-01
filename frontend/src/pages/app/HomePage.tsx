import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeading } from '../../components/PageHeading';
import { EmptyState } from '../../components/EmptyState';
import { AvatarEditor } from '../../components/AvatarEditor';
import { ViewSwitcher } from '../../components/ViewSwitcher';
import { CompanionNotice, type CompanionSlot } from '../../components/CompanionNotice';
import { StatSummary } from '../../components/StatSummary';
import { RecommendationItem } from '../../components/RecommendationItem';
import { ApiError } from '../../lib/api';
import { VIEW_PREF_KEY, normalizeViewPref, type ViewPref } from '../../lib/viewMode';
import { STUDENT_HOME_QUERY_KEYS } from '../../features/student-home/types';
import { getMe, getHomeSummary, listHomeNotifications, listPinnedRecommendations, isUnread, markRead, notificationKind, type HomeNotification, type HomeSummary, type MeProfile, type PinnedRecommendation } from '../../features/home/api';
import { listMyRegistrations } from '../../features/programs/api';
import type { Registration } from '../../features/programs/types';
import { sortRecommendations } from '../../features/recommendations/helpers';
import { listReports, getReport, type ReportListItem } from '../../features/reports/api';
import { toColomboDisplay } from '../../lib/time';
import styles from './HomePage.module.css';

function greetingFor(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(name?: string | null): string {
  if (!name) return 'EM';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'EM';
}

/** /app Home: greeting + CompanionNotice, identity, stats, pinned, upcoming, notices. */
export function HomePage() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewPref>(() => {
    try { return normalizeViewPref(localStorage.getItem(VIEW_PREF_KEY)); } catch { return 'student'; }
  });
  useEffect(() => {
    const read = () => {
      try { setView(normalizeViewPref(localStorage.getItem(VIEW_PREF_KEY))); } catch { /* noop */ }
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ViewPref>).detail;
      if (detail === 'parent' || detail === 'student') setView(detail);
      else read();
    };
    window.addEventListener('storage', read);
    window.addEventListener('em:view-change' as never, onCustom as never);
    return () => {
      window.removeEventListener('storage', read);
      window.removeEventListener('em:view-change' as never, onCustom as never);
    };
  }, []);
  const [me, setMe] = useState<MeProfile | null>(null);
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [pinned, setPinned] = useState<PinnedRecommendation[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [notes, setNotes] = useState<HomeNotification[]>([]);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, sumRes] = await Promise.all([getMe(), getHomeSummary()]);
        setMe(meRes);
        setSummary(sumRes);
        const [pinRes, regRes, noteRes, repRes] = await Promise.all([
          listPinnedRecommendations(),
          listMyRegistrations().catch(() => [] as Registration[]),
          listHomeNotifications(20),
          listReports().catch(() => [] as ReportListItem[]),
        ]);
        setPinned(sortRecommendations(pinRes.map((r) => ({ ...r, priority: (r as { priority?: string }).priority ?? 'MED', status: r.status ?? 'Active' })) as never[]).slice(0, 3) as never[]);
        setRegs(regRes);
        setNotes(noteRes);
        setReports(repRes);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Failed to load home.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayName = me?.displayName || me?.email || 'Student';
  const elevateMeId = summary?.elevateMeId ?? me?.elevateMeId ?? '—';
  const institute = summary?.institute ?? '—';

  const unread = useMemo(() => notes.filter(isUnread), [notes]);
  const unreadReports = useMemo(() => unread.filter((n) => notificationKind(n) === 'report'), [unread]);
  const unreadReplies = useMemo(() => unread.filter((n) => notificationKind(n) === 'reply'), [unread]);

  // Mark notifications read when the destination is opened (PATCH /notifications/{id}/read).
  const markIdsRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setNotes((prev) =>
      prev.map((n) =>
        ids.includes(n.id) ? { ...n, read: true, read_at: new Date().toISOString() } : n,
      ),
    );
    ids.forEach((id) => markRead(id).catch(() => {}));
  }, []);
  const handleOpenReports = useCallback(() => {
    markIdsRead(unreadReports.map((n) => n.id));
  }, [markIdsRead, unreadReports]);
  const handleOpenReplies = useCallback(() => {
    markIdsRead(unreadReplies.map((n) => n.id));
  }, [markIdsRead, unreadReplies]);

  const upcoming = useMemo(() => {
    const active = regs.filter((r) => r.status === 'CONFIRMED' || r.status === 'PENDING_PAYMENT');
    return active.slice(0, 1)[0] ?? null;
  }, [regs]);

  const latestLow = useMemo(() => {
    if (reports.length === 0) return null;
    const sorted = [...reports].sort((a, b) => {
      const ta = Date.parse(a.startsAt ?? a.starts_at ?? a.releasedAt ?? '');
      const tb = Date.parse(b.startsAt ?? b.starts_at ?? b.releasedAt ?? '');
      return ta - tb;
    });
    return sorted[sorted.length - 1] ?? null;
  }, [reports]);

  // Low <30 calm attention: inspect latest report via detail shape when available.
  const [lowDetail, setLowDetail] = useState<{ hasLow: boolean; reportId: string | null }>({ hasLow: false, reportId: null });
  useEffect(() => {
    if (!latestLow?.id) return;
    (async () => {
      try {
        const d = await getReport(latestLow.id);
        const marks = d.marks ?? [];
        const hasLow = marks.some((m) => typeof m.score === 'number' && m.score < 30);
        setLowDetail({ hasLow, reportId: hasLow ? d.id : null });
      } catch {
        setLowDetail({ hasLow: false, reportId: null });
      }
    })();
  }, [latestLow?.id]);

  const companion = useMemo((): { slot: CompanionSlot; message: string; link: string | null } => {
    if (unreadReports.length > 0) return { slot: 'report', message: `You have ${unreadReports.length} new report update${unreadReports.length > 1 ? 's' : ''}. Open Reports to review.`, link: '/app/reports' };
    if (unreadReplies.length > 0) return { slot: 'reply', message: `You have ${unreadReplies.length} new repl${unreadReplies.length > 1 ? 'ies' : 'y'} to your queries.`, link: '/app/queries' };
    if (lowDetail.hasLow && lowDetail.reportId) return { slot: 'report', message: 'One area in your latest report could use steady practice. Small steps count.', link: `/app/reports/${encodeURIComponent(lowDetail.reportId)}` };
    if ((summary?.pointsGained ?? 0) > 0) return { slot: 'celebration', message: `Nice progress — you gained ${summary?.pointsGained} points from baseline.`, link: null };
    if (upcoming) return { slot: 'wave', message: `Your next session is ${upcoming.programTitle}. Good luck — Pip is here.`, link: null };
    return { slot: 'idle', message: 'Welcome back. Your progress overview is below.', link: null };
  }, [unreadReports.length, unreadReplies.length, lowDetail.hasLow, lowDetail.reportId, summary?.pointsGained, upcoming]);

  const handleCompanionOpen = useCallback(() => {
    if (companion.slot === 'report') handleOpenReports();
    else if (companion.slot === 'reply') handleOpenReplies();
  }, [companion.slot, handleOpenReports, handleOpenReplies]);

  const isZeroData =
    !loading && !error && (summary?.sampleSize ?? reports.length) === 0 && (summary?.programsAttended ?? 0) === 0;

  // Session-present photo replace: AvatarEditor uploads immediately (no deferral);
  // on success invalidate me+summary queries and refresh local state (SignUpPage pattern with session).
  const handlePhotoUploaded = useCallback(async (photoUrl: string) => {
    setSummary((prev) => (prev ? { ...prev, photo: photoUrl } : prev));
    try {
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.me });
      await qc.invalidateQueries({ queryKey: STUDENT_HOME_QUERY_KEYS.summary });
      const [meRes, sumRes] = await Promise.all([getMe(), getHomeSummary()]);
      setMe(meRes);
      setSummary(sumRes);
    } catch {
      /* keep optimistic photo on refresh failure */
    }
  }, [qc]);

  return (
    <main className={styles.page} data-testid="page-app-home">
      <div className={styles.viewRow}>
        <ViewSwitcher view={view} onViewChange={setView} />
      </div>
      {view === 'parent' && (
        <div className={styles.parentBanner} role="status" data-testid="parent-banner">
          <strong>Viewing as Parent — {displayName}&apos;s progress</strong>
          <p>Same progress overview with calm highlights. Switching views only changes presentation — access stays the same.</p>
        </div>
      )}
      <PageHeading title={`${greetingFor()}, ${displayName}`} desc="Your progress overview." />
      <CompanionNotice slot={companion.slot} message={companion.message} userId={me?.id ?? null} link={companion.link} onLinkOpen={handleCompanionOpen} />
      {loading && <p role="status">Loading…</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!loading && !error && (
        <>
          <section className={styles.profile} aria-label="Profile">
            <div className={styles.photo}>
              {summary?.photo ? <img src={summary.photo} alt={`${displayName} profile photo`} loading="lazy" decoding="async" /> : <span aria-hidden="true">{initials(displayName)}</span>}
            </div>
            <div>
              <h2 className={styles.name}>{displayName}</h2>
              <p className={styles.meta}>ElevateMe ID: {elevateMeId}</p>
              <p className={styles.meta}>Institute: {institute}</p>
              <div className={styles.avatarReplace}>
                <AvatarEditor name={displayName} photoUrl={summary?.photo ?? undefined} onUploaded={(url) => void handlePhotoUploaded(url)} />
              </div>
            </div>
          </section>

          <StatSummary
            items={[
              ['Programs attended', String(summary?.programsAttended ?? 0)],
              [
                'Personal best',
                summary?.personalBest == null ? '—' : `${summary.personalBest} / 100`,
                summary?.baselineLabel ?? (summary?.baseline != null ? `Baseline ${summary.baseline}` : 'No baseline yet'),
              ],
              ['Points gained', summary?.pointsGained == null ? '—' : `+${summary.pointsGained}`],
            ]}
          />

          {lowDetail.hasLow && lowDetail.reportId && (
            <section className={styles.section} aria-label="Needs attention">
              <div className={styles.notice} role="note">
                <p>
                  One area in your latest report is below 30. This is a calm nudge — review the
                  feedback when ready. <Link to={`/app/reports/${encodeURIComponent(lowDetail.reportId)}`}>Open the report</Link>
                  {' '}or <Link to="/app/performance">view your progress</Link>.
                </p>
              </div>
            </section>
          )}

          {isZeroData ? (
            <section className={styles.section} aria-label="Getting started">
              <h2>Getting started</h2>
              <ol className={styles.onboarding}>
                <li><Link to="/app/programs">Register for a program</Link> — discover standard programs.</li>
                <li><Link to="/app/registrations">Participate in your session</Link> — attend your allocated session.</li>
                <li><Link to="/app/reports">Receive your report</Link> — released results appear here.</li>
              </ol>
            </section>
          ) : (
            <>
              <section className={styles.section} aria-label="Recommendations">
                <h2>Pinned recommendations</h2>
                {pinned.length === 0 ? (
                  <EmptyState title="No pinned recommendations" body="Admin-pinned guidance will appear here." />
                ) : (
                  <div className={styles.recoList}>
                    {pinned.map((r) => (
                      <RecommendationItem key={r.id} date={r.date ?? ''} status={r.status ?? 'active'} title={r.title} body={r.body ?? ''} />
                    ))}
                  </div>
                )}
                <p className={styles.meta}><Link to="/app/recommendations">View all recommendations</Link> (human guidance lives there, not in insights).</p>
              </section>

              <section className={styles.section} aria-label="Upcoming session">
                <h2>Upcoming registered session</h2>
                {!upcoming ? (
                  <EmptyState title="No upcoming session" body="Discover a program and register once." action={<Link to="/app/programs">Discover programs</Link>} />
                ) : (
                  <div className={styles.upcoming}>
                    <p><Link to={`/programs/${encodeURIComponent(upcoming.programId)}`}>{upcoming.programTitle}</Link></p>
                    <p className={styles.meta}>
                      {upcoming.allocation ? `Allocation: ${upcoming.allocation} · ` : ''}{upcoming.status}
                    </p>
                  </div>
                )}
              </section>

              <section className={styles.section} aria-label="Notices">
                <h2>Notices</h2>
                {unread.length === 0 ? (
                  <p className={styles.meta}>No unread report or reply notices.</p>
                ) : (
                  <ul className={styles.recoList}>
                    {unreadReports.slice(0, 3).map((n) => (
                      <li key={n.id} className={styles.upcoming}>
                        New report update — <Link to="/app/reports" onClick={handleOpenReports}>Open reports</Link>
                      </li>
                    ))}
                    {unreadReplies.slice(0, 3).map((n) => (
                      <li key={n.id} className={styles.upcoming}>
                        New reply to your query — <Link to="/app/queries" onClick={handleOpenReplies}>Open queries</Link>
                      </li>
                    ))}
                  </ul>
                )}
                {reports.length > 0 && latestLow && (
                  <p className={styles.meta}>
                    Latest report: {(latestLow.sessionName || latestLow.programName || 'Report')}
                    {' '}· {latestLow.startsAt || latestLow.starts_at ? toColomboDisplay(String(latestLow.startsAt ?? latestLow.starts_at)) : ''}
                    {' '}· <Link to={`/app/reports/${encodeURIComponent(latestLow.id)}`}>Open</Link>
                  </p>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
