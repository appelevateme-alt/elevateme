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

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const NAV_ITEMS = [
  { href: '#people', label: 'Focus', icon: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></> },
  { href: '#how', label: 'Method', icon: <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></> },
  { href: '#programs', label: 'Programs', icon: <><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></> },
  { href: '#pathway', label: 'Pathway', icon: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></> },
  { href: '#join', label: 'Pricing', icon: <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></> },
];

/* ---------- Landing (prototype index.html) ---------- */
export function Home() {
  const { session } = useAuth();
  const [active, setActive] = useState('');
const lockUntil = useRef(0);
  // const [menu, setMenu] = useState(false);

  // the landing page is always dark; leaving it puts the rest of the app back to light
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    return () => root.removeAttribute('data-theme');
  }, []);
  // highlight the nav item for the section currently in view
useEffect(() => {
  if (typeof IntersectionObserver === 'undefined') return;
  const targets = [
    document.querySelector('.hero'), // no nav item: clears the highlight at the top
    ...NAV_ITEMS.map(({ href }) => document.getElementById(href.slice(1))),
  ].filter(Boolean);

  const io = new IntersectionObserver(
    (entries) => {
      if (Date.now() < lockUntil.current) return; // ignore sections passed while a click is scrolling
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id || ''); });
    },
    { rootMargin: '-40% 0px -55% 0px' }, // a thin band near the middle of the screen
  );
  targets.forEach((el) => io.observe(el));
  return () => io.disconnect();
}, []);
  return (
    <>
    <Link className="landing-logo" to="/" aria-label="ElevateMe home"><img src="/images/logo.png" alt="ElevateMe logo" /></Link>
      <header className="landing-nav"><div className="wrap">
  
  <nav className="landing-links" aria-label="Primary navigation">
    {NAV_ITEMS.map(({ href, label, icon }) => {
  const id = href.slice(1);
  return (
    <a
      key={href}
      href={href}
      className={`nav-item${active === id ? ' active' : ''}`}
      aria-label={label}
      aria-current={active === id ? 'location' : undefined}
      title={label}
      onClick={() => { lockUntil.current = Date.now() + 1100; setActive(id); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
      <span>{label}</span>
    </a>
  );
})}
    <Link className="button nav-open" to="/student" aria-label="Open app" title="Open app">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10" /><path d="M7 17 17 7" /></svg>
    </Link>
  </nav>
</div></header>
      <main>
     <section className="hero"><div className="wrap">
  <div className={`hero-grid${session ? '' : ' hero-solo'}`}>
    <div>
      <h1 className="hero-enter" style={{ '--d': '80ms' }}>A Tool for <br />Visible Growth</h1>
      <p className="hero-copy hero-enter" style={{ '--d': '160ms' }}>A clear path to stronger Public Speaking, Communication, Negotiation and Leadership skills with professional evaluation and human guidance.</p>
      <div className="hero-actions hero-enter" style={{ '--d': '240ms' }}>
        <Link className="button secondary pill" to="/sign-up">Create account <span className="pill-arrow" aria-hidden="true">↗</span></Link>
        <Link className="button secondary pill" to="/sign-in">Log In to account <span className="pill-arrow" aria-hidden="true">↗</span></Link>
      </div>
    </div>
    {session && (
      <aside className="me-card hero-enter" style={{ '--d': '200ms' }} aria-label="Your account">
        <div className="me-avatar" aria-hidden="true"><span>{initialsFor(session.name)}</span></div>
        <strong className="me-name">{session.name}</strong>
        {session.elevateMeId && <span className="me-id">{session.elevateMeId}</span>}
      </aside>
    )}
  </div>
</div></section>

        {/* <section className="metrics-band" aria-label="Platform highlights"><Reveal className="wrap stagger-group">
          <div className="metric-band"><b>1 profile</b><span>One continuous record of student growth</span></div>
          <div className="metric-band"><b>Your skills</b><span>A consistent, structured evaluation</span></div>
          <div className="metric-band"><b>Clear next steps</b><span>Recommendations backed by performance</span></div>
        </Reveal></section> */}
                <section className="landing-section" id="people"><div className="wrap">
  <div className="role-copy focus-heading" style={{ textAlign: 'center', maxWidth: 'none', margin: '0 auto' }}>
  <h2>Our Focus: Traits Of Modern Diplomacy.</h2>
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
    ].map(([title, sub, icon], i) => (
    <article key={title} className="focus-card">
      <span className="focus-icon" aria-hidden="true">{icon}</span>
      <span className="focus-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
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
    <div>
  <h2 className="ito-title">
    <span className="ito-mid">Methodology of Progress</span>
    <span className="ito-small">Via</span>
    <span className="ito-big">Individual Talent Optimization (ITO)</span>
  </h2>
</div>
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
      <h2>Skill Development<br />Programs.</h2>
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
    <h2>Ambitious<br />Pathway.</h2>
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
      style={{ '--delay': `${0.1 + i * 0.12}s`, '--i': i }}
    >
      <div className="pathway-img">
        {/* <span className="pathway-num">{String(i + 1).padStart(2, '0')}</span> */}
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

        <section className="cta-band" id="join"><Reveal className="wrap cta-grid stagger-group"><h2>A Clear Pathway To Become a<  br />Model Diplomat.</h2><div>
  {/* <p>Explore the complete application preview and see how every role connects.</p> */}
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
