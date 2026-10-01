import React, { Suspense, lazy } from 'react';
import { Link, Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router-dom';
import { accountStatusTarget, useAuth, type Role } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';
import { PageHeading } from '../components/PageHeading';
import { ProgramsPage } from '../pages/ProgramsPage';
import { LandingPage } from '../pages/LandingPage';
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
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';

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
const GuestEvaluatePage = lazy(() =>
  import('../pages/evaluate/GuestEvaluatePage').then((m) => ({ default: m.GuestEvaluatePage })),
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
const AdminNotificationsPage = lazy(() =>
  import('../pages/admin/AdminNotificationsPage').then((m) => ({ default: m.AdminNotificationsPage })),
);
const StaffProgramsPage = lazy(() =>
  import('../pages/staff/StaffProgramsPage').then((m) => ({ default: m.StaffProgramsPage })),
);
const ProgramEditPage = lazy(() =>
  import('../pages/staff/ProgramEditPage').then((m) => ({ default: m.ProgramEditPage })),
);
const AdminProgramsPage = lazy(() =>
  import('../pages/admin/AdminProgramsPage').then((m) => ({ default: m.AdminProgramsPage })),
);
const AdminUsersPage = lazy(() =>
  import('../pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminCommentBankPage = lazy(() =>
  import('../pages/admin/AdminCommentBankPage').then((m) => ({ default: m.AdminCommentBankPage })),
);
const StudentDetailStaffPage = lazy(() =>
  import('../pages/shared/StudentDetailPage').then((m) => ({
    default: function StaffStudent() {
      return <m.StudentDetailPage base="staff" />;
    },
  })),
);
const StudentDetailAdminPage = lazy(() =>
  import('../pages/shared/StudentDetailPage').then((m) => ({
    default: function AdminStudent() {
      return <m.StudentDetailPage base="admin" />;
    },
  })),
);

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div data-testid="route-loading"><p role="status">Loading…</p></div>}>{children}</Suspense>;
}

// Guards read DB roles via /me (useAuth). Never browser metadata / localStorage role.
// Shared /app for student+parent (no separate /parent).

/**
 * RequireAuth: Supabase session + GET /me (via useAuth).
 * No session (or 401 from /me) => /sign-in?next=<returnUrl> for re-auth.
 * While loading, never redirect — render a loading state so the sign-in
 * resolve (SIGNED_IN -> GET /me) cannot bounce back to /sign-in.
 * Network /me failures (error != null) => retry UI, never logout.
 * Rejected/Suspended/PendingReview => account gates, never app content.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading) return <div data-testid="auth-loading">Loading…</div>;
  if (error && !session) {
    return (
      <div data-testid="auth-error">
        <PageHeading title="Connection issue" />
        <EmptyState
          title="Couldn't load your account"
          body="Check your connection and try again."
          action={<button type="button" onClick={retry}>Retry</button>}
        />
      </div>
    );
  }
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  const gated = accountStatusTarget(session.status);
  if (gated && location.pathname !== gated) {
    return <Navigate to={gated} replace />;
  }
  return <>{children}</>;
}

/**
 * Pending gate: status==PendingReview => /account/pending.
 * Rejected => /account/rejected, Suspended => /account/suspended.
 * No roster/data fetch happens behind this gate (StaffLayout mounts it first).
 * While loading, never redirect. Network errors show retry, not logout.
 */
export function RequireActive({ children }: { children: React.ReactNode }) {
  const { session, loading, error, retry } = useAuth();
  if (loading) return <div data-testid="active-loading">Loading…</div>;
  if (error && !session) {
    return (
      <div data-testid="auth-error">
        <PageHeading title="Connection issue" />
        <EmptyState
          title="Couldn't load your account"
          body="Check your connection and try again."
          action={<button type="button" onClick={retry}>Retry</button>}
        />
      </div>
    );
  }
  if (!session) return <>{children}</>;
  const gated = accountStatusTarget(session.status);
  if (gated) {
    return <Navigate to={gated} replace />;
  }
  return <>{children}</>;
}

/**
 * RequireRole: roles from GET /me only (useAuth.session), never localStorage.
 * While loading, never redirect. Status gates (Rejected/Suspended/Pending)
 * redirect before the role check. Network errors show retry, not logout.
 * 403 => PermissionDenied state (data-testid="forbidden").
 */
export function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { session, loading, error, retry } = useAuth();
  const location = useLocation();
  if (loading) return <div data-testid="role-loading">Loading…</div>;
  if (error && !session) {
    return (
      <div data-testid="auth-error">
        <PageHeading title="Connection issue" />
        <EmptyState
          title="Couldn't load your account"
          body="Check your connection and try again."
          action={<button type="button" onClick={retry}>Retry</button>}
        />
      </div>
    );
  }
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  const gated = accountStatusTarget(session.status);
  if (gated && location.pathname !== gated) {
    return <Navigate to={gated} replace />;
  }
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
      <RequireRole allow={['student', 'parent', 'admin']}>
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
        <RequireRole allow={['staff', 'coordinator', 'evaluator', 'admin']}>
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
    element: <LandingPage />,
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
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
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
    path: '/account/rejected',
    element: (
      <PublicPlaceholder
        title="Account rejected"
        testid="page-account-rejected"
        body="Your account application was not approved. Contact support if you believe this is a mistake."
        to="/"
        linkLabel="Back to home"
      />
    ),
  },
  {
    path: '/account/suspended',
    element: (
      <PublicPlaceholder
        title="Account suspended"
        testid="page-account-suspended"
        body="Your account is suspended. Contact support to resolve this."
        to="/"
        linkLabel="Back to home"
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
            body="Your programs and assigned sessions live in the program list."
            to="/staff/programs"
            linkLabel="Open programs"
          />
        ),
      },
      { path: 'programs', element: <LazyRoute><StaffProgramsPage /></LazyRoute> },
      { path: 'programs/new', element: <LazyRoute><ProgramBuilderPage /></LazyRoute> },
      { path: 'programs/:id', element: <LazyRoute><ProgramWorkspacePage /></LazyRoute> },
      { path: 'programs/:id/edit', element: <LazyRoute><ProgramEditPage /></LazyRoute> },
      { path: 'programs/:id/sessions/:sessionId/roster', element: <LazyRoute><SessionRosterPage /></LazyRoute> },
      { path: 'evaluations/:id', element: <LazyRoute><EvaluationSheetPage /></LazyRoute> },
      { path: 'students/:id', element: <LazyRoute><StudentDetailStaffPage /></LazyRoute> },
      { path: 'comment-bank', element: <LazyRoute><CommentBankPage /></LazyRoute> }
    ]
  },
  { path: '/evaluate/invite', element: <LazyRoute><GuestInvitePage /></LazyRoute> },
  // Phase 1C guest evaluator journey: /evaluate/session (scope-resolved roster,
  // names + status only) + /evaluate/students/:studentId (editable sheet).
  // /evaluate/invite stays as the exchange entry and forwards to /evaluate/session.
  { path: '/evaluate/session', element: <LazyRoute><GuestInvitePage /></LazyRoute> },
  { path: '/evaluate/students/:studentId', element: <LazyRoute><GuestEvaluatePage /></LazyRoute> },
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
            body="Review programs waiting for approval or accounts waiting for review."
            to="/admin/programs"
            linkLabel="Open program review"
          />
        ),
      },
      {
        path: 'approvals',
        element: (
          <PlaceholderPage
            title="Approvals"
            testid="page-admin-approvals"
            body="Program decisions live in program review; account decisions live in account review."
            to="/admin/programs"
            linkLabel="Open program review"
          />
        ),
      },
      { path: 'users', element: <LazyRoute><AdminUsersPage /></LazyRoute> },
      { path: 'users/:id', element: <LazyRoute><StudentDetailAdminPage /></LazyRoute> },
      { path: 'programs', element: <LazyRoute><AdminProgramsPage /></LazyRoute> },
      {
        path: 'evaluations',
        element: (
          <PlaceholderPage
            title="Admin evaluations"
            testid="page-admin-evaluations"
            body="Evaluation sheets live under staff workspaces — open a program to reach its rosters and sheets."
            to="/staff/programs"
            linkLabel="Open staff programs"
          />
        ),
      },
      { path: 'recommendations', element: <LazyRoute><AdminRecommendationsPage /></LazyRoute> },
      { path: 'development', element: <LazyRoute><AdminDevelopmentPage /></LazyRoute> },
      { path: 'payments', element: <LazyRoute><AdminPaymentsPage /></LazyRoute> },
      { path: 'queries', element: <LazyRoute><AdminQueriesPage /></LazyRoute> },
      { path: 'outbox', element: <LazyRoute><OutboxPage /></LazyRoute> },
      { path: 'notifications', element: <LazyRoute><AdminNotificationsPage /></LazyRoute> },
      { path: 'comment-bank', element: <LazyRoute><AdminCommentBankPage /></LazyRoute> },
      {
        path: 'audit',
        element: (
          <PlaceholderPage
            title="Audit"
            testid="page-admin-audit"
            body="Audit history is deferred to a later release — see docs. Program and account decisions are recorded server-side in the meantime."
            to="/admin"
            linkLabel="Back to admin overview"
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
