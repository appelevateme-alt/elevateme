# REVMAP — Old Routes → New Routes (Phase 0, frozen)

Source of old routes: `src/App.jsx` (StudentShell `/student/*`, ParentShell `/parent/*`, CoordinatorShell `/coordinator/*`, EvaluatorShell `/evaluator/*`, AdminShell `/admin/*`).

## Target route model (required)

- `/app/*` — shared student+parent shell. One account, `ViewSwitcher` toggles Student view / Parent view (presentation only).
- `/staff/*` — unified teacher/coordinator + evaluator shell (ownership/assignment-gated).
- `/evaluate/invite?token=` — guest evaluator scoped entry (no login, token-scoped only).
- `/verify-email` — email verification landing.
- `/account/pending` — pending-approval / rejected / suspended states.
- Public + auth + admin keep existing paths (`/`, `/programs`, `/sign-in`, `/admin/*`).

## Mapping table old → new

| Old route | New route | Notes |
|---|---|---|
| `/student` | `/app/overview` | Default Student view |
| `/student/profile` | `/app/profile` | Shared |
| `/student/programs` | `/app/programs` | Shared |
| `/student/programs/:programId` | `/app/programs/:programId` | Shared |
| `/student/registrations` | `/app/registrations` | Student view only |
| `/student/performance` | `/app/performance` | Shared (same data, different copy) |
| `/student/performance/:evaluationId` | `/app/performance/:evaluationId` | Shared |
| `/student/recommendations` | `/app/recommendations` | Shared |
| `/student/announcements` | `/app/announcements` | Shared |
| `/student/development` | `/app/development` | Student view only |
| `/student/parent-access` | `/app/parent-access` | Student view manages link; no separate parent account |
| `/parent` | `/app/overview?view=parent` | Parent view via ViewSwitcher, same account ID |
| `/parent/performance` | `/app/performance?view=parent` | Same sheet, Parent-view metadata on messages |
| `/parent/recommendations` | `/app/recommendations?view=parent` | Same |
| `/parent/messages` | `/app/messages` | Shared inbox |
| `/parent/messages/new` | `/app/messages/new` | `sent-from-Parent-view` metadata |
| `/parent/messages/:threadId` | `/app/messages/:threadId` | Shared |
| `/parent/students/:studentId` | `/app/students/:studentId` | Linked-student only |
| `/parent/students/:studentId/performance` | `/app/students/:studentId/performance` | Linked-student only |
| `/parent/students/:studentId/recommendations` | `/app/students/:studentId/recommendations` | Linked-student only |
| `/coordinator` | `/staff/overview` | Unified staff shell |
| `/coordinator/programs` | `/staff/programs` | Owned programs only |
| `/coordinator/programs/new` | `/staff/programs/new` | Owner create |
| `/coordinator/programs/:programId` | `/staff/programs/:programId` | Owner or assigned |
| `/coordinator/programs/:programId/edit` | `/staff/programs/:programId/edit` | Owner only |
| `/coordinator/programs/:programId/sessions` | `/staff/programs/:programId/sessions` | Fold into tab |
| `/coordinator/programs/:programId/students` | `/staff/programs/:programId/students` | Fold into tab |
| `/coordinator/programs/:programId/evaluators` | `/staff/programs/:programId/evaluators` | Fold into tab |
| `/coordinator/sessions` | `/staff/sessions` | Owned/assigned only |
| `/coordinator/students` | `/staff/students` | Coordinator-student link only |
| `/coordinator/students/:studentId` | `/staff/students/:studentId` | Same gate |
| `/coordinator/evaluators` | `/staff/evaluators` | Assignments mgmt |
| `/coordinator/performance` | `/staff/performance` | Owned scope |
| `/coordinator/insights` | `/staff/insights` | Owned scope |
| `/coordinator/profile` | `/staff/profile` | — |
| `/evaluator` | `/staff/overview` | Assigned evaluator lands here |
| `/evaluator/assignments/:assignmentId` | `/staff/assignments/:assignmentId` | Assignment-gated |
| `/evaluator/assignments/:assignmentId/students/:studentId` | `/staff/assignments/:assignmentId/students/:studentId` | Assignment-gated |
| `/evaluator/evaluation`, `/evaluator/evaluate` | DELETE (legacy duplicate) | Use PerStudentEvaluate path only |
| `/evaluator/students` | `/staff/students` | Assigned evaluees only |
| `/evaluator/status`, `/evaluator/submissions` | `/staff/submissions` | Dedupe (one route) |
| `/pending-approval` | `/account/pending` | Canonical pending state |
| `/account-rejected`, `/account-suspended` | `/account/pending?state=rejected\|suspended` | Query-param states |
| `/check-email` | `/verify-email` | Canonical verify route |
| (new) | `/evaluate/invite?token=` | Guest evaluator, token scope only |

## Delete / merge list

- DELETE `src/views/parent.jsx` — merged into shared `/app/*` + `ViewSwitcher`. No separate ParentShell, no `/parent/*` routes.
- DELETE legacy `LegacyEvaluate` routes (`/evaluator/evaluation`, `/evaluator/evaluate`).
- DELETE `/evaluator/status` duplicate (keep `/staff/submissions`).
- DELETE `/admin/configuration`, `/admin/audit-log` aliases (keep `/admin/config`, `/admin/audit`).
- KEEP `src/views/student.jsx`, `coordinator.jsx`, `evaluator.jsx` as source for component migration until `/app/*` and `/staff/*` shells land, then remove per-shell files.
