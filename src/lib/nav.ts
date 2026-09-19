import type { Role } from "./types";

export interface NavItem {
  href: string;
  label: string;
}

// Information architecture per frontend plan §7 (route groups).
export const ROLE_NAV: Record<Role, NavItem[]> = {
  student: [
    { href: "/student", label: "Home" },
    { href: "/student/programs", label: "Programs" },
    { href: "/student/performance", label: "Performance" },
    { href: "/student/recommendations", label: "Recommendations" },
    { href: "/student/profile", label: "Profile" },
  ],
  parent: [
    { href: "/parent", label: "Overview" },
    { href: "/parent/performance", label: "Performance" },
    { href: "/parent/recommendations", label: "Recommendations" },
    { href: "/parent/messages", label: "Messages" },
  ],
  coordinator: [
    { href: "/coordinator", label: "Dashboard" },
    { href: "/coordinator/programs", label: "Programs" },
    { href: "/coordinator/students", label: "Students" },
    { href: "/coordinator/performance", label: "Performance" },
    { href: "/coordinator/profile", label: "Profile" },
  ],
  evaluator: [
    { href: "/evaluator", label: "Assignments" },
    { href: "/evaluator/submissions", label: "Submissions" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/approvals", label: "Approvals" },
    { href: "/admin/programs", label: "Programs" },
    { href: "/admin/evaluations", label: "Evaluations" },
    { href: "/admin/reports", label: "Reports" },
  ],
};

// Full secondary destinations (visible inside workspaces, not the mobile rail).
export const ROLE_NAV_MORE: Record<Role, NavItem[]> = {
  student: [
    { href: "/student/registrations", label: "My Registrations" },
    { href: "/student/announcements", label: "Announcements" },
    { href: "/student/development", label: "Further Development" },
    { href: "/student/parent-access", label: "Parent Access" },
  ],
  parent: [],
  coordinator: [
    { href: "/coordinator/sessions", label: "Sessions / Committees" },
    { href: "/coordinator/evaluators", label: "Evaluators" },
    { href: "/coordinator/insights", label: "Class / Cohort Insights" },
  ],
  evaluator: [],
  admin: [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/institutes", label: "Institutes" },
    { href: "/admin/recommendations", label: "Recommendations" },
    { href: "/admin/announcements", label: "Announcements" },
    { href: "/admin/messages", label: "Messages" },
    { href: "/admin/configuration", label: "Configuration" },
    { href: "/admin/audit-log", label: "Audit Log" },
  ],
};

export const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About ElevateMe" },
  { href: "/programs", label: "Programs and Events" },
];
