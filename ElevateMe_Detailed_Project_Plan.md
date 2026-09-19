# ElevateMe App - Detailed Project Plan

## 1. Product vision

ElevateMe is a student-growth platform that converts participation in speaking, leadership, debate, Model United Nations, and continuous-development programs into a structured performance record. Coordinators create programs and sessions, students register and join them, evaluators score performance, and students and parents receive clear progress insights and recommendations.

The product should feel like a straightforward institutional application: flat UI, strong typography, thin borders, minimal decoration, clear status labels, and simple workflows. The design can borrow the portfolio reference's disciplined hierarchy and editorial structure, but it should remain an application rather than a showcase website.

## 2. Product goals

1. Give every student one persistent ElevateMe profile and unique ElevateMe ID.
2. Let coordinators create and manage single events, continuous programs, and special programs.
3. Make joining a program simple and traceable.
4. Standardize evaluation across ten performance criteria.
5. Turn evaluation history into useful graphs, automated insights, and recommendations.
6. Support simple communication between Diplomatic Impact, parents, students, and coordinators without building a complex social or chat platform.
7. Give Diplomatic Impact full approval, moderation, and reporting control.

## 3. User roles and permissions

### Student

- Creates and maintains a profile.
- Receives a unique ElevateMe ID.
- Browses approved programs and events.
- Joins eligible programs, committees, sessions, or assigned tracks.
- Sees approved performance sheets, graphs, insights, announcements, and recommendations.
- Can view their own data only.

### Parent or guardian

- Is linked to one or more student accounts through an invitation or verification flow.
- Sees approved student progress and recommendations.
- Sends a message to Diplomatic Impact and replies to messages addressed to them.
- Cannot edit student scores or program data.

### Teacher / programme coordinator

- Registers an institutional profile.
- Creates programs, events, committees, sessions, and enrolment options.
- Views registered students in programs they manage.
- Shares controlled evaluator access.
- Sees individual and aggregate performance for assigned students.
- Cannot approve their own platform account or publish unapproved events.

### Resource person / evaluator

- Opens a secure invitation link or authenticated evaluator workspace.
- Sees only the event, session, and students assigned to them.
- Completes and submits Student Performance Sheets.
- Cannot alter user accounts, event approval, or Diplomatic Impact recommendations.

### Diplomatic Impact administrator

- Approves coordinator, evaluator, and protected-profile access.
- Approves, rejects, or requests changes to programs and events.
- Manages users, institutes, program types, criteria, and access.
- Sends announcements and student-specific recommendations.
- Reviews all evaluations and controls when results become visible.
- Sees platform-wide analytics, audit history, and exports.

## 4. Core information architecture

### Public website

- Home
- About ElevateMe
- Approved Programs and Events
- Event Details
- Sign Up / Sign In

### Student application

- Dashboard
- My Profile
- Programs and Events
- My Registrations
- Performance
- Recommendations
- Announcements
- Further Development
- Parent Access

### Parent application

- Student Overview
- Performance
- Recommendations
- Messages

### Coordinator application

- Dashboard
- Programs and Events
- Sessions / Committees
- Students
- Evaluators
- Performance
- Class / Cohort Insights
- Profile

### Evaluator application

- Assigned Sessions
- Student List
- Evaluation Form
- Submission Status

### Admin application

- Approval Queue
- Programs and Events
- Users and Institutes
- Evaluations
- Recommendations and Announcements
- Reports
- Configuration
- Audit Log

## 5. Functional scope

### 5.1 Authentication and onboarding

- Email-and-password sign-up with email verification.
- Role selection during sign-up, followed by role-specific fields.
- Student fields: full name, date of birth, institute, referee name/contact, email, phone, photo, password.
- Coordinator fields: full name, institute, national ID or approved identity field, phone, email, photo, password.
- Parent linking through a time-limited student-issued or admin-issued invitation; never through open ID lookup alone.
- Password reset, session management, account suspension, consent and privacy acceptance.
- Approval statuses: Draft, Email Unverified, Pending Review, Approved, Changes Requested, Rejected, Suspended.

### 5.2 ElevateMe ID

- Generate a unique, immutable public student identifier after successful registration.
- The source document proposes the numeric range `00099` to `99999`; this supports fewer than 100,000 identifiers and should not be used as a database primary key.
- Recommended approach: internal UUID plus a display ID such as `EM-00100`, generated transactionally and never reused.
- Do not expose date of birth, phone, or sequential database IDs through the identifier.

