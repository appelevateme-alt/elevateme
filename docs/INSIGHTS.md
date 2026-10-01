# INSIGHTS — Section 6 (frozen, normative)

Rules apply to released evaluations only. Draft/unreleased never generates alerts or trends.

| Rule | Frozen value |
|---|---|
| Low-score alert threshold | Strictly `< 30` flags. Score of exactly `30` does NOT alert. |
| Tie handling | Tie = matched (no false rank change; tied criteria share the alert/copy path, never double-count). |
| Trend minimum | `2+` released evals required for any decline/improvement trend. Single eval → strengths/low only, no trend. |
| Display order | `low, decline, best, improvement, strengths` (fixed). |
| List cap | Top 5 + Expand (first 5 shown, full list behind Expand). |
| Attribution label | Every insight shows `Based on <label>` with the criterion label from SCORING.md. |
| Alert dedupe | One active alert per student/criterion. Re-running MUST NOT duplicate. |
| Resolve threshold | New released score `>= 30` on that criterion resolves the alert (spec §6: 30+ resolves; 29 stays active). |
| Backdated non-override | A backdated low score (e.g. `20` with earlier `starts_at`) does NOT override/resolve/reopen current active or resolved state; chronological recalc keeps current-state semantics. |

Order of evaluation per run: compute low alerts → decline → best → improvement → strengths, then cap to Top5+Expand for display only (storage keeps all).
