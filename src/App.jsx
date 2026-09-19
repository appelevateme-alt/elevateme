import { Route, Routes } from 'react-router-dom';
import { MockAuthProvider } from './lib/auth.jsx';
import { AppShell, RequireRole, SkipLink, TopBar } from './components/layout/Chrome.jsx';

import Home from './pages/public/Home.jsx';
import About from './pages/public/About.jsx';
import Programs from './pages/public/Programs.jsx';
import ProgramDetail from './pages/public/ProgramDetail.jsx';
import NotFound from './pages/public/NotFound.jsx';

import SignIn from './pages/auth/SignIn.jsx';
import SignUp from './pages/auth/SignUp.jsx';
import { ForgotPassword, ResetPassword } from './pages/auth/Password.jsx';

import { StudentDashboard, StudentProfile, StudentParentAccess, StudentDevelopment } from './pages/student/StudentHome.jsx';
import { StudentPrograms } from './pages/student/StudentPrograms.jsx';
import { StudentProgramDetail } from './pages/student/StudentProgramDetail.jsx';
import { StudentRegistrations } from './pages/student/StudentRegistrations.jsx';
import { StudentPerformance } from './pages/student/StudentPerformance.jsx';
import { EvaluationDetail } from './pages/student/EvaluationDetail.jsx';
import { StudentRecommendations, StudentAnnouncements } from './pages/student/StudentFeeds.jsx';

import { ParentOverview, ParentPerformance, ParentRecommendations, ParentStudent, ParentStudentPerformance, ParentStudentRecommendations } from './pages/parent/Parent.jsx';
import { ParentMessages, NewParentMessage, ThreadDetail } from './pages/parent/Messages.jsx';

import { CoordinatorDashboard, CoordinatorPrograms, CoordinatorSessions, CoordinatorEvaluators, CoordinatorPerformance, CoordinatorInsights, CoordinatorProfile, ProgramOverview, ProgramSessions, ProgramStudents, ProgramEvaluators } from './pages/coordinator/Coordinator.jsx';
import NewProgram from './pages/coordinator/NewProgram.jsx';
import { CoordinatorStudents, CoordinatorStudentDetail, ProgramEdit } from './pages/coordinator/Roster.jsx';

import { EvaluatorHome, AssignmentPage, EvaluatorStudents, EvaluatorSubmissions } from './pages/evaluator/Evaluator.jsx';
import { LegacyEvaluate, PerStudentEvaluate } from './pages/evaluator/Evaluate.jsx';

import { AdminOverview, AdminApprovals, AdminPrograms, AdminUsers, AdminInstitutes, AdminEvaluations, AdminReports, AdminConfig, AdminAudit, AdminMessages } from './pages/admin/Admin.jsx';
import { AdminRecommendations, AdminAnnouncements } from './pages/admin/Compose.jsx';

function StudentShell({ children }) {
  return (
    <AppShell role="student" title="Student">
      <RequireRole allow={['student']} label="Student">{children}</RequireRole>
    </AppShell>
  );
}

function ParentShell({ children }) {
  return (
    <AppShell role="parent" title="Parent">
      <RequireRole allow={['parent']} label="Parent">{children}</RequireRole>
    </AppShell>
  );
}

function CoordinatorShell({ children }) {
  return (
    <AppShell role="coordinator" title="Coordinator">
      <RequireRole allow={['coordinator']} label="Coordinator">{children}</RequireRole>
    </AppShell>
  );
}

function EvaluatorShell({ children }) {
  return (
    <AppShell role="evaluator" title="Evaluator">
      <RequireRole allow={['evaluator', 'coordinator']} label="Evaluator">{children}</RequireRole>
    </AppShell>
  );
}

function AdminShell({ children }) {
  return (
    <AppShell role="admin" title="Admin">
      <RequireRole allow={['admin']} label="Admin">{children}</RequireRole>
    </AppShell>
  );
}

export default function App() {
  return (
    <MockAuthProvider>
      <div className="app">
        <SkipLink />
        <TopBar />
        <main id="main-content">
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
            <Route path="/coordinator/programs/:programId/sessions" element={<CoordinatorShell><ProgramSessions /></CoordinatorShell>} />
            <Route path="/coordinator/programs/:programId/students" element={<CoordinatorShell><ProgramStudents /></CoordinatorShell>} />
            <Route path="/coordinator/programs/:programId/evaluators" element={<CoordinatorShell><ProgramEvaluators /></CoordinatorShell>} />
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
        </main>
        <footer className="footer">
          <div className="footer-inner">
            <p className="em-meta">ElevateMe · React + JavaScript frontend (mock data, no backend) · Flat UI, WCAG 2.2 AA target</p>
          </div>
        </footer>
      </div>
    </MockAuthProvider>
  );
}
