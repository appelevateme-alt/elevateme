// ElevateMe demo data — program catalog, people and records adopted from the
// approved frontend prototype. Frontend-only mocks; backend owns truth later.

// 50+ scoring model: every student starts from a baseline of 50 and adds
// points per criterion level. PROVISIONAL mapping — confirm exact add-ons:
//   L (Low) +0 · G (Good) +1 · VG (Very Good) +2 · E (Excellent) +3
// With ten criteria the ceiling is 50 + 30 = 80. Change SCORE_MAP in one
// place once the business mapping is finalized.
export const SCORE_GUIDE = 'Baseline 50 · L Low (+0) · G Good (+1) · VG Very Good (+2) · E Excellent (+3)';
export const LEVELS = ['L', 'G', 'VG', 'E'];
export const LEVEL_HELP = { L: 'Low', G: 'Good', VG: 'Very Good', E: 'Excellent' };
export const SCORE_MAP = { L: 0, G: 1, VG: 2, E: 3 };

export function addedPoints(level) {
  return SCORE_MAP[level] ?? 0;
}

// Accepts an object ({criterionKey: level}) or an array ([{level}] or [level]).
// Returns { added, total } where total = 50 + added.
export function total50(levels) {
  const arr = Array.isArray(levels) ? levels.map((l) => l?.level ?? l) : Object.values(levels || {});
  const added = arr.reduce((sum, l) => sum + (SCORE_MAP[l] ?? 0), 0);
  return { added, total: 50 + added };
}

export const TEN_CRITERIA = [
  { key: 'preparation', label: 'Preparation', help: 'Evidence of research and readiness.' },
  { key: 'clarity', label: 'Clarity', help: 'Ideas expressed in a clear, ordered way.' },
  { key: 'confidence', label: 'Confidence', help: 'Composure and self-assurance when speaking.' },
  { key: 'focus', label: 'Focus', help: 'Stays on motion, topic, and time.' },
  { key: 'critical-analysis', label: 'Critical Analysis', help: 'Depth of reasoning and use of evidence.' },
  { key: 'vocal-delivery', label: 'Vocal Delivery', help: 'Volume, pace and projection across the room.' },
  { key: 'audience', label: 'Audience Addressing', help: 'Engages and addresses the audience or committee.' },
  { key: 'counter', label: 'Counter Arguments', help: 'Responds to opposing points directly.' },
  { key: 'wit', label: 'Wit', help: "Timely, appropriate sharpness — never at others' expense." },
  { key: 'overall', label: 'Overall Performance', help: 'Holistic impression for this session.' },
];

export const mockUsers = [
  { id: 'u-student', fullName: 'Nimuthu Fernando', email: 'nimuthu@example.com', roles: ['student'], activeRole: 'student', status: 'Approved' },
  { id: 'u-parent', fullName: 'S. Fernando', email: 's.fernando@example.com', roles: ['parent'], activeRole: 'parent', status: 'Approved' },
  { id: 'u-coord', fullName: 'Ms. Perera', email: 'perera@college.edu', roles: ['coordinator', 'evaluator'], activeRole: 'coordinator', status: 'Approved' },
  { id: 'u-eval', fullName: 'Dr. Jayasinghe', email: 'drj@example.com', roles: ['evaluator'], activeRole: 'evaluator', status: 'Approved' },
  { id: 'u-admin', fullName: 'Diplomatic Impact', email: 'admin@diplomaticimpact.org', roles: ['admin'], activeRole: 'admin', status: 'Approved' },
];

export const mockInstitutes = [
  { id: 'ins-1', name: 'Royal College, Colombo', verified: true },
  { id: 'ins-2', name: 'Ananda College', verified: true },
  { id: 'ins-3', name: 'Gateway College', verified: false },
];

