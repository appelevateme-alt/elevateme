# ElevateMe App - Frontend Exclusive Project Plan

## 1. Frontend objective

Build a responsive, accessible web interface for ElevateMe that supports students, parents, teachers/programme coordinators, resource-person evaluators, and Diplomatic Impact administrators.

The frontend must make complex institutional workflows feel simple. It should use flat, editorial interface patterns: strong typography, disciplined spacing, thin dividers, rectangular controls, restrained color, minimal shadows, and clear status language. It must not look like a card-heavy SaaS dashboard.

This plan covers only the frontend application: information architecture, page layouts, components, client-side state, API integration boundaries, validation, accessibility, performance, testing, and delivery.

## 2. Frontend success criteria

- Every user lands in the correct role-specific workspace after authentication.
- The primary task on every page is obvious without training.
- A coordinator can create and submit a program using clear progressive steps.
- A student can discover and join an event without confusion.
- An evaluator can complete a Student Performance Sheet quickly on a laptop or tablet.
- Released evaluations appear accurately in performance views.
- Students can understand graphs and insights without interpreting technical analytics.
- Recommendations resemble a simple announcement feed.
- Parent communication behaves like individual message-and-reply records, not chat.
- All primary workflows work by keyboard and meet WCAG 2.2 AA.
- Responsive layouts remain usable at mobile, tablet, laptop, and wide-desktop sizes.

## 3. Recommended frontend stack

### Core

- Next.js with the App Router.
- TypeScript in strict mode.
- React Server Components for static/data-led screens where practical.
- Client Components only where interaction, browser state, or live validation requires them.

### Styling and components

- Tailwind CSS with a small token layer, or CSS Modules if the team prefers stricter component ownership.
- Radix Primitives or React Aria for accessible behavioral foundations, visually restyled to match ElevateMe.
- Lucide icons used sparingly and always paired with text for important actions.
- No large generic UI kit whose default style conflicts with the flat design direction.

### Forms, data, and charts

- React Hook Form for complex forms.
- Zod schemas shared with the API contract where possible.
- TanStack Query for client-side server state that needs caching, mutation, or refetching.
- Native server fetching for page-level read views when it reduces client JavaScript.
- Recharts, Visx, or another lightweight accessible chart library after a small prototype comparison.
- date-fns for date formatting and range logic.

### Quality tooling

- ESLint and Prettier.
- Vitest and React Testing Library.
- Playwright for end-to-end testing.
- Storybook for shared components and interaction states.
- axe-core or equivalent automated accessibility checks.
- Sentry or equivalent frontend error monitoring.

## 4. Design principles

### Visual character

- Typography leads; containers support.
- Use whitespace, alignment, labels, and rules to create hierarchy.
- Prefer page sections and rows over floating cards.
- Use square or lightly rounded corners, approximately 0-6px.
- Use one restrained brand accent and neutral status colors.
- Avoid gradients, glass effects, large drop shadows, decorative blobs, and excessive illustrations.
- Avoid placing every statistic inside a separate box.

### Interaction character

- One obvious primary action per page.
- Keep secondary actions visually quiet.
- Use explicit language: `Submit for approval`, not `Continue` when the action is consequential.
- Never rely on icons alone for core actions.
- Confirm destructive actions and explain their effect.
- Preserve form drafts where losing work would be costly.
- Display statuses in plain language with the next available action nearby.

### Information hierarchy

Use four stable type levels:

1. Display/page title.
2. Section heading.
3. Item or record title.
4. Body text and metadata.

Recommended page heading pattern:

- Small eyebrow: role or section.
- Large title: page purpose.
- One-line description.
- Primary action aligned to the title block on desktop and below it on mobile.

## 5. Design tokens

The exact brand values should be confirmed during visual design, but implementation should begin with semantic tokens.

### Color tokens

- `background`: page canvas.
- `surface`: form and table surface.
- `surface-muted`: subtle grouped area.
- `text-primary`: headings and main content.
- `text-secondary`: metadata and supporting copy.
- `border`: standard rule.
- `border-strong`: emphasized separation.
- `brand`: primary action and active navigation.
- `brand-contrast`: text on brand background.
- `success`, `warning`, `danger`, `info`: status semantics.
- Each status must include text or an icon; color alone is insufficient.

