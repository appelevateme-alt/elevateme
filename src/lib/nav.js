// Role navigation — labels adopted from the approved frontend prototype.

export const ROLE_NAV = {
  student: [
    { href: '/student', label: 'Overview' },
    { href: '/student/programs', label: 'Programs' },
    { href: '/student/registrations', label: 'My registrations' },
    { href: '/student/performance', label: 'Performance' },
    { href: '/student/recommendations', label: 'Recommendations' },
    { href: '/student/announcements', label: 'Announcements' },
    { href: '/student/profile', label: 'Profile' },
  ],
  parent: [
    { href: '/parent', label: 'Student overview' },
    { href: '/parent/performance', label: 'Performance' },
    { href: '/parent/recommendations', label: 'Recommendations' },
    { href: '/parent/messages', label: 'Messages' },
  ],
  coordinator: [
    { href: '/coordinator', label: 'Overview' },
    { href: '/coordinator/programs', label: 'Programs' },
    { href: '/coordinator/students', label: 'Students' },
    { href: '/coordinator/evaluators', label: 'Evaluators' },
    { href: '/coordinator/performance', label: 'Performance' },
    { href: '/coordinator/profile', label: 'Profile' },
  ],
  evaluator: [
    { href: '/evaluator', label: 'Assignments' },
    { href: '/evaluator/submissions', label: 'Submissions' },
    { href: '/evaluator/evaluation', label: 'Evaluation form' },
  ],
  admin: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/approvals', label: 'Approval queue' },
    { href: '/admin/programs', label: 'Programs' },
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/evaluations', label: 'Evaluations' },
    { href: '/admin/recommendations', label: 'Recommendations' },
    { href: '/admin/announcements', label: 'Announcements' },
    { href: '/admin/messages', label: 'Messages' },
  ],
};

// Secondary destinations reachable inside workspaces (not the side nav).
export const ROLE_NAV_MORE = {
  student: [
    { href: '/student/development', label: 'Further Development' },
    { href: '/student/parent-access', label: 'Parent Access' },
  ],
  parent: [],
  coordinator: [
    { href: '/coordinator/sessions', label: 'Sessions / Committees' },
    { href: '/coordinator/insights', label: 'Cohort Insights' },
  ],
  evaluator: [
    { href: '/evaluator/evaluate', label: 'Evaluation Form (legacy)' },
    { href: '/evaluator/students', label: 'Student List' },
    { href: '/evaluator/status', label: 'Submission Status' },
  ],
  admin: [
    { href: '/admin/reports', label: 'Reports' },
    { href: '/admin/configuration', label: 'Configuration' },
    { href: '/admin/audit-log', label: 'Audit Log' },
  ],
};

export const PUBLIC_NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About ElevateMe' },
  { href: '/programs', label: 'Programs and Events' },
];

export const ROLE_LABEL = {
  student: 'Student',
  parent: 'Parent',
  coordinator: 'Coordinator',
  evaluator: 'Evaluator',
  admin: 'DI Admin',
};

export const ROLE_USER = {
  student: { name: 'Nimuthu Fernando', meta: 'Student · EM-00124', initials: 'NF' },
  parent: { name: 'S. Fernando', meta: 'Parent · Linked to 1 student', initials: 'SF' },
  coordinator: { name: 'Ms. Perera', meta: 'Programme Coordinator', initials: 'MP' },
  evaluator: { name: 'Dr. Jayasinghe', meta: 'Resource Person', initials: 'DJ' },
  admin: { name: 'Diplomatic Impact', meta: 'Platform Administrator', initials: 'DI' },
};