### 5.3 Program and event management

- Program categories: Single Event, Continuous Programme, Special Programme.
- Single-event types initially include Model United Nations, Friendly Debate, Competition, and Special.
- Common fields: title, cover image, description, type, institute/organizer, venue or online link, start/end dates, registration window, capacity, eligibility, contact, visibility, and status.
- Type-specific structures:
  - Model UN: committees and optional country/portfolio choices.
  - Friendly Debate: sessions, motions/topics, teams, and dates.
  - Continuous Programme: recurring sessions, cohort dates, attendance, and longitudinal evaluation.
  - Special Programme: administrator-configurable structure.
- Lifecycle: Draft -> Submitted -> Under Review -> Changes Requested / Approved / Rejected -> Published -> Registration Closed -> In Progress -> Completed -> Archived.
- Public pages show only Published programs; student profile registration is required to join.

### 5.4 Registration and participation

- Students select an event and, when applicable, committee, country, track, session, or cohort.
- Validate eligibility, duplicate registration, capacity, deadline, and conflicting assignments.
- Registration statuses: Pending, Confirmed, Waitlisted, Withdrawn, Attended, Absent, Completed.
- Coordinators see a searchable Student Details Sheet with name, ElevateMe ID, allocation, status, and evaluation completion.
- CSV export and printable roster can follow after the core workflow is stable.

### 5.5 Evaluator access

- Coordinator selects a program/session and invites a resource person by email.
- The system generates a signed, expiring, single-purpose invitation.
- Evaluator verifies identity and receives only assigned scope.
- Each student-session evaluation has one clear state: Not Started, Draft, Submitted, Locked, Reopened.
- Admin or authorized coordinator can reopen a submission; every change is audited.

### 5.6 Student Performance Sheet

Initial criteria from the source document:

1. Preparation
2. Clarity
3. Confidence
4. Focus
5. Critical Analysis
6. Sound (clarify whether this means vocal quality, audibility, or reasoning soundness)
7. Audience Addressing
8. Counter Arguments
9. Wit
10. Overall Performance

Recommended scoring model:

- Use one canonical numeric scale, such as 1-5, with labels: Limited, Good, Very Good, Excellent, Outstanding.
- Keep `50+` as a computed total or legacy display only after the business meaning is confirmed.
- Every score should have rubric guidance so evaluators use levels consistently.
- Optional fields: evaluator remarks, strengths, development areas, private admin note.
- Validate all required criteria before submission.
- Lock submitted sheets and record evaluator, timestamp, revision, and approval status.
- Results become visible to students only after the configured approval/release action.

### 5.7 Performance and insights

The Performance page has two intentionally simple sections.

**Graphs**

- Filters: skill, time period, program, and session.
- Views: individual score trend, overall average trend, and criterion comparison.
- Each graph includes a plain-language summary and accessible table alternative.
- No decorative charts or dense dashboard grids.

**Your Insights**

- Start with deterministic, explainable rules rather than generative AI.
- Examples: strongest skill, most improved skill, declining criterion, score consistency, insufficient-data notice.
- Every insight states the evidence window, for example: "Confidence improved from 3.0 to 4.0 across your last four evaluated sessions."
- Require a minimum data threshold, such as three completed evaluations, before trend claims.
- Later, AI may rewrite verified metrics into natural language, but it must not invent scores or diagnoses.

### 5.8 Recommendations and announcements

- Announcements are one-way messages from Diplomatic Impact to all users, a role, a program, or a cohort.
- Display them as a flat chronological list with title, short body, date, sender, audience, and optional link.
- Recommendations are targeted development actions for one student or a defined student group.
- Fields: title, action, reason, skill area, priority, optional due date, related program/evaluation, and status.
- Students can mark a recommendation Viewed or Completed; avoid comments and social interaction in MVP.

### 5.9 Parent-Diplomatic Impact messages

- Use a request/reply model, not a real-time chat interface.
- Each item is a message card containing the original message and one visible reply thread.
- Either side can start a message; the recipient replies to that specific item.
- States: Open, Replied, Closed.
- Include subject, message, sender, timestamp, reply, and optional student association.
- In-app and email notifications are sufficient; typing indicators, presence, reactions, and group chat are out of scope.

### 5.10 Notifications

- In-app notifications for account approval, event approval, registration outcome, evaluator assignment, evaluation release, recommendation, announcement, and message reply.
- Email only for important or time-sensitive events.
- User-level notification preferences can be added after MVP.

### 5.11 Administration and reporting