### Spacing tokens

Use a consistent 4px base scale, with common values at 4, 8, 12, 16, 24, 32, 48, 64, and 96px. Page rhythm should favor 24-48px gaps rather than wrapping every group in a card.

### Typography tokens

- Display: 48-72px desktop, 36-44px mobile.
- Page title: 32-44px desktop, 28-34px mobile.
- Section title: 22-28px.
- Item title: 16-20px.
- Body: 15-17px.
- Metadata: 12-14px.
- Use a highly legible sans-serif family with clear numerals.

### Shape and elevation

- Radius: 0, 2, 4, and 6px only.
- Border: 1px default.
- Shadows: none by default; a very subtle shadow is acceptable only for overlays.
- Focus ring: visible 2px outline with adequate contrast.

## 6. Responsive system

### Target widths

- Mobile: 320-767px.
- Tablet: 768-1023px.
- Laptop: 1024-1439px.
- Wide desktop: 1440px and above.

### Layout behavior

- Staff workspaces are desktop-first because they use tables, rosters, and multi-field forms.
- Student and parent workflows must be fully usable on mobile.
- Evaluations must be excellent on tablet as resource people may score during live events.
- Desktop staff shell uses a persistent left navigation and top utility bar.
- Tablet shell collapses navigation to a drawer or compact rail.
- Mobile student shell uses a compact header and bottom or drawer navigation with no more than five primary destinations.
- Tables convert to stacked record rows only where column relationships remain understandable; otherwise use horizontal scrolling with a fixed first column.
- Filters stack vertically on mobile and remain inline on larger screens.
- Graphs receive a minimum readable height and a data-table fallback.

## 7. Application route architecture

Suggested route groups:

```text
app/
  (public)/
  (auth)/
  (student)/student/
  (parent)/parent/
  (coordinator)/coordinator/
  (evaluator)/evaluator/
  (admin)/admin/
```

### Public routes

- `/` - landing page.
- `/about` - ElevateMe explanation.
- `/programs` - approved program/event directory.
- `/programs/[programId]` - public details.
- `/sign-in`.
- `/sign-up`.
- `/forgot-password` and `/reset-password`.

### Student routes

- `/student` - dashboard.
- `/student/profile`.
- `/student/programs`.
- `/student/programs/[programId]`.
- `/student/registrations`.
- `/student/performance`.
- `/student/performance/[evaluationId]`.
- `/student/recommendations`.
- `/student/announcements`.
- `/student/development`.
- `/student/parent-access`.

### Parent routes

- `/parent` - linked-student overview.
- `/parent/students/[studentId]`.
- `/parent/students/[studentId]/performance`.
- `/parent/students/[studentId]/recommendations`.
- `/parent/messages`.
- `/parent/messages/[threadId]`.

### Coordinator routes

- `/coordinator` - dashboard.
- `/coordinator/programs`.
- `/coordinator/programs/new`.
- `/coordinator/programs/[programId]`.
- `/coordinator/programs/[programId]/edit`.
- `/coordinator/programs/[programId]/sessions`.
- `/coordinator/programs/[programId]/students`.
- `/coordinator/programs/[programId]/evaluators`.
- `/coordinator/students/[studentId]`.
- `/coordinator/performance`.
- `/coordinator/profile`.

### Evaluator routes

- `/evaluator` - assigned sessions.
- `/evaluator/assignments/[assignmentId]`.
- `/evaluator/assignments/[assignmentId]/students/[studentId]`.
- `/evaluator/submissions`.

### Admin routes

- `/admin` - operational overview.
- `/admin/approvals`.
- `/admin/programs`.
- `/admin/users`.
- `/admin/institutes`.
- `/admin/evaluations`.
- `/admin/recommendations`.
- `/admin/announcements`.
- `/admin/messages`.
- `/admin/reports`.
- `/admin/configuration`.
- `/admin/audit-log`.

