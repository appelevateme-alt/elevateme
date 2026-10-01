import React, { Suspense, lazy } from 'react';
import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { useAuth, type Role } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { ProgramsPage } from '../pages/ProgramsPage';
import { ProgramDetailPage } from '../pages/ProgramDetailPage';
import { MyProgramsPage } from '../pages/app/MyProgramsPage';
import { RegistrationsPage } from '../pages/app/RegistrationsPage';
import { HomePage } from '../pages/app/HomePage';
import { PerformancePage } from '../pages/app/PerformancePage';
import { ReportsPage } from '../pages/app/ReportsPage';
import { ReportDetailPage } from '../pages/app/ReportDetailPage';
import { RecommendationsPage } from '../pages/app/RecommendationsPage';
import { QueriesPage } from '../pages/app/QueriesPage';
import { QueryNewPage } from '../pages/app/QueryNewPage';
import { QueryDetailPage } from '../pages/app/QueryDetailPage';
import { DevelopmentPage } from '../pages/app/DevelopmentPage';
import { DevelopmentDetailPage } from '../pages/app/DevelopmentDetailPage';
import { PublicHeader } from '../components/PublicHeader';
import { SignInPage } from '../pages/auth/SignInPage';
import { SignUpPage } from '../pages/auth/SignUpPage';

// Phase 6 perf: route-level code splitting for staff/admin (heavy sheets,
// rosters, admin queues load on demand; student core stays eager).
const ProgramBuilderPage = lazy(() =>
  import('../pages/staff/ProgramBuilderPage').then((m) => ({ default: m.ProgramBuilderPage })),
);
const ProgramWorkspacePage = lazy(() =>
  import('../pages/staff/ProgramWorkspacePage').then((m) => ({ default: m.ProgramWorkspacePage })),
);
const SessionRosterPage = lazy(() =>
  import('../pages/staff/SessionRosterPage').then((m) => ({ default: m.SessionRosterPage })),
);
const EvaluationSheetPage = lazy(() =>
  import('../pages/staff/EvaluationSheetPage').then((m) => ({ default: m.EvaluationSheetPage })),
);
const CommentBankPage = lazy(() =>
  import('../pages/staff/CommentBankPage').then((m) => ({ default: m.CommentBankPage })),
);
const GuestInvitePage = lazy(() =>
  import('../pages/evaluate/GuestInvitePage').then((m) => ({ default: m.GuestInvitePage })),
);
const AdminRecommendationsPage = lazy(() =>
  import('../pages/admin/AdminRecommendationsPage').then((m) => ({ default: m.AdminRecommendationsPage })),
);
const AdminDevelopmentPage = lazy(() =>
  import('../pages/admin/AdminDevelopmentPage').then((m) => ({ default: m.AdminDevelopmentPage })),
);
const AdminPaymentsPage = lazy(() =>
  import('../pages/admin/AdminPaymentsPage').then((m) => ({ default: m.AdminPaymentsPage })),
);
const AdminQueriesPage = lazy(() =>
  import('../pages/admin/AdminQueriesPage').then((m) => ({ default: m.AdminQueriesPage })),
);
const OutboxPage = lazy(() =>
  import('../pages/admin/OutboxPage').then((m) => ({ default: m.OutboxPage })),
);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div data-testid="route-loading"><p role="status">Loading…</p></div>}>{children}</Suspense>;
}

// Guards read DB roles via /me (useAuth). Never browser metadata / localStorage role.
// Shared /app for student+parent (no separate /parent).

/**
 * RequireAuth: Supabase session + GET /me (via useAuth).
 * No session (or 401 from /me) => /sign-in?next=<returnUrl> for re-auth.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div data-testid="auth-loading">Loading…</div>;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/**
 * Pending gate: status==PendingReview => /account/pending.
 * No roster/data fetch happens behind this gate (StaffLayout mounts it first).
 */
export function RequireActive({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div data-testid="active-loading">Loading…</div>;
  if (session && session.status === 'PendingReview') {
    return <Navigate to="/account/pending" replace />;
  }
  return <>{children}</>;
}

/**
 * RequireRole: roles from GET /me only (useAuth.session), never localStorage.
 * 403 => PermissionDenied state (data-testid="forbidden").
 */
export function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div data-testid="role-loading">Loading…</div>;
  if (!session) return <Navigate to="/sign-in" replace />;
  const role = session.activeRole;
  if (!allow.includes(role)) {
    return (
      <div data-testid="forbidden">
        <PageHeading title="Permission denied" />
        <EmptyState title="Permission denied" body={`Requires one of: ${allow.join(', ')}.`} />
      </div>
    );
  }
  return <>{children}</>;
}

