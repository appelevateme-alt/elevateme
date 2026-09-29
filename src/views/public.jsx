import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, PageHead, Status, Empty, Pagination, SkeletonRows } from '../components/ui.jsx';
import { ProgramListRow, RegistrationPanel } from '../components/domain.jsx';
import { useSupabaseList, useSupabaseRecord } from '../lib/useSupabase.js';
import { toProgram, toSession, toRegistration } from '../lib/adapters.js';
import { useAuth } from '../lib/auth.jsx';

/* ---------- Scroll reveal (IntersectionObserver, CSS animates) ---------- */
function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal${shown ? ' revealed' : ''}${className ? ` ${className}` : ''}`} style={{ '--reveal-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

/* ---------- Landing (prototype index.html) ---------- */
export function Home() {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="landing-topbar"><div className="wrap"><span>A student growth platform by Diplomatic Impact</span><span>Built for measurable progress</span></div></div>
      <header className="landing-nav"><div className="wrap">
        <Link className="brand" to="/" aria-label="ElevateMe home">Elevate<span>Me</span></Link>
        <nav className="landing-links" aria-label="Primary navigation" style={menu ? { display: 'flex' } : undefined}>
          <a href="#how">How it works</a><a href="#people">For everyone</a><a href="#performance">Performance</a>
          <Link to="/programs">Programs</Link>
          <Link className="button" to="/student">Open app <span aria-hidden="true">↗</span></Link>
        </nav>
        <button className="menu-button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? 'Close' : 'Menu'}</button>
      </div></header>
      <main>
        <section className="hero"><div className="wrap">
          <div className="hero-eyebrow hero-enter">Every session becomes progress</div>
          <div className="hero-grid">
            <div>
              <h1 className="hero-enter" style={{ '--d': '80ms' }}>GROWTH,<br />MADE <em>VISIBLE.</em></h1>
              <p className="hero-copy hero-enter" style={{ '--d': '160ms' }}>ElevateMe turns programmes, evaluations and recommendations into one clear record of how every student is developing.</p>
              <div className="hero-actions hero-enter" style={{ '--d': '240ms' }}>
                <Link className="button" to="/programs">Explore programs <span aria-hidden="true">→</span></Link>
                <Link className="button secondary" to="/student">Preview the app</Link>
                <Link className="button secondary" to="/sign-up">Create account</Link>
              </div>
            </div>
            <aside className="mini-panel hero-enter" style={{ '--d': '200ms' }} aria-label="Example performance insight">
              <div className="panel-top"><span className="panel-title">Your performance</span><span className="status">Improving</span></div>
              <div className="mini-chart">
                <svg viewBox="0 0 420 130" role="img" aria-label="Confidence score increasing across five sessions">
                  <polyline className="draw-line" points="8,108 106,92 205,98 304,58 412,27" fill="none" stroke="#e37f6f" strokeWidth="5" strokeLinecap="square" />
                  <g className="fade-late" fill="#fff" stroke="#101114" strokeWidth="3">
                    <circle cx="8" cy="108" r="6" /><circle cx="106" cy="92" r="6" /><circle cx="205" cy="98" r="6" />
                    <circle cx="304" cy="58" r="6" /><circle cx="412" cy="27" r="7" fill="#c8ff65" />
                  </g>
                </svg>
              </div>
              <div className="chart-labels"><span>Session 01</span><span>Session 05</span></div>
              <div className="hero-insight"><div className="hero-insight-num">+18%</div><p><strong>Confidence is your fastest-growing skill.</strong><br />You improved across four of your last five evaluated sessions.</p></div>
            </aside>
          </div>
        </div></section>

        <section className="metrics-band" aria-label="Platform highlights"><Reveal className="wrap stagger-group">
          <div className="metric-band"><b>01 profile</b><span>One continuous record of student growth</span></div>
          <div className="metric-band"><b>10 skills</b><span>A consistent, structured evaluation</span></div>
          <div className="metric-band"><b>Clear next steps</b><span>Recommendations backed by performance</span></div>
        </Reveal></section>

        <section className="landing-section" id="how"><div className="wrap">
          <div className="section-head-grid"><div><div className="hero-eyebrow">The ElevateMe journey</div></div><div><h2>FROM PARTICIPATION<br />TO PROGRESS.</h2><p>Every stage connects. Students join meaningful programs, receive structured feedback, understand their development and know what to work on next.</p></div></div>
          <Reveal className="flow stagger-group">
            <article className="step"><div className="step-no">01 / DISCOVER</div><h3>Join a program</h3><p>Explore approved events, continuous programmes and special development opportunities.</p></article>
            <article className="step"><div className="step-no">02 / PARTICIPATE</div><h3>Build real skills</h3><p>Take part in Model UN, debates, speaking programmes and other guided experiences.</p></article>
            <article className="step"><div className="step-no">03 / UNDERSTAND</div><h3>Receive evaluation</h3><p>Qualified evaluators assess ten consistent areas and provide useful remarks.</p></article>
            <article className="step"><div className="step-no">04 / ELEVATE</div><h3>Act on insight</h3><p>See trends, identify strengths and follow clear recommendations for the next level.</p></article>
          </Reveal>
        </div></section>

        <section className="landing-section" id="people"><div className="wrap roles-grid">
          <Reveal className="role-list stagger-group">
            {[['01', 'Students', 'Own your growth journey', '/student'], ['02', 'Teachers & coordinators', 'Create programs and support progress', '/coordinator'], ['03', 'Parents', 'Stay informed with clarity', '/parent'], ['04', 'Resource persons', 'Evaluate with one clear framework', '/evaluator']].map(([i, h, s, to]) => (
              <Link key={i} className="role-row" to={to}><span className="role-index">{i}</span><div><h3>{h}</h3><span className="role-sub">{s}</span></div><span className="role-arrow" aria-hidden="true">↗</span></Link>
            ))}
          </Reveal>
          <div className="role-copy"><div className="hero-eyebrow">Designed around people</div><h2>ONE SYSTEM.<br />EVERYONE ALIGNED.</h2><p>ElevateMe gives each person exactly what they need. Students see progress. Parents understand it. Teachers coordinate it. Evaluators record it. Diplomatic Impact guides what comes next.</p><div className="quote">Simple enough to use during a live session. Structured enough to support long-term development.</div></div>
        </div></section>

        <section className="landing-section dark" id="performance"><Reveal className="wrap performance-grid stagger-group">
          <div><div className="hero-eyebrow">Performance, explained</div><h2>NOT JUST<br />A SCORE.</h2><p>Track performance by skill, period and session. Then turn the numbers into straightforward, evidence-based insights a student can act on.</p><Link className="button" style={{ marginTop: 26, background: 'var(--lime)', color: 'var(--ink)', borderColor: 'var(--lime)' }} to="/student/performance">Preview performance →</Link></div>
          <div className="insights-card">
            <div className="insights-filterbar"><span className="insights-filter">Skill: Confidence⌄</span><span className="insights-filter">Period: 6 months⌄</span><span className="insights-filter">All sessions⌄</span></div>
            <div className="big-chart">
              <svg viewBox="0 0 600 230" role="img" aria-label="Example performance trend rising over six sessions">
                <path className="draw-line" d="M8 194 C70 184,90 158,126 165 S190 180,235 130 S308 102,352 112 S430 81,465 58 S538 48,590 18" fill="none" stroke="#c8ff65" strokeWidth="5" />
                <path d="M8 194 C70 184,90 158,126 165 S190 180,235 130 S308 102,352 112 S430 81,465 58 S538 48,590 18 L590 230 L8 230Z" fill="#c8ff65" opacity=".16" />
                <g className="fade-late" fill="#17191e" stroke="#c8ff65" strokeWidth="3">
                  <circle cx="8" cy="194" r="6" /><circle cx="126" cy="165" r="6" /><circle cx="235" cy="130" r="6" />
                  <circle cx="352" cy="112" r="6" /><circle cx="465" cy="58" r="6" /><circle cx="590" cy="18" r="7" />
                </g>
              </svg>
            </div>
            <div className="insight-row-dark"><label>Strongest change</label><p>Confidence rose steadily across the last four evaluated sessions.</p></div>
            <div className="insight-row-dark"><label>Next focus</label><p>Counter arguments is the clearest opportunity for your next programme.</p></div>
          </div>
        </Reveal></section>

        <section className="landing-section" id="programs"><div className="wrap">
          <div className="section-head-grid"><div><div className="hero-eyebrow">Programs with purpose</div></div><div><h2>LEARN BY<br />DOING.</h2><p>Build communication, leadership and critical-thinking skills through structured experiences—each one connected to your long-term growth record.</p></div></div>
          <Reveal className="flow stagger-group">
            <article className="step"><div className="step-no">SINGLE EVENT</div><h3>Model United Nations</h3><p>Committees, country representation and performance feedback in one connected experience.</p></article>
            <article className="step"><div className="step-no">SINGLE EVENT</div><h3>Friendly debates</h3><p>Practice structured argument, counter-arguments, clarity and confident delivery.</p></article>
            <article className="step"><div className="step-no">CONTINUOUS</div><h3>Academic speaking</h3><p>Follow improvement across multiple sessions with longitudinal performance insights.</p></article>
            <article className="step"><div className="step-no">SPECIAL</div><h3>Development programs</h3><p>Focused experiences created around the skills students need most.</p></article>
          </Reveal>
        </div></section>

        <section className="cta-band" id="join"><Reveal className="wrap cta-grid stagger-group"><h2>YOUR NEXT LEVEL<br />STARTS HERE.</h2><div><p>Explore the complete application preview and see how every role connects.</p><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link className="button" to="/student">Open the app <span aria-hidden="true">↗</span></Link><Link className="button" to="/sign-up">Create account</Link></div></div></Reveal></section>
      </main>
      <footer className="landing-footer"><div className="wrap footer-grid">
        <Link className="brand" to="/">Elevate<span>Me</span></Link>
        <nav className="footer-links" aria-label="Footer navigation"><a href="#how">How it works</a><Link to="/programs">Programs</Link><a href="#performance">Performance</a><Link to="/student">Open app</Link></nav>
        <div className="copyright"><span>© 2026 ElevateMe by Diplomatic Impact</span><span>Student growth, made visible.</span></div>
      </div></footer>
    </>
  );
}

/* ---------- About ---------- */
export function About() {
  return (
    <div className="public-main" style={{ maxWidth: 1240, margin: 'auto', padding: '70px 18px 90px' }}>
      <PageHead kicker="About ElevateMe" title="Student growth, made visible." desc="A Diplomatic Impact platform. Coordinators run programs, evaluators score ten criteria, students and parents see progress and recommendations." />
      <div className="flow">
        <article className="step"><div className="step-no">01</div><h3>Create & approve</h3><p>Coordinators draft programs; Diplomatic Impact approves and publishes.</p></article>
        <article className="step"><div className="step-no">02</div><h3>Join & confirm</h3><p>Students join; coordinators confirm or waitlist every request.</p></article>
        <article className="step"><div className="step-no">03</div><h3>Evaluate & release</h3><p>Evaluators score ten criteria; releases control visibility.</p></article>
        <article className="step"><div className="step-no">04</div><h3>Guide growth</h3><p>Insights and recommendations turn results into next steps.</p></article>
      </div>
    </div>
  );
}

/* ---------- Public program directory (Supabase-backed) ---------- */
const PAGE_SIZE = 6;

export function Programs() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, totalPages } = useSupabaseList({
    table: 'programs',
    search: q ? { col: 'title', term: q } : null,
    filters: type ? { type_label: type } : {},
    order: { col: 'start_date', ascending: true },
    page,
    pageSize: PAGE_SIZE,
  });

  const programs = (data || []).map(toProgram).filter((p) => p.status === 'Published' || p.status === 'InProgress');
  const hasActiveFilter = Boolean(q || type);

  return (
    <>
      <header className="public-nav"><div className="inner">
        <Link className="public-brand" to="/">Elevate<span>Me</span></Link>
        <nav className="public-links"><Link to="/#how">How it works</Link><Link to="/#performance">Performance</Link><Link className="button" to="/student">Open app →</Link></nav>
      </div></header>
      <main className="public-main">
        <PageHead kicker="Approved opportunities" title="Programs & events." desc="Meaningful experiences designed to build communication, leadership and critical-thinking skills." />
        <div className="filter-bar">
          <input type="search" placeholder="Search programs" aria-label="Search programs" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <select aria-label="Program type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All program types</option>
            <option>Model United Nations</option>
            <option>Friendly Debate</option>
            <option>Continuous Programme</option>
            <option>Competition</option>
          </select>
        </div>
        {loading && <SkeletonRows rows={4} />}
        {error && <div className="notice"><strong>Couldn’t load programs.</strong> {error.message}</div>}
        {!loading && !error && (
          <>
            <div className="flat-list">
              {programs.length === 0 ? (
                <Empty title="No programs found." body="Try another search or program type." action={hasActiveFilter && <Button variant="secondary" small onClick={() => { setQ(''); setType(''); setPage(1); }}>Clear filters</Button>} />
              ) : (
                programs.map((p) => (
                  <ProgramListRow key={p.id} date={p.date} type={p.typeLabel} title={p.title} meta={p.meta}
                    status={(p.registered ?? 0) >= (p.capacity ?? 0) ? 'RegistrationClosed' : 'Open'}
                    linkTo={`/programs/${p.id}`} actionLabel="View & register →" />
                ))
              )}
            </div>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </main>
    </>
  );
}

/* ---------- Public program detail + registration ---------- */
export function ProgramDetail() {
  const { id } = useParams();
  const { data: row, loading: programLoading, error: programError } = useSupabaseRecord({ table: 'programs', id });
  const { data: sessionRows, loading: sessionsLoading, error: sessionsError } = useSupabaseList({
    table: 'sessions',
    filters: { program_id: id },
    page: 1,
    pageSize: 50,
  });

  if (programLoading) {
    return (
      <>
        <header className="public-nav"><div className="inner">
          <Link className="public-brand" to="/">Elevate<span>Me</span></Link>
          <nav className="public-links"><Link to="/programs">Programs</Link><Link className="button" to="/student">Open app →</Link></nav>
        </div></header>
        <main className="public-main"><p>Loading…</p><SkeletonRows rows={4} /></main>
      </>
    );
  }
  if (programError) {
    return (
      <>
        <header className="public-nav"><div className="inner">
          <Link className="public-brand" to="/">Elevate<span>Me</span></Link>
          <nav className="public-links"><Link to="/programs">Programs</Link><Link className="button" to="/student">Open app →</Link></nav>
        </div></header>
        <main className="public-main"><div className="notice"><strong>Couldn’t load this program.</strong> {programError.message}</div></main>
      </>
    );
  }
  if (!row) return <NotFound />;
  const program = toProgram(row);
  const sessions = (sessionRows || []).map(toSession);

  return (
    <>
      <header className="public-nav"><div className="inner">
        <Link className="public-brand" to="/">Elevate<span>Me</span></Link>
        <nav className="public-links"><Link to="/programs">Programs</Link><Link className="button" to="/student">Open app →</Link></nav>
      </div></header>
      <main className="public-main">
        <PageHead kicker={program.typeLabel} title={`${program.title}.`}
          desc={`${program.institute} · ${program.venue} · ${program.startDate} → ${program.endDate}`}
          action={<Status value={program.status} />} />
        <div className="grid dashboard">
          <div>
            <p style={{ color: 'var(--muted)', maxWidth: 640 }}>{program.description}</p>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{program.registered}/{program.capacity} registered · {program.meta}</p>
            <h2 className="section-title">Sessions, committees and tracks</h2>
            {sessionsLoading && <p>Loading…</p>}
            {sessionsError && <div className="notice"><strong>Couldn’t load sessions.</strong> {sessionsError.message}</div>}
            {!sessionsLoading && !sessionsError && (
              <div className="flat-list">
                {sessions.length === 0 && <p style={{ color: 'var(--muted)' }}>No sessions published yet.</p>}
                {sessions.map((s) => (
                  <article key={s.id} className="list-row">
                    <div className="row-meta">{s.date}</div>
                    <div className="row-main"><h3>{s.title}</h3><p>{s.topic} · {s.venue}</p></div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <section className="panel"><div className="panel-head"><h2>Registration</h2></div>
            <div className="panel-body">
              <RegistrationPanel programTitle={program.title} programId={program.id} sessions={sessions} closed={program.status === 'RegistrationClosed'} />
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>After you join: request enters <strong>Pending</strong> → coordinator confirms → outcome under My Registrations.</p>
                <Link to="/sign-up" className="link-quiet">New here? Create an account first →</Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export function StudentProgramDetail() {
  const { programId } = useParams();
  const { session } = useAuth();
  const { data: row, loading: programLoading, error: programError } = useSupabaseRecord({ table: 'programs', id: programId });
  const { data: sessionRows, loading: sessionsLoading, error: sessionsError } = useSupabaseList({
    table: 'sessions',
    filters: { program_id: programId },
    page: 1,
    pageSize: 50,
  });
  const { data: regRows, loading: regsLoading, error: regsError } = useSupabaseList({
    table: 'registrations',
    filters: session?.userId ? { student_id: session.userId, program_id: programId } : { program_id: programId },
    page: 1,
    pageSize: 10,
  });

  if (programLoading) return <div><p>Loading…</p><SkeletonRows rows={3} /></div>;
  if (programError) return <div className="notice"><strong>Couldn’t load this program.</strong> {programError.message}</div>;
  if (!row) return <NotFound />;
  const program = toProgram(row);
  const sessions = (sessionRows || []).map(toSession);
  const regs = (regRows || []).map(toRegistration);
  const mine = session?.userId ? regs[0] : null;

  return (
    <div>
      <PageHead kicker={program.typeLabel} title={`${program.title}.`} desc={`${program.institute} · ${program.startDate} → ${program.endDate}`} action={<Status value={program.status} />} />
      <div className="notice" style={{ marginBottom: 22 }}>
        <strong>My registration:</strong> {regsLoading ? 'Loading…' : regsError ? 'Couldn’t load registration.' : mine ? `${mine.status} · ${mine.allocation}` : 'Not registered'}
      </div>
      {sessionsLoading && <p>Loading…</p>}
      {sessionsError && <div className="notice"><strong>Couldn’t load sessions.</strong> {sessionsError.message}</div>}
      {!sessionsLoading && !sessionsError && (
        <RegistrationPanel programTitle={program.title} programId={program.id} sessions={sessions} closed={program.status === 'RegistrationClosed'} />
      )}
    </div>
  );
}

export function NotFound() {
  return (
    <div className="public-main" style={{ maxWidth: 1240, margin: 'auto', padding: '70px 18px 90px' }}>
      <PageHead kicker="Error" title="Page not found." desc="This page does not exist or you do not have access to it." action={<Link to="/" className="button">Back home</Link>} />
    </div>
  );
}