## 8. Shared application shells

### Staff shell

- Fixed or sticky left navigation.
- Brand and role label at top.
- Primary navigation in the center.
- Profile and sign-out at bottom.
- Top bar contains breadcrumb, notifications, and contextual utilities.
- Main content uses a readable max width but allows data tables to expand.

### Student shell

- Simplified navigation: Home, Programs, Performance, Recommendations, Profile.
- Announcements can appear as a home feed and a secondary page.
- Mobile uses compact navigation and prevents deep menu nesting.

### Parent shell

- Student selector appears only if more than one student is linked.
- Clear context banner states whose data is being viewed.
- Primary destinations: Overview, Performance, Recommendations, Messages.

### Evaluator shell

- Distraction-free and task-oriented.
- Always displays assignment, session, student, and submission status.
- Provides previous/next student navigation without losing drafts.

## 9. Shared component inventory

### Navigation

- `AppSidebar`
- `MobileNavigation`
- `TopBar`
- `Breadcrumbs`
- `RoleBadge`
- `UserMenu`

### Page structure

- `PageHeader`
- `SectionHeader`
- `ContentSection`
- `Divider`
- `SplitLayout`
- `StickyActionBar`

### Inputs

- Text input, text area, select, combobox, radio group, checkbox, date input, date range, file upload, image upload, score selector, and search field.
- Each input supports label, hint, error, required state, disabled state, and character count where useful.

### Actions and feedback

- Primary, secondary, quiet, and danger buttons.
- Inline alert.
- Status label.
- Toast for non-critical confirmation only.
- Confirmation dialog.
- Progress indicator.
- Empty state.
- Skeleton/loading state.
- Error state with retry.
- Permission-denied state.

### Data display

- Data table.
- Responsive record list.
- Definition list.
- Metric line.
- Avatar/photo.
- Filter bar.
- Pagination.
- Sort control.
- Timeline/history.
- Accessible chart frame and chart legend.

### Domain components

- `ProgramRow`
- `ProgramStatus`
- `RegistrationStatus`
- `StudentRoster`
- `EvaluationStatus`
- `CriterionScoreInput`
- `PerformanceChart`
- `InsightItem`
- `RecommendationItem`
- `AnnouncementItem`
- `MessageRecord`
- `ApprovalRecord`
- `NotificationItem`

## 10. Detailed page plan

### 10.1 Public program directory

Purpose: allow anyone to discover approved ElevateMe programs.

Layout:

- Editorial page heading.
- Search and a small set of filters: program type, status/date, institute.
- Flat program rows separated by rules.
- Each row shows date, type, title, short description, organizer, and availability.
- Pagination or `Load more`; avoid infinite scrolling for an institutional directory.

States:

- Loading skeleton rows.
- No published programs.
- No search results with `Clear filters` action.
- Registration closed.

### 10.2 Authentication and onboarding

Use a short multi-step flow instead of one extremely long form.

1. Choose role.
2. Account details.
3. Role-specific profile information.
4. Photo and verification information.
5. Review, consent, and submit.

Requirements:

- Show progress and allow back navigation.
- Save safe draft data locally during the active session.
- Validate each field on blur and each step on continue.
- Provide a summary of all errors at submission.
- Explain pending approval clearly after completion.

### 10.3 Student dashboard

Sections:

- Greeting and concise profile status.
- Next registered event/session.
- Latest released performance result.
- Current recommendations.
- Recent announcements.

Avoid a grid of decorative metrics. Use a vertically ordered overview with direct links to the next action.

### 10.4 Program details and registration

Layout:

- Program title, type, dates, status, and organizer.
- Description and eligibility.
- Sessions, committees, or available tracks.
- Registration panel with current selection and clear CTA.

Interaction:

- Dynamically show only relevant choices for the program type.
- Validate capacity and choice combinations through API responses.
- Present a final confirmation summary before registration.
- After submission, show the exact registration state and what happens next.

### 10.5 Coordinator program builder

Recommended steps:

1. Basics.
2. Schedule and location.
3. Program structure.
4. Registration rules.
5. Media and description.
6. Review and submit.