export const mockPrograms = [
  {
    id: 'p-mun',
    date: '24 OCT',
    title: 'Colombo Youth MUN 2026',
    category: 'SingleEvent',
    singleEventType: 'ModelUN',
    typeLabel: 'Model United Nations',
    institute: 'Diplomatic Impact',
    venue: 'BMICH, Colombo',
    startDate: '2026-10-24',
    endDate: '2026-10-25',
    capacity: 72,
    registered: 64,
    status: 'Published',
    description: 'Committees, country representation and performance feedback in one connected experience.',
    meta: '4 committees · Registration open',
  },
  {
    id: 'p-debate',
    date: '02 NOV',
    title: 'Right vs Might',
    category: 'SingleEvent',
    singleEventType: 'FriendlyDebate',
    typeLabel: 'Friendly Debate',
    institute: 'Diplomatic Impact',
    venue: 'Auditorium, Colombo',
    startDate: '2026-11-02',
    endDate: '2026-11-02',
    capacity: 32,
    registered: 0,
    status: 'UnderReview',
    description: 'Practice structured argument, counter-arguments, clarity and confident delivery.',
    meta: '2 sessions · 32 participants',
  },
  {
    id: 'p-speaking',
    date: '08 NOV',
    title: 'Academic Speaking — Cohort 03',
    category: 'ContinuousProgramme',
    typeLabel: 'Continuous Programme',
    institute: 'Diplomatic Impact',
    venue: 'Weekly sessions · Colombo + online',
    startDate: '2026-11-08',
    endDate: '2026-12-20',
    capacity: 24,
    registered: 18,
    status: 'InProgress',
    description: 'Follow improvement across multiple sessions with longitudinal performance insights.',
    meta: '6 weekly sessions · Limited places',
  },
  {
    id: 'p-oratory',
    date: '18 NOV',
    title: 'National Oratory Challenge',
    category: 'SingleEvent',
    singleEventType: 'Competition',
    typeLabel: 'Competition',
    institute: 'Diplomatic Impact',
    venue: 'National Theatre, Colombo',
    startDate: '2026-11-18',
    endDate: '2026-11-18',
    capacity: 60,
    registered: 41,
    status: 'Published',
    description: 'Individual oratory category for ages 15–19 with structured evaluator feedback.',
    meta: 'Individual category · Ages 15–19',
  },
];

export const mockSessions = [
  { id: 's-mun-1', programId: 'p-mun', title: 'WHO Committee', topic: 'Global health preparedness', date: '2026-10-24', venue: 'BMICH, Colombo' },
  { id: 's-spk-6', programId: 'p-speaking', title: 'Session 06 · Final presentations', topic: 'Persuasive structure', date: '2026-12-13', venue: 'Colombo + online' },
  { id: 's-deb-2', programId: 'p-debate', title: 'Session 02 · Motions night', topic: 'Right vs Might', date: '2026-11-02', venue: 'Auditorium' },
];

const STUDENT_NAMES = ['Amaya Silva', 'Dilan Perera', 'Hiruni Senanayake', 'Kavindu Fernando', 'Maya Rodrigo', 'Nethmi Abeysekara'];
const ALLOCATIONS = ['WHO · Japan', 'UNHCR · Canada', 'UNSC · France'];

export const mockRoster = STUDENT_NAMES.map((name, i) => ({
  id: `st-${i}`,
  name,
  elevateMeId: `EM-${String(124 + i).padStart(5, '0')}`,
  allocation: ALLOCATIONS[i % 3],
  registration: 'Confirmed',
  evaluation: i < 3 ? 'Submitted' : 'Pending',
}));

export const mockRegistrations = [
  { id: 'r-1', studentName: 'Nimuthu Fernando', elevateMeId: 'EM-00124', programId: 'p-mun', allocation: 'WHO Committee · Japan · BMICH, Colombo', status: 'Confirmed', evaluationState: 'Submitted', when: '24 OCT · 09:00' },
  { id: 'r-2', studentName: 'Nimuthu Fernando', elevateMeId: 'EM-00124', programId: 'p-speaking', allocation: 'Session 01 · Online', status: 'Pending', evaluationState: 'NotStarted', when: '08 NOV · 16:00' },
];

export const mockAnnouncements = [
  { id: 'a-1', date: 'TODAY', sender: 'Diplomatic Impact', title: 'Country allocations are now confirmed', body: 'Students registered for Colombo Youth MUN can now view their committee and country allocation.', audience: 'MUN participants', isNew: true },
  { id: 'a-2', date: '16 SEP', sender: 'Programme team', title: 'Academic Speaking session moved online', body: 'Session 06 will take place online at the same scheduled time. The joining link is inside your registration.', audience: 'Cohort 03', isNew: false },
  { id: 'a-3', date: '10 SEP', sender: 'Diplomatic Impact', title: 'Performance reports for August are available', body: 'Released evaluations and updated insights are now visible on your Performance page.', audience: 'All students', isNew: false },
];

