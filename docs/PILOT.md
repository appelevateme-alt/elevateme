# PILOT — Phase 6 (1 MUN + 1 multi-session speaking)

No real names, emails, IDs, or secrets in this file. Use `example.test`
domains and placeholder IDs only. Run in a non-production project.

## 1. Scope (spec §17: two contrasting workflows)

- Pilot A — one Model United Nations event (committees + country allocation,
  one evaluation round).
- Pilot B — one continuous Academic Speaking program (≥3 sessions per student,
  longitudinal scores → trends + insights).

This tests event-based + longitudinal behavior, the shared program/session/
registration/evaluation model, and repeated-score trend validity.

## 2. Steps (create → payment)

1. Create: coordinator creates a DRAFT program (MUN with committees/countries;
   Speaking with ≥3 sessions) → submits (`POST /programs/{id}/submit`).
2. Approve: admin approves (`POST /programs/{id}/approve {"decision":"APPROVED"}`)
   → publishes (`POST /programs/{id}/publish`). Teacher publish stays 403.
3. Register: student registers (committee/country/session); coordinator confirms.
   Duplicate/capacity → 409. Non-assigned development reads stay 404.
4. Roster: staff opens session roster (server search + pagination, 20/page);
   pending staff sees 403 `ACCOUNT_PENDING` with zero roster bytes.
5. Evaluate: assigned evaluator (or token-scoped guest) saves draft (autosave
   1s, revision-guarded) → submits (10/10 integers 0–100, blank ≠ zero).
   Submitted sheets lock.
6. Release: staff previews (`?dryRun=true`: submitted/expected/excluded) →
   releases (`POST /sessions/{id}/release-reports` + Idempotency-Key).
   Repeat same key → same response (no dup). Guests get 403. Absent stays
   excluded with reason (never zero).
7. Insights: student opens `/app/performance` (released-only chronological,
   same-day separate) + `/app/insights` (deterministic low/decline/best/
   improved/strengths, Top5 + Expand, Based-on scope). `<2` evals → no trends.
   Alert strictly `<30` (30 does NOT alert); later `≥30` resolves.
8. Recommend: admin previews audience (`POST /admin/audiences/preview`,
   missing scores never zero) → publishes (`POST /admin/recommendations`,
   frozen snapshot, dedupe, max 3 pins). Teacher publish → 403. Student marks
   own recipient Viewed/Completed (cross-student → 404).
9. Query: student opens query (`POST /queries` + Idempotency-Key), DI replies
   (versioned, never silent rewrite), follow-ups full-width, close/reopen.
   Other-student threads → 404.
10. Payment (Pilot B paid track or dev event): student registers PAID →
    `AWAITING_PAYMENT_VERIFICATION` + external https link + 48h/deadline hold
    (displayed upfront). "I have paid" submits reference (stays PENDING, never
    confirms). Admin verifies (`VERIFIED` confirms + admin + time; `REJECTED`
    needs reason). `EXPIRED` stays open for late manual review.

E2E script: `tests/e2e/full-scenario.md` (acceptance 1–18, curl + UI steps).

## 3. Success criteria (spec §14 pilot targets + §18 definition of done)

Entry gate: spec §16 decisions resolved before pilot (web-only + evaluator
device, consent for under-18, numeric rubric + "Sound" meaning, release owner,
registration confirm mode, parent remark visibility, national-ID retention,
multi-role policy, three mandatory pilot reports).

Exit (all must hold):

- 95% of assigned evaluations submitted successfully.
- Zero cross-student data exposure (B→A reads 404, indistinguishable from random id).
- Evaluator completes one sheet in under two minutes after training.
- ≥80% of pilot students find their latest result without assistance.
- Zero critical defects (security, data-loss, permission, score-calculation
  block release per §13).
- Restore drill verified (`docs/RESTORE_DRILL.md` checklist green).
- Every sensitive action permission-checked + audited (actor, action, entity,
  requestId, no PII).

## 4. Training + ops notes

- Evaluators: rubric guidance per criterion, draft autosave, revision-conflict
  refresh-then-retry, Next-student flow preserves drafts.
- Coordinators: roster search/pagination, attendance toggle, release preview
  counts before confirm, idempotency-key repeat-safe retries.
- Admins: approval queue, audience preview before publish, payment queue
  (`GET /admin/payments?state=PENDING`), outbox triage
  (`GET /admin/outbox?state=FAILED`), audit log review.
- Support: collect issues by severity; permission/score defects are launch blockers.