Frontend behavior:

- A left step index on desktop and compact progress header on mobile.
- Save draft action always visible.
- Autosave only after backend reliability is proven; otherwise use explicit save with unsaved-change warning.
- Program-type-specific fields appear in the structure step.
- Review screen mirrors the eventual public display.
- After submission, editing is restricted according to status and clearly explained.

### 10.6 Coordinator program workspace

Tabs or local navigation:

- Overview.
- Sessions/Committees.
- Students.
- Evaluators.
- Performance.
- Settings.

Header shows program name, date, lifecycle status, and the next valid action. Avoid hiding primary workflow actions inside overflow menus.

### 10.7 Student roster / Student Details Sheet

Desktop columns:

- Number.
- Student name.
- ElevateMe ID.
- Committee/session/allocation.
- Registration status.
- Evaluation status.
- Row action.

Features:

- Search by name or ElevateMe ID.
- Filters for allocation, registration, attendance, and evaluation status.
- Sortable name and status columns.
- Bulk actions only when truly required and permission-safe.
- Mobile presents student records as separated rows with the most important fields first.

### 10.8 Evaluator workspace

Assignment page:

- Session context and instructions.
- Completion summary: submitted / total.
- Searchable student list.
- Clear markers for Not Started, Draft, Submitted, Locked, and Reopened.

Evaluation form:

- Sticky student/session context.
- Ten criteria displayed as rows.
- Each row includes criterion, one-line rubric, level selector, and optional help expansion.
- Keyboard-friendly score selection.
- Remarks grouped after scoring.
- Sticky `Save draft` and `Submit evaluation` actions.
- Submission confirmation explains that the form will lock.
- Unsaved-change protection on navigation.
- On tablet, targets must be large enough for fast touch input.

### 10.9 Student performance page

This page must have exactly two principal sections.

#### Section 1: Performance graphs

- Filter row: skill, time period, program, and session.
- Primary line chart for change over time.
- Optional criterion comparison only when it answers a clear question.
- Latest value, change, and evaluation count shown as text near the graph.
- Accessible data table directly associated with the visualization.
- Empty states distinguish `No evaluations yet` from `No data for these filters`.

#### Section 2: Your Insights

- Flat list of evidence-based insight rows.
- Each item contains a label, short statement, evidence period, and optional related recommendation.
- Example: `Improving - Confidence increased from 3.0 to 4.0 across four sessions.`
- Show an insufficient-data explanation rather than fabricating a trend.
- Avoid chatbot styling, sparkle icons, or exaggerated AI branding.

### 10.10 Recommendations page

Purpose: a one-way development announcement system from Diplomatic Impact.

Layout:

- Page heading and optional filters for status, skill, or priority.
- Chronological list of flat recommendation records separated by borders.
- Each record shows title, sender, date, action, reason, skill, priority, due date if present, and related evaluation/program.
- Simple `Mark complete` action when enabled.

Do not add comments, reaction buttons, threaded discussion, or complex kanban behavior.

### 10.11 Announcements page

- Chronological flat feed.
- Pinned items first, followed by date.
- Title, brief message, sender, audience label, published date, and optional link.
- Read/unread distinction should be subtle but accessible.
- Admin compose screen supports audience, publish date, expiry, title, body, and link.

### 10.12 Parent messaging

Inbox:

- List of message records with subject, linked student, sender, date, and state.
- Filters: Open, Replied, Closed.
- `New message` opens a conventional form with student, subject, and message.

Message detail:

- Original message shown as a bordered record.
- Replies displayed beneath it in chronological order.
- One reply form at the bottom.
- State action: close or reopen when permitted.

Exclude chat bubbles, presence, typing indicators, read receipts, emoji reactions, and real-time expectations.

### 10.13 Admin approval queue

- Queue summary using one compact line of counts rather than dashboard cards.
- Filter by request type, status, institute, and submitted date.
- Table of approval records.
- Detail view uses a two-column comparison: submitted information and review panel.
- Actions: Approve, Request changes, Reject.
- Require a note for Request changes and Reject.
- Confirmation describes visibility or access changes caused by approval.