/** 404 => NotFound state (cross-student reads use 404 to avoid enumeration). */
export function NotFoundState({ entity = 'Resource' }: { entity?: string }) {
  return (
    <div data-testid="not-found">
      <PageHeading title="Not found" />
      <EmptyState title="Not found" body={`${entity} not found.`} />
    </div>
  );
}

/** 403 => PermissionDenied state ( distinct from pending redirect ). */
export function PermissionDeniedState({ need }: { need?: string }) {
  return (
    <div data-testid="permission-denied">
      <PageHeading title="Permission denied" />
      <EmptyState title="Permission denied" body={need ?? 'You do not have access.'} />
    </div>
  );
}

/**
 * Minimal real placeholder: PageHeading + EmptyState +
 * link to an implemented route. Used only where a dedicated page does not
 * exist yet; never renders a disabled/inert control.
 */
function PlaceholderPage({
  title,
  testid,
  body,
  to,
  linkLabel,
}: {
  title: string;
  testid: string;
  body: string;
  to: string;
  linkLabel?: string;
}) {
  return (
    <div data-testid={testid}>
      <PageHeading title={title} />
      <EmptyState title={title} body={body} action={<Link to={to}>{linkLabel ?? to}</Link>} />
    </div>
  );
}

function PublicPlaceholder(props: { title: string; testid: string; body: string; to: string; linkLabel?: string }) {
  return (
    <>
      <PublicHeader />
      <PlaceholderPage {...props} />
    </>
  );
}

function AppLayout() {
  return (
    <RequireAuth>
      <RequireRole allow={['student', 'parent']}>
        <AppShell>
          <Outlet />
        </AppShell>
      </RequireRole>
    </RequireAuth>
  );
}

function StaffLayout() {
  return (
    <RequireAuth>
      <RequireActive>
        <RequireRole allow={['staff', 'coordinator', 'evaluator']}>
          <AppShell>
            <Outlet />
          </AppShell>
        </RequireRole>
      </RequireActive>
    </RequireAuth>
  );
}