- Approval queues with filters, notes, and clear actions.
- User and institute management.
- Configurable program types and evaluation rubrics.
- Evaluation release controls.
- Basic reports: registrations, attendance, evaluation completion, average by criterion, improvement over time, and program summary.
- CSV export with role checks and audit entries.
- Audit all approvals, score changes, releases, exports, role changes, and account suspension.

## 6. Key end-to-end workflows

### Workflow A: Create and publish an event

1. Coordinator creates a draft and chooses program type.
2. Coordinator enters details, adds committees/sessions, and submits.
3. Admin reviews and either approves, requests changes, or rejects.
4. Approved event is published on the public site and in the app.
5. Coordinator receives an approval notification.

### Workflow B: Student joins and is allocated

1. Student opens a published event.
2. Student chooses the required committee, country, track, or session.
3. System validates availability and creates registration.
4. Coordinator confirms, waitlists, or declines it.
5. Student sees the result and event in My Registrations.

### Workflow C: Evaluate a student

1. Coordinator assigns an evaluator to a session.
2. Evaluator opens the secure workspace and selects a student.
3. Evaluator scores ten criteria and adds remarks.
4. Evaluator saves a draft or submits.
5. Authorized reviewer releases the evaluation.
6. Student performance graphs and insights recalculate.

### Workflow D: Communicate development actions

1. Admin reviews a student's released performance.
2. Admin creates a targeted recommendation.
3. Student and linked parent receive a notification.
4. Student reads and optionally marks the action complete.

## 7. Data model

Core entities:

- `User`: authentication identity, contact details, account status.
- `RoleAssignment`: user, role, institute/scope, approval state.
- `StudentProfile`: user, ElevateMe ID, date of birth, institute, referee data.
- `ParentStudentLink`: parent, student, invitation/verification state.
- `Institute`: name, contact details, verification state.
- `Program`: type, owner, descriptive fields, lifecycle status.
- `ProgramComponent`: committee, track, cohort, or other nested unit.
- `Session`: program component, title/topic, start/end, venue.
- `Registration`: student, program, allocation, participation status.
- `EvaluatorAssignment`: evaluator, session/component, access expiry.
- `EvaluationTemplate`: versioned criteria and rubrics.
- `Evaluation`: student, session, evaluator, template version, status, totals, remarks.
- `EvaluationScore`: evaluation, criterion, numeric score.
- `Recommendation`: recipient, skill, action, source, priority, status.
- `Announcement`: author, audience, publication dates.
- `MessageThread`: participants, student context, subject, state.
- `Message`: thread, author, body, timestamp.
- `Notification`: user, type, read state, destination.
- `AuditEvent`: actor, action, entity, before/after metadata, timestamp.

Important rules:

- Evaluation templates are versioned; historical scores must retain their original rubric.
- Soft-delete or archive institutional records rather than removing history.
- Use server-side authorization on every query, not merely hidden navigation.
- Store uploaded files in managed object storage with private-by-default access.

## 8. UX and visual system

- Desktop-first responsive web application with strong tablet support and usable mobile student views.
- Flat surfaces, square or lightly rounded corners, thin neutral borders, and almost no shadow.
- One restrained accent color for primary actions and status emphasis.
- Four typography levels: page title, section title, item title, metadata/body.
- Persistent left navigation for staff; compact top/bottom navigation may be used for students on mobile.
- Use tables for operational staff data and simple lists/cards for student content.
- Every page should have one obvious primary action.
- Use explicit empty, loading, error, permission-denied, and success states.
- Meet WCAG 2.2 AA: keyboard access, visible focus, semantic headings, form labels, error summaries, sufficient contrast, and non-color status cues.

## 9. Technical architecture

A practical web stack:

- Frontend: Next.js with TypeScript.
- UI: component-based design system using CSS/Tailwind or CSS modules; keep components flat and restrained.
- Backend: Next.js server routes for a compact team, or NestJS if backend and frontend ownership are separate.
- Database: PostgreSQL with Prisma or another typed ORM.
- Authentication: managed authentication with role and approval checks implemented in the application database.
- File storage: private S3-compatible object storage.
- Email: transactional email provider with templated messages.
- Analytics/graphs: a lightweight accessible chart library.
- Hosting: Vercel for the web layer plus managed Postgres/storage, or an equivalent regional deployment.
- Observability: structured logs, error reporting, uptime monitoring, and audit events.

Architecture principle: begin as a modular monolith. Separate modules for identity, programs, registration, evaluation, insights, communication, and administration, but avoid microservices until scale or team structure proves the need.