### 10.14 Admin recommendations and announcements

- List, create, schedule, edit draft, publish, archive.
- Recipient selector supports individual student, cohort/program, or role.
- Always show an audience preview before publishing.
- Student-specific recommendations can reference an evaluation but must not expose staff-only remarks.

## 11. Frontend state model

Every data-led screen must design these states before implementation:

- Initial loading.
- Background refetching.
- Success with data.
- Success with no data.
- Filtered empty result.
- Validation error.
- API error with retry.
- Permission denied.
- Not found.
- Offline or interrupted submission.
- Stale data/conflict.
- Success confirmation.

Important mutation states:

- Idle.
- Submitting.
- Succeeded.
- Failed with preserved input.
- Conflict requiring refresh/review.

Never clear form fields after a failed request.

## 12. API integration contract

The frontend should consume a versioned, typed API contract.

### Standards

- Generate or share TypeScript types from OpenAPI or schemas.
- Use a central API client for authentication, headers, error normalization, and request IDs.
- Convert server errors into consistent UI categories: validation, authentication, authorization, conflict, rate limit, and unexpected error.
- Do not infer permissions solely from role names; consume allowed actions or validate every action server-side.
- Use cursor/page-based pagination consistently.
- Store dates as ISO strings and format them at the display boundary.
- Keep score calculations and insight truth on the server; the frontend presents results.

### Data-fetching approach

- Server-render public program pages and stable read views where beneficial.
- Use TanStack Query for dashboards, filters, rosters, mutations, and data that changes during a session.
- Invalidate only affected query keys after mutation.
- Use optimistic updates only for low-risk actions such as read state; do not optimistically approve events or submit evaluations.

## 13. Authentication and frontend authorization

- Middleware protects route groups at a coarse level.
- Layouts verify session and approved role before rendering navigation.
- Page/API requests enforce record scope on the server.
- UI hides unavailable actions but never treats hidden controls as security.
- Handle expired sessions with a clear reauthentication path and preserved return URL.
- Display pending, rejected, suspended, and changes-requested account screens explicitly.
- A multi-role user receives a role switcher only if the product approves multi-role accounts.

## 14. Form strategy

- Use schema-based validation with matching client/server rules.
- Validate format immediately but avoid aggressive errors while the user is typing.
- Move focus to the first invalid field after submit.
- Place errors beside fields and provide a summary for long forms.
- Mark optional fields explicitly.
- Use confirmation steps for registration, evaluation submission, publishing, and approval.
- Warn before leaving dirty forms.
- File uploads show type, maximum size, progress, preview, replacement, and failure recovery.
- Never request national ID or sensitive verification data without a clear purpose statement.

## 15. Accessibility plan

- Target WCAG 2.2 AA.
- Semantic landmarks: header, navigation, main, aside, footer.
- Logical heading order on every page.
- All functionality keyboard-operable.
- Visible focus that is not clipped by sticky containers.
- Skip-to-content link in every application shell.
- Minimum 44x44px touch targets for frequent tablet/mobile actions.
- Text contrast at least 4.5:1 for normal text.
- Form labels remain visible; placeholders are examples, not labels.
- Error summaries link to invalid fields.
- Dialogs trap focus and restore it to the trigger.
- Charts include text summaries and data tables.
- Status changes are announced through appropriate live regions without excessive interruption.
- Respect reduced-motion preferences.
- Test with keyboard, browser zoom at 200%, and at least one screen reader.

## 16. Performance plan

- Set a route-level JavaScript budget and review bundle growth in pull requests.
- Prefer server components and static rendering for non-interactive content.
- Dynamically import heavy charting and rich-editor code.
- Use responsive optimized images for event covers and profile photos.
- Avoid loading all students or evaluations at once; paginate or virtualize only after measuring.
- Cache public programs appropriately while ensuring status updates invalidate them.
- Prevent layout shift by reserving image/chart space.
- Target Core Web Vitals: LCP under 2.5s, INP under 200ms, CLS under 0.1 at the 75th percentile where realistic.
- Test performance on mid-range Android hardware and throttled network conditions.