export const mockRecommendations = [
  { id: 'rec-1', date: '18 SEP 2026', title: 'Practice structured rebuttals', body: 'Use the Claim → Evidence → Impact structure for three sample motions. This will directly strengthen the area identified in your last two debate evaluations.', skill: 'Counter Arguments', related: 'Related to Friendly Debate', priority: 'High priority', status: 'New', studentName: 'Nimuthu Fernando' },
  { id: 'rec-2', date: '06 SEP 2026', title: 'Slow the opening 30 seconds', body: 'Your strongest ideas land more clearly when the introduction is deliberate. Rehearse with a timer before the next Academic Speaking session.', skill: 'Clarity', related: 'Related to Session 05', priority: 'In progress', status: 'Viewed', studentName: 'Nimuthu Fernando' },
  { id: 'rec-3', date: '22 AUG 2026', title: 'Use a one-page preparation map', body: 'Create a concise outline before each event: objective, three core arguments, evidence and likely counterpoints.', skill: 'Preparation', related: '', priority: 'Complete', status: 'Completed', studentName: 'Nimuthu Fernando' },
];

export const mockThreads = [
  { id: 'm-1', date: '18 SEP', from: 'Diplomatic Impact', subject: 'Follow-up on October programme', preview: 'We have replied to your question about the upcoming Model UN programme.', state: 'Replied', updatedAt: '2026-09-18' },
  { id: 'm-2', date: '12 SEP', from: 'You', subject: 'Request to update institute details', preview: 'Please update Nimuthu’s institute information before the next event.', state: 'Open', updatedAt: '2026-09-12' },
  { id: 'm-3', date: '22 AUG', from: 'Diplomatic Impact', subject: 'Parent profile verification', preview: 'Your parent profile and student link have been verified.', state: 'Closed', updatedAt: '2026-08-22' },
];

export const mockThreadDetails = [
  {
    id: 'm-1',
    subject: 'Follow-up on October programme',
    studentName: 'Nimuthu Fernando · EM-00124',
    state: 'Replied',
    updatedAt: '2026-09-18',
    body: 'Could you confirm whether parents may attend the opening ceremony of Colombo Youth MUN?',
    author: 'S. Fernando',
    authorWhen: '18 Sep · 09:42',
    replies: [
      { author: 'Diplomatic Impact', when: '18 Sep · 14:10', body: 'Yes. One parent or guardian may attend the opening ceremony. We will send the venue access information three days before the event.' },
    ],
  },
  {
    id: 'm-2',
    subject: 'Request to update institute details',
    studentName: 'Nimuthu Fernando · EM-00124',
    state: 'Open',
    updatedAt: '2026-09-12',
    body: 'Please update Nimuthu’s institute information to Royal College, Colombo before the next event.',
    author: 'S. Fernando',
    authorWhen: '12 Sep · 11:05',
    replies: [],
  },
  {
    id: 'm-3',
    subject: 'Parent profile verification',
    studentName: 'Nimuthu Fernando · EM-00124',
    state: 'Closed',
    updatedAt: '2026-08-22',
    body: 'Your parent profile and student link have been verified.',
    author: 'Diplomatic Impact',
    authorWhen: '22 Aug · 10:00',
    replies: [],
  },
];

export const mockEvaluations = [
  {
    id: 'e-1',
    studentName: 'Nimuthu Fernando',
    elevateMeId: 'EM-00124',
    session: 'Academic Speaking · Session 05',
    programId: 'p-speaking',
    state: 'Locked',
    released: true,
    scores: [
      { criterion: 'Preparation', level: 5 },
      { criterion: 'Clarity', level: 4 },
      { criterion: 'Confidence', level: 4 },
      { criterion: 'Vocal Delivery', level: 3 },
      { criterion: 'Counter Arguments', level: 3 },
      { criterion: 'Overall Performance', level: 4 },
    ],
    remarks: 'Strong structure and clear opening. The main development area is responding to counter-arguments without losing focus.',
  },
  {
    id: 'e-2',
    studentName: 'Nimuthu Fernando',
    elevateMeId: 'EM-00124',
    session: 'WHO Committee · Colombo Youth MUN',
    programId: 'p-mun',
    state: 'Submitted',
    released: false,
    scores: [],
    remarks: '',
  },
];

export function publishedPrograms() {
  return mockPrograms.filter((p) => p.status === 'Published' || p.status === 'InProgress');
}