## 10. Security, privacy, and safeguarding

- Treat student records as sensitive; some users may be minors.
- Obtain appropriate guardian consent and publish clear privacy/retention policies.
- Minimize collection of national ID and date-of-birth data. If national ID is essential, document the lawful purpose, restrict access, encrypt it, and define deletion rules.
- Do not display referee contact details outside authorized verification staff.
- Enforce least-privilege role and record-level access.
- Add rate limiting, CSRF protection where applicable, secure cookies, input validation, upload scanning, and security headers.
- Encrypt data in transit and at rest; maintain tested backup and restore procedures.
- Keep immutable audit history for sensitive administrative actions.
- Define incident response, account recovery, data export, correction, and deletion workflows before launch.
- Complete a jurisdiction-specific privacy/legal review before collecting production student data.

## 11. Delivery roadmap

Assumption: one product designer, two full-stack engineers, and part-time QA/product ownership. Estimated calendar time is 16-20 weeks; a solo developer should expect materially longer.

### Phase 0 - Discovery and decisions (Weeks 1-2)

- Confirm role definitions, approval ownership, and institute model.
- Finalize program types and the meaning of Special Programme.
- Run a rubric workshop to define score scale, `50+`, `L/G/VG/E`, and "Sound."
- Decide who releases evaluations and what parents may see.
- Map consent, data retention, and minor-safeguarding requirements.
- Produce sitemap, state diagrams, low-fidelity flows, backlog, and acceptance criteria.

Exit criteria: no unresolved rule blocks database or workflow design.

### Phase 1 - Foundation and design system (Weeks 3-4)

- Repository, environments, CI, deployment preview, database migrations.
- Authentication, email verification, password reset, roles, permissions, and approval states.
- Flat UI foundations: typography, spacing, colors, buttons, fields, tables, status badges, dialogs, empty states.
- App shells for student, coordinator, evaluator, parent, and admin.
- Logging, error reporting, audit-event foundation, and seed data.

Exit criteria: users can sign up, sign in, and land in the correct role shell; protected routes pass authorization tests.

### Phase 2 - Profiles, programs, and approval (Weeks 5-7)

- Student/coordinator profiles and ElevateMe ID generation.
- Institute records.
- Program/event creation for all three high-level types.
- Committees, sessions, and cohorts.
- Admin approval queue and event publication.
- Public approved-event listing and details.
- Status notifications.

Exit criteria: a coordinator can submit an event; admin can approve it; a student can discover the published result.

### Phase 3 - Registration and evaluator workflow (Weeks 8-10)

- Student registration and allocation.
- Coordinator roster/search and status management.
- Secure evaluator invitation and assignment.
- Student Details Sheet.
- Evaluation template, rubric, draft, validation, submission, lock, and reopen.
- Evaluation review/release.

Exit criteria: one event can run from student registration through a released evaluation with a complete audit trail.

### Phase 4 - Performance and development (Weeks 11-13)

- Student performance history.
- Skill, period, program, and session filters.
- Accessible graphs and calculation services.
- Rule-based insights with minimum-data safeguards.
- Teacher individual and cohort views.
- Recommendations and flat announcement feed.

Exit criteria: released evaluations reliably update graphs and evidence-based insights; admin can publish recommendations and announcements.

### Phase 5 - Parent access and messaging (Weeks 14-15)

- Verified parent-student linking.
- Parent progress and recommendation views.
- Basic message/reply workflow with Open/Replied/Closed states.
- In-app and email reply notifications.

Exit criteria: a verified parent sees only linked-student data and can exchange scoped messages with Diplomatic Impact.

### Phase 6 - Hardening and pilot (Weeks 16-18)

- Cross-role end-to-end testing and accessibility audit.
- Permission/security tests, privacy review, performance optimization, backup/restore drill.
- Data export and operational reports required for the pilot.
- Admin and coordinator training materials.
- Pilot with one event and one continuous program.
- Collect issues, stabilize, and prepare production release.

Exit criteria: zero critical defects, verified restore process, approved privacy controls, and pilot sign-off.

### Phase 7 - Post-MVP improvements (Weeks 19+)

- Attendance and richer cohort management.
- Configurable rubrics and additional program templates.
- CSV imports, certificates, calendar integration, and advanced exports.
- Better comparison analytics and intervention tracking.
- AI-assisted narrative insights only after metric accuracy and governance are proven.

## 12. MVP boundary

