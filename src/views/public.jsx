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

  // the landing page is always dark; leaving it puts the rest of the app back to light
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    return () => root.removeAttribute('data-theme');
  }, []);
  return (
    <>
      <div className="landing-topbar"><div className="wrap"><span>A student growth platform</span><span>Built for measurable progress</span></div></div>
      <header className="landing-nav"><div className="wrap">
        <Link className="brand" to="/" aria-label="ElevateMe home"><img src="/images/logo.png" alt="ElevateMe logo" style={{ height: '32px', width: 'auto' }} /></Link>
        <nav className="landing-links" aria-label="Primary navigation" style={menu ? { display: 'flex' } : undefined}>
  <a href="#how">How it works</a><a href="#people">For everyone</a>
  <Link className="button" to="/student">Open app <span aria-hidden="true">↗</span></Link>
  {/* <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" className="theme-toggle" onClick={() => setDark((d) => !d)}>
    <span className="theme-toggle-knob" aria-hidden="true">{dark ? '☾' : '☀'}</span>
  </button> */}
</nav>
        <button className="menu-button" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>{menu ? 'Close' : 'Menu'}</button>
      </div></header>
      <main>
        <section className="hero"><div className="wrap">
          {/* <div className="hero-eyebrow hero-enter">Every session becomes progress</div> */}
          <div className="hero-grid">
            <div>
              <h1 className="hero-enter" style={{ '--d': '80ms' }}>A TOOL<br />FOR <em>VISIBLE GROWTH</em></h1>
              <p className="hero-copy hero-enter" style={{ '--d': '160ms' }}>A clear path from each session to a stronger Public Speaking, Communication, Negotiation and Leadership skills: with professional evaluation, honest progress and human guidance.</p>
              <div className="hero-actions hero-enter" style={{ '--d': '240ms' }}>
                {/* <Link className="button" to="/programs">Explore programs <span aria-hidden="true">→</span></Link> */}
                {/* <Link className="button secondary" to="/student">Preview the app</Link> */}
                <Link className="button secondary pill" to="/sign-up">Create account <span className="pill-arrow" aria-hidden="true">→</span></Link>
<Link className="button secondary pill" to="/sign-in">Log In to account <span className="pill-arrow" aria-hidden="true">→</span></Link>
              </div>
            </div>
            <aside className="mini-panel hero-enter" style={{ '--d': '200ms' }} aria-label="Example performance insight">
              <div className="panel-top"><span className="panel-title">Your performance</span><span className="status">Improving</span></div>
              <div className="mini-chart">
                <svg viewBox="0 0 420 130" role="img" aria-label="Confidence score increasing across five sessions">
                  <polyline className="draw-line" points="8,108 106,92 205,98 304,58 412,27" fill="none" stroke="#16834b" strokeWidth="5" strokeLinecap="square" />
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

        {/* <section className="metrics-band" aria-label="Platform highlights"><Reveal className="wrap stagger-group">
          <div className="metric-band"><b>1 profile</b><span>One continuous record of student growth</span></div>
          <div className="metric-band"><b>Your skills</b><span>A consistent, structured evaluation</span></div>
          <div className="metric-band"><b>Clear next steps</b><span>Recommendations backed by performance</span></div>
        </Reveal></section> */}
                <section className="landing-section" id="people"><div className="wrap">
  <div className="role-copy" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
    <h2>OUR FOCUS:<br />TRAITS OF MODERN DIPLOMACY.</h2>
  </div>
  <Reveal className="focus-grid stagger-group">
  {[
    ['Public Speaking', 'Express your thoughts with clarity and articulate them with confidence.',
      <svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>],
    ['Communication', 'Make yourself clear and convincing to your audience.',
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M13 8H7" /><path d="M17 12H7" /></svg>],
    ['Negotiation Skills', 'Achieve your desired outcomes through strategy, persuasion, and respect.',
      <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>],
    ['Leadership', 'Become a leader others trust, respect, and willingly follow.',
      <svg viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>],
  ].map(([title, sub, icon]) => (
    <article key={title} className="focus-card">
      <span className="focus-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{sub}</p>
    </article>
  ))}
</Reveal>
  {/* <div className="quote" style={{ textAlign: 'center', maxWidth: 720, margin: '34px auto 0' }}>Simple enough to use during a live session. Structured enough to support long-term development.</div> */}
</div>
</section>

        <section className="landing-section" id="how"><div className="wrap">
  <div className="section-head-grid" style={{ gridTemplateColumns: '1fr' }}>
    <div><h2>METHODOLOGY OF PROGRESS VIA<br />INDIVIDUAL TALENT OPTIMIZATION (ITO).</h2></div>
  </div>
  <Reveal className="flow stagger-group">
    <article className="step"><div className="step-no">01 / DISCOVER</div><h3>Join a SDP</h3><p>Skill Development Programme</p></article>
    <article className="step"><div className="step-no">02 / PARTICIPATE</div><h3>Tracking and Recognition</h3><p>Identification of Individual Talents
and Areas of Weaknesses 
Through Professional Evaluation.</p></article>
    <article className="step"><div className="step-no">03 / UNDERSTAND</div><h3>Record</h3><p>Accessibility to present and past perfomance reports with graded evaluations.</p></article>
    <article className="step"><div className="step-no">04 / ELEVATE</div><h3>Progress</h3><p>Targeted development programmes to elevate diplomatic skills</p></article>
  </Reveal>
</div></section>



        {/* <section className="landing-section dark" id="performance"><Reveal className="wrap performance-grid stagger-group">
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
        </Reveal></section> */}

<section className="landing-section" id="programs"><div className="wrap">
  <div className="section-head-grid" style={{ gridTemplateColumns: '1fr', textAlign: 'right' }}>
    <div>
      <h2>SKILL DEVELOPMENT<br />PROGRAMS.</h2>
      <p style={{ marginLeft: 'auto' }}>Build communication, leadership and critical-thinking skills through structured experiences—each one connected to your long-term growth record.</p>
    </div>
  </div>
  <Reveal className="program-single stagger-group">
  <article className="program-card program-card-wide">
    <div>
      <h3>Model Diplomacy</h3>
      <p>A 5-Level pathway aiming to mould a real-world Diplomat</p>
    </div>
    <span className="program-arrow" aria-hidden="true">↗</span>
  </article>
</Reveal>
</div></section>

<section className="landing-section" id="pathway"><div className="wrap">
  <div className="role-copy" style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
    <h2>AMBITIOUS<br />PATHWAY.</h2>
  </div>
<Reveal className="pathway-grid">
  {[
    { label: 'A Confident Communicator',      img: '/images/pathway/confident-communicator.jpg' },
    { label: 'A Persuasive Speaker',          img: '/images/pathway/persuasive-speaker.jpg' },
    { label: 'A Skilled Negotiator',          img: '/images/pathway/skilled-negotiator.jpg' },
    { label: 'A Critical Thinker',            img: '/images/pathway/critical-thinker.jpg' },
    { label: 'An Effective Leader',           img: '/images/pathway/effective-leader.jpg' },
    { label: 'A Creative Problem Solver',     img: '/images/pathway/creative problem solver.jpg' },
    { label: 'An Independent Decision Maker', img: '/images/pathway/independant decision maker.jpg' },
    { label: 'A Model Diplomat',              img: '/images/pathway/model diplomat.jpg' },
  ].map(({ label, img }, i, all) => (
    <article
      key={label}
      className={`pathway-box${i === all.length - 1 ? ' final' : ''}`}
      style={{ '--delay': `${0.1 + i * 0.12}s` }}
    >
      <div className="pathway-img">
        <span className="pathway-num">{String(i + 1).padStart(2, '0')}</span>
        {img ? (
          <img src={img} alt={label} loading="lazy" />
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
        )}
      </div>
      <h3>{label}</h3>
    </article>
  ))}
</Reveal>
</div></section>

        <section className="cta-band" id="join"><Reveal className="wrap cta-grid stagger-group"><h2>YOUR NEXT LEVEL<br />STARTS HERE.</h2><div>
  <p>Explore the complete application preview and see how every role connects.</p>
  <div className="cta-price">
    <span className="cta-price-badge">Limited-time offer · 50% off</span>
    <div className="cta-price-row">
      <s className="cta-price-old">LKR 10,000</s>
      <strong className="cta-price-new">LKR 5,000</strong>
      <span className="cta-price-per">/ year</span>
    </div>
    <span className="cta-price-note">ElevateMe is an annual plan at LKR 10,000 per year. Get 50% off for a limited time.</span>
  </div>
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link className="button" to="/student">Open the app <span aria-hidden="true">↗</span></Link><Link className="button" to="/sign-up">Create account</Link></div>
</div></Reveal></section>
      </main>
      <footer className="landing-footer"><div className="wrap footer-grid">
        <Link className="brand" to="/"><img src="/images/logo.png" alt="ElevateMe logo" style={{ height: '32px', width: 'auto' }} /></Link>
        <nav className="footer-links" aria-label="Footer navigation"><a href="#how">How it works</a><Link to="/student">Open app</Link></nav>
        <div className="copyright"><span>© 2026 ElevateMe by Diplomatic Impact</span><span>Student growth, made visible.</span></div>
      </div></footer>
    </>
  );
}

/* ---------- About ---------- */
export function About() {
  return (
    <div className="public-main" style={{ maxWidth: 1240, margin: 'auto', padding: '70px 18px 90px' }}>
      <PageHead kicker="About ElevateMe" title="Student growth, made visible." desc="A Diplomatic Impact platform. DI admins run programs, invited resource persons score ten criteria, and students and parents see progress and recommendations." />
      <div className="flow">
        <article className="step"><div className="step-no">01</div><h3>Create & approve</h3><p>DI admins draft, review and publish programmes.</p></article>
        <article className="step"><div className="step-no">02</div><h3>Join & confirm</h3><p>Students join; DI admins confirm or waitlist every request.</p></article>
        <article className="step"><div className="step-no">03</div><h3>Evaluate & release</h3><p>Invited resource persons score ten criteria; admins review and release reports.</p></article>
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
                <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>After you join: request enters <strong>Pending</strong> → DI confirms → outcome under My Registrations.</p>
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