## 17. Frontend security considerations

- Never render sensitive data that the current view does not need.
- Escape user content and sanitize any permitted rich text.
- Avoid raw HTML rendering for announcements and recommendations.
- Use secure, HTTP-only authentication cookies where architecture permits.
- Do not store access tokens, national IDs, dates of birth, or evaluation data in local storage.
- Restrict upload types and validate again on the server.
- Ensure errors and monitoring events exclude private student content.
- Clear client caches on sign-out and role switch.
- Use Content Security Policy and other security headers configured with the deployment layer.

## 18. Testing strategy

### Component tests

- Inputs and validation.
- Dialog focus behavior.
- Status labels.
- Score selector keyboard behavior.
- Tables, filters, and empty states.
- Graph summaries and data-table equivalence.

### Integration tests

- Sign-up steps and error recovery.
- Program builder rules for each program type.
- Registration selection and confirmation.
- Evaluation draft, submit, and locked states.
- Performance filter updates.
- Recommendation completion.
- Message reply and close/reopen behavior.

### End-to-end tests

1. Coordinator creates program and submits for approval.
2. Admin approves; event becomes visible.
3. Student registers for the event.
4. Coordinator confirms and assigns an evaluator.
5. Evaluator submits a complete performance sheet.
6. Admin/reviewer releases the result.
7. Student sees updated graph and insight.
8. Parent views the linked student's result and sends a message.

Run the critical path at desktop and tablet widths; run student and parent flows at mobile width.

### Visual regression

- Maintain baseline screenshots for shells, program list, builder, roster, evaluation form, performance page, recommendations, messages, and approval queue.
- Cover loading, empty, error, populated, and long-content variations.
- Review typography wrapping and table overflow at every supported breakpoint.

## 19. Frontend delivery roadmap

Assumption: one product designer and two frontend-capable engineers working alongside backend/API development. Estimated frontend duration: 14-17 weeks, with overlap between phases.

### Phase F0 - UX definition (Week 1)

- Confirm role navigation and route map.
- Resolve evaluation scale and program-type fields that affect UI.
- Produce low-fidelity flows for the four critical journeys.
- Establish content language and status vocabulary.
- Define accessibility and browser support matrix.

Deliverables: sitemap, role matrix, flow diagrams, low-fidelity wireframes, UI-state checklist.

### Phase F1 - Foundations (Weeks 2-3)

- Initialize Next.js/TypeScript project structure.
- Configure linting, formatting, tests, Storybook, CI, and environment handling.
- Implement tokens, typography, responsive grid, buttons, fields, statuses, alerts, and page structure.
- Build public, student, and staff shell prototypes.
- Establish API client, error normalization, query keys, and auth/session boundary.

Exit criteria: all shells and foundation components work responsively and pass initial accessibility checks.

### Phase F2 - Authentication and profiles (Weeks 4-5)

- Sign-in, password reset, role selection, onboarding steps, verification, approval-state screens.
- Student, coordinator, and parent profile views/edit forms.
- ElevateMe ID display component.
- Photo/file upload pattern.

Exit criteria: each supported role can complete the frontend onboarding flow against mocked or live endpoints.

### Phase F3 - Programs and registration (Weeks 6-8)

- Public program directory and detail page.
- Coordinator program list, builder, review, edit, and status views.
- Sessions/committees management.
- Student program discovery, structured choices, registration confirmation, and registration list.
- Admin program approval queue/detail.

Exit criteria: the complete create -> approve -> publish -> register flow passes end-to-end tests.

### Phase F4 - Rosters and evaluations (Weeks 9-11)

- Coordinator student roster, search, filters, and student details.
- Evaluator assignments and completion overview.
- Evaluation form, draft persistence, validation, submission confirmation, lock, and reopen states.
- Evaluation review/release interface.

Exit criteria: an evaluator can submit efficiently on tablet, and all evaluation states are represented correctly.

### Phase F5 - Performance and development (Weeks 12-13)