### Must be in MVP

- Student and coordinator onboarding with approvals.
- ElevateMe ID.
- Three program categories and basic type-specific setup.
- Event approval and public/app publication.
- Student registration and coordinator roster.
- Evaluator assignment and ten-criterion evaluation.
- Controlled result release.
- Student performance history, basic graphs, and rule-based insights.
- Admin recommendations and announcements.
- Parent linking and basic request/reply messages.
- Notifications, audit log, and essential exports.

### Explicitly defer

- Real-time chat, video calls, reactions, and social feeds.
- Native iOS/Android applications.
- Payments and subscriptions.
- Complex AI coaching or generated scoring.
- Gamification, badges, public leaderboards, and peer scoring.
- Highly customizable page builders or workflow engines.
- Microservices and elaborate analytics infrastructure.

## 13. Quality and acceptance strategy

- Unit tests for score calculations, insight rules, ID generation, and permissions.
- Integration tests for registration capacity, approval transitions, evaluation locking, and result release.
- End-to-end tests for the four main workflows in Section 6.
- Authorization matrix tests for every role/entity combination.
- Accessibility checks in CI plus manual keyboard/screen-reader testing.
- Test responsive layouts at mobile, tablet, laptop, and wide desktop sizes.
- Seed a realistic pilot dataset and verify graphs against hand-calculated values.
- Track defects by severity; block release for security, data-loss, permission, or score-calculation defects.

## 14. Product analytics and success measures

- Sign-up completion rate by role.
- Median account approval time.
- Program submission-to-approval time.
- Registration completion and attendance rates.
- Percentage of assigned evaluations submitted before deadline.
- Evaluation release turnaround time.
- Percentage of students with enough data for trends.
- Recommendation view/completion rate.
- Parent activation and message resolution time.
- Permission incidents, failed exports, and support requests.

Pilot targets should be modest and operational: 95% of assigned evaluations submitted successfully, zero cross-student data exposure, under two minutes for an evaluator to complete one sheet after training, and at least 80% of pilot students able to find their latest result without assistance.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Ambiguous scoring notation | Incorrect data and misleading graphs | Finalize one numeric rubric before implementation; version templates. |
| Sequential ID exhaustion or enumeration | Privacy/security and future migration | Use UUID internally, prefixed display ID, rate limits, and no public lookup. |
| Evaluator inconsistency | Low-trust insights | Rubric descriptions, evaluator guidance, calibration, and review samples. |
| Premature AI claims | Incorrect or opaque advice | Start with deterministic calculations and expose evidence. |
| Minor/student privacy | Legal and safeguarding harm | Consent, minimization, record-level authorization, audit, and legal review. |
| Event-type complexity | Schedule and UX expansion | Use shared program primitives plus a small number of type-specific fields. |
| Parent identity uncertainty | Unauthorized access | Invitation-based linking and explicit verification/revocation. |
| Scope creep into a social platform | Delayed launch | Preserve one-way announcements and scoped request/reply messaging. |

## 16. Decisions required before development

1. Is the first launch web-only, and which device is primary for evaluators?
2. Are students under 18, and what exact guardian-consent process is required?
3. What does `50+` mean, and what numeric values map to `L`, `G`, `VG`, and `E`?
4. What exactly does the criterion "Sound" measure?
5. Who may create an evaluation, who approves it, and who releases it?
6. Can students join freely, or must coordinators confirm every registration?
7. Does a parent see all remarks, or are some remarks staff-only?
8. Is a national ID truly required for teachers/coordinators, and how long is it retained?
9. Can one person hold multiple roles, such as coordinator and evaluator?
10. Which three reports are mandatory for the first pilot?

## 17. Recommended first pilot

Pilot two contrasting workflows:

- One Model United Nations event with committees, country allocation, and one evaluation round.
- One continuous Academic Speaking program with at least three sessions per student.

This tests both event-based and longitudinal behavior, exposes whether the shared data model is sound, and provides enough repeated scores to validate performance trends and automated insights.

## 18. Definition of done for MVP

The MVP is complete when an approved coordinator can create a program, an administrator can publish it, a student can join it, an assigned evaluator can submit a rubric-based performance sheet, an authorized reviewer can release it, and the student and verified parent can see correct progress and recommendations - with every sensitive action permission-checked and auditable.

---

Source basis: *Diplomatic Impact - App* concept document supplied by the user, combined with the established ElevateMe direction for flat UI, simple announcement-style recommendations, two-section performance views, and basic reply-based parent communication.
