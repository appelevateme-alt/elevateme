import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import { RequireAuth, RequireRole, Shell } from './components/shell.jsx';

import { About, Home, NotFound, ProgramDetail, Programs, StudentProgramDetail } from './views/public.jsx';
import { AccountRejected, AccountSuspended, CheckEmail, ForgotPassword, PendingApproval, ResetPassword, SignIn, SignUp } from './views/auth.jsx';
import {
  EvaluationDetail, StudentAnnouncements, StudentDashboard, StudentDevelopment,
  StudentParentAccess, StudentPerformance, StudentProfile, StudentPrograms,
  StudentRecommendations, StudentRegistrations,
} from './views/student.jsx';
import {
  NewParentMessage, ParentMessages, ParentOverview, ParentPerformance,
  ParentRecommendations, ParentStudent, ParentStudentPerformance,
  ParentStudentRecommendations, ThreadDetail,
} from './views/parent.jsx';
import { NewProgram, ProgramEdit, ProgramOverview, ProgramSessionsTab, ProgramStudentsTab, ProgramPerformanceTab, ProgramSettingsTab, AdminStudents } from './views/program-management.jsx';
import { GuestWorkspace } from './features/evaluator-access/GuestWorkspace.jsx';
import { AdminInvitations, AdminReviewQueue, AdminReviewDetail, AdminDelivery } from './features/evaluator-access/AdminAccess.jsx';
import {
  AdminAnnouncements, AdminApprovals, AdminAudit, AdminConfig,
  AdminInstitutes, AdminMessages, AdminOverview,
  AdminPrograms, AdminRecommendations, AdminReports, AdminUsers,
} from './views/admin.jsx';

function StudentShell({ children }) {
  return <RequireAuth><Shell role="student"><RequireRole allow={['student']} label="Student">{children}</RequireRole></Shell></RequireAuth>;
}
function ParentShell({ children }) {
  return <RequireAuth><Shell role="parent"><RequireRole allow={['parent']} label="Parent">{children}</RequireRole></Shell></RequireAuth>;
}
function AdminShell({ children }) {
  return <RequireAuth><Shell role="admin"><RequireRole allow={['admin']} label="Admin">{children}</RequireRole></Shell></RequireAuth>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/programs" element={<Programs />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/pending-approval" element={<PendingApproval />} />
        <Route path="/account-rejected" element={<AccountRejected />} />
        <Route path="/account-suspended" element={<AccountSuspended />} />

        {/* Student */}
        <Route path="/student" element={<StudentShell><StudentDashboard /></StudentShell>} />
        <Route path="/student/profile" element={<StudentShell><StudentProfile /></StudentShell>} />
        <Route path="/student/programs" element={<StudentShell><StudentPrograms /></StudentShell>} />
        <Route path="/student/programs/:programId" element={<StudentShell><StudentProgramDetail /></StudentShell>} />
        <Route path="/student/registrations" element={<StudentShell><StudentRegistrations /></StudentShell>} />
        <Route path="/student/performance" element={<StudentShell><StudentPerformance /></StudentShell>} />
        <Route path="/student/performance/:evaluationId" element={<StudentShell><EvaluationDetail /></StudentShell>} />
        <Route path="/student/recommendations" element={<StudentShell><StudentRecommendations /></StudentShell>} />
        <Route path="/student/announcements" element={<StudentShell><StudentAnnouncements /></StudentShell>} />
        <Route path="/student/development" element={<StudentShell><StudentDevelopment /></StudentShell>} />
        <Route path="/student/parent-access" element={<StudentShell><StudentParentAccess /></StudentShell>} />

        {/* Parent */}
        <Route path="/parent" element={<ParentShell><ParentOverview /></ParentShell>} />
        <Route path="/parent/performance" element={<ParentShell><ParentPerformance /></ParentShell>} />
        <Route path="/parent/recommendations" element={<ParentShell><ParentRecommendations /></ParentShell>} />
        <Route path="/parent/messages" element={<ParentShell><ParentMessages /></ParentShell>} />
        <Route path="/parent/messages/new" element={<ParentShell><NewParentMessage /></ParentShell>} />
        <Route path="/parent/messages/:threadId" element={<ParentShell><ThreadDetail /></ParentShell>} />
        <Route path="/parent/students/:studentId" element={<ParentShell><ParentStudent /></ParentShell>} />
        <Route path="/parent/students/:studentId/performance" element={<ParentShell><ParentStudentPerformance /></ParentShell>} />
        <Route path="/parent/students/:studentId/recommendations" element={<ParentShell><ParentStudentRecommendations /></ParentShell>} />

        <Route path="/evaluate/*" element={<GuestWorkspace />} />
        <Route path="/evaluator/*" element={<Navigate to="/evaluate/invite" replace />} />
        <Route path="/coordinator/*" element={<Navigate to="/evaluate/invite" replace />} />

        {/* Admin */}
        <Route path="/admin" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/approvals" element={<AdminShell><AdminApprovals /></AdminShell>} />
        <Route path="/admin/programs" element={<AdminShell><AdminPrograms /></AdminShell>} />
        <Route path="/admin/programs/new" element={<AdminShell><NewProgram /></AdminShell>} />
        <Route path="/admin/programs/:programId" element={<AdminShell><ProgramOverview /></AdminShell>} />
        <Route path="/admin/programs/:programId/edit" element={<AdminShell><ProgramEdit /></AdminShell>} />
        <Route path="/admin/programs/:programId/sessions" element={<AdminShell><ProgramSessionsTab /></AdminShell>} />
        <Route path="/admin/programs/:programId/students" element={<AdminShell><ProgramStudentsTab /></AdminShell>} />
        <Route path="/admin/programs/:programId/performance" element={<AdminShell><ProgramPerformanceTab /></AdminShell>} />
        <Route path="/admin/programs/:programId/settings" element={<AdminShell><ProgramSettingsTab /></AdminShell>} />
        <Route path="/admin/students" element={<AdminShell><AdminStudents /></AdminShell>} />
        <Route path="/admin/evaluator-invitations" element={<AdminShell><AdminInvitations /></AdminShell>} />
        <Route path="/admin/evaluations/:id" element={<AdminShell><AdminReviewDetail /></AdminShell>} />
        <Route path="/admin/delivery" element={<AdminShell><AdminDelivery /></AdminShell>} />
        <Route path="/admin/users" element={<AdminShell><AdminUsers /></AdminShell>} />
        <Route path="/admin/institutes" element={<AdminShell><AdminInstitutes /></AdminShell>} />
        <Route path="/admin/evaluations" element={<AdminShell><AdminReviewQueue /></AdminShell>} />
        <Route path="/admin/recommendations" element={<AdminShell><AdminRecommendations /></AdminShell>} />
        <Route path="/admin/announcements" element={<AdminShell><AdminAnnouncements /></AdminShell>} />
        <Route path="/admin/messages" element={<AdminShell><AdminMessages /></AdminShell>} />
        <Route path="/admin/reports" element={<AdminShell><AdminReports /></AdminShell>} />
        <Route path="/admin/config" element={<AdminShell><AdminConfig /></AdminShell>} />
        <Route path="/admin/configuration" element={<AdminShell><AdminConfig /></AdminShell>} />
        <Route path="/admin/audit" element={<AdminShell><AdminAudit /></AdminShell>} />
        <Route path="/admin/audit-log" element={<AdminShell><AdminAudit /></AdminShell>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