- Performance filter system.
- Accessible trend graph and data table.
- Insight list and insufficient-data states.
- Coordinator student/cohort performance views.
- Recommendation and announcement feeds.
- Admin compose/list interfaces.

Exit criteria: released data renders accurately and graph values match API fixtures.

### Phase F6 - Parent experience and messaging (Week 14)

- Parent student selector and overview.
- Parent performance and recommendation views.
- Message inbox, detail, new-message form, reply, and status changes.
- Admin message equivalent.

Exit criteria: parent access remains scoped to linked students, and reply behavior does not resemble or require real-time chat.

### Phase F7 - Hardening and pilot readiness (Weeks 15-17)

- Cross-browser and responsive testing.
- Keyboard, screen-reader, contrast, zoom, and reduced-motion checks.
- Performance profiling and bundle reduction.
- Visual regression stabilization.
- Error monitoring and analytics events.
- Pilot content seeding, usability testing, and issue resolution.

Exit criteria: zero critical accessibility, authorization-display, data accuracy, or workflow-blocking defects.

## 20. Frontend backlog priority

### P0 - Required for pilot

- Role shells and protected routing.
- Authentication/onboarding states.
- Program creation, approval, public listing, and registration.
- Student roster and evaluator assignment UI.
- Student Performance Sheet.
- Result release view.
- Performance graph and insights.
- Recommendations and announcements.
- Parent linking views and message/reply UI.
- Responsive and accessible primary flows.

### P1 - Important after pilot validation

- Richer cohort comparison.
- Bulk coordinator actions.
- Saved filters.
- CSV import/export progress UI.
- Notification preferences.
- More refined offline/interrupted submission recovery.

### P2 - Deferred

- Native mobile applications.
- Real-time chat.
- Highly animated dashboards.
- Gamification and leaderboards.
- General-purpose drag-and-drop builders.
- AI chatbot or generative coaching interface.

## 21. Frontend analytics events

Track only privacy-safe product events:

- Onboarding step completed or abandoned.
- Program draft created and submitted.
- Registration started and completed.
- Evaluation opened, draft saved, validation failed, and submitted.
- Performance filter used.
- Recommendation viewed and completed.
- Announcement opened.
- Parent link completed.
- Message created, replied, and closed.

Do not send message bodies, remarks, scores, dates of birth, national IDs, student names, or other private content to analytics.

## 22. Required frontend decisions

1. Confirm the brand typeface, accent color, and final logo assets.
2. Decide whether Tailwind or CSS Modules is the team standard.
3. Confirm the supported browser versions and minimum mobile width.
4. Decide whether one account can switch between multiple roles.
5. Finalize program-builder fields for every event type.
6. Finalize the scoring scale and rubric labels before building score inputs and charts.
7. Confirm whether evaluators commonly use tablets, laptops, or phones during sessions.
8. Confirm the exact parent-linking and consent screens.
9. Choose the chart library after testing accessibility and bundle size.
10. Confirm whether results require an admin release screen or coordinator release permission.

## 23. Frontend definition of done

A frontend feature is complete when:

- Its normal, loading, empty, error, permission, and responsive states exist.
- It consumes typed API data and handles expected error categories.
- Form validation and mutation recovery work without losing input.
- Keyboard navigation, focus behavior, labels, contrast, and screen-reader output pass review.
- Component/integration tests cover the core behavior.
- Critical paths have Playwright coverage.
- Visual regression snapshots cover representative states.
- Analytics contain no sensitive content.
- The product owner verifies the wording and workflow.
- The page follows ElevateMe's flat, minimal visual system without unnecessary cards or decoration.

## 24. Final frontend outcome

The frontend is ready for MVP when a coordinator can create and submit a program, an administrator can approve and publish it, a student can register, an evaluator can complete and submit the ten-criterion sheet on tablet, a reviewer can release the result, and the student and linked parent can understand the resulting performance and recommendations across supported screen sizes.

---

This frontend plan complements the broader *ElevateMe App - Detailed Project Plan* and preserves the established product direction: flat UI, editorial hierarchy, a two-section Performance page, announcement-style recommendations, and basic message-and-reply parent communication.