function AdminLayout() {
  return (
    <RequireAuth>
      <RequireActive>
        <RequireRole allow={['admin']}>
          <AppShell>
            <Outlet />
          </AppShell>
        </RequireRole>
      </RequireActive>
    </RequireAuth>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <PublicPlaceholder
        title="Home"
        testid="page-home"
        body="Discover published programs and register once signed in."
        to="/programs"
        linkLabel="Browse programs"
      />
    ),
  },
  { path: '/programs', element: <ProgramsPage /> },
  { path: '/programs/:id', element: <ProgramDetailPage /> },
  { path: '/sign-in', element: <SignInPage /> },
  { path: '/sign-up', element: <SignUpPage /> },
  {
    path: '/verify-email',
    element: (
      <PublicPlaceholder
        title="Verify email"
        testid="page-verify-email"
        body="Check your inbox for the confirmation link, then sign in."
        to="/sign-in"
        linkLabel="Go to sign in"
      />
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicPlaceholder
        title="Forgot password"
        testid="page-forgot-password"
        body="Request a reset link from the sign-in page."
        to="/sign-in"
        linkLabel="Back to sign in"
      />
    ),
  },
  {
    path: '/reset-password',
    element: (
      <PublicPlaceholder
        title="Reset password"
        testid="page-reset-password"
        body="Use the time-limited link from your inbox, then sign in again."
        to="/sign-in"
        linkLabel="Back to sign in"
      />
    ),
  },
  {
    path: '/account/pending',
    element: (
      <PublicPlaceholder
        title="Account pending"
        testid="page-account-pending"
        body="Your account is awaiting email verification and role approval."
        to="/verify-email"
        linkLabel="Verify email"
      />
    ),
  },
  {
    path: '/app',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/:id', element: <ReportDetailPage /> },
      { path: 'recommendations', element: <RecommendationsPage /> },
      { path: 'programs', element: <MyProgramsPage /> },
      { path: 'registrations', element: <RegistrationsPage /> },
      { path: 'development', element: <DevelopmentPage /> },
      { path: 'development/:id', element: <DevelopmentDetailPage /> },
      {
        path: 'profile',
        element: (
          <PlaceholderPage
            title="Profile"
            testid="page-app-profile"
            body="Your profile summary lives on the home page."
            to="/app"
            linkLabel="Back to home"
          />
        ),
      },
      { path: 'queries', element: <QueriesPage /> },
      { path: 'queries/new', element: <QueryNewPage /> },
      { path: 'queries/:id', element: <QueryDetailPage /> }
    ]
  },
  {
    path: '/staff',
    element: <StaffLayout />,
    children: [
      {
        index: true,
        element: (
          <PlaceholderPage
            title="Staff home"
            testid="page-staff-home"
            body="Build a program or open a workspace."
            to="/staff/programs/new"
            linkLabel="Open program builder"
          />
        ),
      },
      {
        path: 'programs',
        element: (
          <PlaceholderPage
            title="Staff programs"
            testid="page-staff-programs"
            body="Create a program from the builder."
            to="/staff/programs/new"
            linkLabel="New program"
          />
        ),
      },
      { path: 'programs/new', element: <LazyRoute><ProgramBuilderPage /></LazyRoute> },
      { path: 'programs/:id', element: <LazyRoute><ProgramWorkspacePage /></LazyRoute> },
      { path: 'programs/:id/sessions/:sessionId/roster', element: <LazyRoute><SessionRosterPage /></LazyRoute> },
      { path: 'evaluations/:id', element: <LazyRoute><EvaluationSheetPage /></LazyRoute> },
      {
        path: 'students/:id',
        element: (
          <div data-testid="page-staff-student">
            <NotFoundState entity="Student" />
            <p>
              <Link to="/staff/programs/new">New program</Link>
            </p>
          </div>
        ),
      },
      { path: 'comment-bank', element: <LazyRoute><CommentBankPage /></LazyRoute> }
    ]
  },
  { path: '/evaluate/invite', element: <LazyRoute><GuestInvitePage /></LazyRoute> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: (
          <PlaceholderPage
            title="Admin home"
            testid="page-admin-home"
            body="Triage the outbox queue or review payments."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      {
        path: 'approvals',
        element: (
          <PlaceholderPage
            title="Approvals"
            testid="page-admin-approvals"
            body="Approval queue is handled via account review; triage delivery in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      {
        path: 'users',
        element: (
          <PlaceholderPage
            title="Users"
            testid="page-admin-users"
            body="User management is role-gated; delivery issues are in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      {
        path: 'programs',
        element: (
          <PlaceholderPage
            title="Admin programs"
            testid="page-admin-programs"
            body="Program oversight lives in staff workspaces; delivery issues are in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      {
        path: 'evaluations',
        element: (
          <PlaceholderPage
            title="Admin evaluations"
            testid="page-admin-evaluations"
            body="Evaluation sheets live under staff; delivery issues are in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      { path: 'recommendations', element: <LazyRoute><AdminRecommendationsPage /></LazyRoute> },
      { path: 'development', element: <LazyRoute><AdminDevelopmentPage /></LazyRoute> },
      { path: 'payments', element: <LazyRoute><AdminPaymentsPage /></LazyRoute> },
      { path: 'queries', element: <LazyRoute><AdminQueriesPage /></LazyRoute> },
      { path: 'outbox', element: <LazyRoute><OutboxPage /></LazyRoute> },
      {
        path: 'comment-bank',
        element: (
          <PlaceholderPage
            title="Admin comment bank"
            testid="page-admin-comment-bank"
            body="Shared comment bank is managed under staff."
            to="/staff/comment-bank"
            linkLabel="Open comment bank"
          />
        ),
      },
      {
        path: 'notifications',
        element: (
          <PlaceholderPage
            title="Notifications"
            testid="page-admin-notifications"
            body="Delivery failures are triaged in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      },
      {
        path: 'audit',
        element: (
          <PlaceholderPage
            title="Audit"
            testid="page-admin-audit"
            body="Audit rows are ids-only; delivery failures are triaged in the outbox."
            to="/admin/outbox"
            linkLabel="Open outbox"
          />
        ),
      }
    ]
  },
  {
    path: '*',
    element: (
      <>
        <PublicHeader />
        <div data-testid="page-not-found">
          <NotFoundState entity="Page" />
        </div>
      </>
    ),
  }
]);
