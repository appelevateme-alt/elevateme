import { Route, Routes } from 'react-router-dom';
import { MockAuthProvider } from './lib/auth.jsx';
import { RequireRole, Shell } from './components/shell.jsx';

import { About, Home, NotFound, ProgramDetail, Programs, StudentProgramDetail } from './views/public.jsx';
import { ForgotPassword, ResetPassword, SignIn, SignUp } from './views/auth.jsx';
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
import {
  CoordinatorDashboard, CoordinatorEvaluators, CoordinatorInsights,
  CoordinatorPerformance, CoordinatorProfile, CoordinatorPrograms,
  CoordinatorSessions, CoordinatorStudentDetail, CoordinatorStudents,
  NewProgram, ProgramEdit, ProgramEvaluatorsTab, ProgramOverview,
  ProgramSessionsTab, ProgramStudentsTab,
} from './views/coordinator.jsx';
import {
  AssignmentPage, EvaluatorHome, EvaluatorStudents, EvaluatorSubmissions,
  LegacyEvaluate, PerStudentEvaluate,
} from './views/evaluator.jsx';
import {
  AdminAnnouncements, AdminApprovals, AdminAudit, AdminConfig,
  AdminEvaluations, AdminInstitutes, AdminMessages, AdminOverview,
  AdminPrograms, AdminRecommendations, AdminReports, AdminUsers,
} from './views/admin.jsx';

function StudentShell({ children }) {
  return <Shell role="student"><RequireRole allow={['student']} label="Student">{children}</RequireRole></Shell>;
}
function ParentShell({ children }) {
  return <Shell role="parent"><RequireRole allow={['parent']} label="Parent">{children}</RequireRole></Shell>;
}
function CoordinatorShell({ children }) {
  return <Shell role="coordinator"><RequireRole allow={['coordinator']} label="Coordinator">{children}</RequireRole></Shell>;
}
function EvaluatorShell({ children }) {
  return <Shell role="evaluator"><RequireRole allow={['evaluator', 'coordinator']} label="Evaluator">{children}</RequireRole></Shell>;
}
function AdminShell({ children }) {
  return <Shell role="admin"><RequireRole allow={['admin']} label="Admin">{children}</RequireRole></Shell>;
}

export default function App() {
  return (
    <MockAuthProvider>
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

        {/* Coordinator */}
        <Route path="/coordinator" element={<CoordinatorShell><CoordinatorDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/programs" element={<CoordinatorShell><CoordinatorPrograms /></CoordinatorShell>} />
        <Route path="/coordinator/programs/new" element={<CoordinatorShell><NewProgram /></CoordinatorShell>} />
        <Route path="/coordinator/programs/:programId" element={<CoordinatorShell><ProgramOverview /></CoordinatorShell>} />
        <Route path="/coordinator/programs/:programId/edit" element={<CoordinatorShell><ProgramEdit /></CoordinatorShell>} />
        <Route path="/coordinator/programs/:programId/sessions" element={<CoordinatorShell><ProgramSessionsTab /></CoordinatorShell>} />
        <Route path="/coordinator/programs/:programId/students" element={<CoordinatorShell><ProgramStudentsTab /></CoordinatorShell>} />
        <Route path="/coordinator/programs/:programId/evaluators" element={<CoordinatorShell><ProgramEvaluatorsTab /></CoordinatorShell>} />
        <Route path="/coordinator/sessions" element={<CoordinatorShell><CoordinatorSessions /></CoordinatorShell>} />
        <Route path="/coordinator/students" element={<CoordinatorShell><CoordinatorStudents /></CoordinatorShell>} />
        <Route path="/coordinator/students/:studentId" element={<CoordinatorShell><CoordinatorStudentDetail /></CoordinatorShell>} />
        <Route path="/coordinator/evaluators" element={<CoordinatorShell><CoordinatorEvaluators /></CoordinatorShell>} />
        <Route path="/coordinator/performance" element={<CoordinatorShell><CoordinatorPerformance /></CoordinatorShell>} />
        <Route path="/coordinator/insights" element={<CoordinatorShell><CoordinatorInsights /></CoordinatorShell>} />
        <Route path="/coordinator/profile" element={<CoordinatorShell><CoordinatorProfile /></CoordinatorShell>} />

        {/* Evaluator */}
        <Route path="/evaluator" element={<EvaluatorShell><EvaluatorHome /></EvaluatorShell>} />
        <Route path="/evaluator/assignments/:assignmentId" element={<EvaluatorShell><AssignmentPage /></EvaluatorShell>} />
        <Route path="/evaluator/assignments/:assignmentId/students/:studentId" element={<EvaluatorShell><PerStudentEvaluate /></EvaluatorShell>} />
        <Route path="/evaluator/evaluation" element={<EvaluatorShell><LegacyEvaluate /></EvaluatorShell>} />
        <Route path="/evaluator/evaluate" element={<EvaluatorShell><LegacyEvaluate /></EvaluatorShell>} />
        <Route path="/evaluator/students" element={<EvaluatorShell><EvaluatorStudents /></EvaluatorShell>} />
        <Route path="/evaluator/status" element={<EvaluatorShell><EvaluatorSubmissions /></EvaluatorShell>} />
        <Route path="/evaluator/submissions" element={<EvaluatorShell><EvaluatorSubmissions /></EvaluatorShell>} />

        {/* Admin */}
        <Route path="/admin" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/approvals" element={<AdminShell><AdminApprovals /></AdminShell>} />
        <Route path="/admin/programs" element={<AdminShell><AdminPrograms /></AdminShell>} />
        <Route path="/admin/users" element={<AdminShell><AdminUsers /></AdminShell>} />
        <Route path="/admin/institutes" element={<AdminShell><AdminInstitutes /></AdminShell>} />
        <Route path="/admin/evaluations" element={<AdminShell><AdminEvaluations /></AdminShell>} />
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
    </MockAuthProvider>
  );
}
