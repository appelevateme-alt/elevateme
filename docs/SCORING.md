# SCORING — Section 5 (frozen, normative)

## 5.1 Criteria (10, in order — keys + labels fixed)

| # | key | label |
|---|---|---|
| 1 | `preparation` | Preparation |
| 2 | `clarity` | Clarity |
| 3 | `confidence` | Confidence |
| 4 | `focus` | Focus |
| 5 | `critical_analysis` | Critical Analysis |
| 6 | `sound` | Sound (NOT Vocal Delivery) |
| 7 | `audience_addressing` | Audience Addressing |
| 8 | `counter_arguments` | Counter Arguments |
| 9 | `wit` | Wit |
| 10 | `overall_performance` | Overall Performance |

Label `Sound` MUST NOT be renamed to Vocal Delivery. Key `sound` is frozen.

## 5.2 Rules

- Each score: integer 0–100 inclusive (CHECK). Blank (missing row) != zero; missing = unscored, excluded from completeness checks, never coerced to 0.
- Sheet total = sum of the 10 criterion scores, range 0–1000.
- Normalized score = total / 10, range 0–100. Display as integer when whole, else one decimal (no rounding in stored value).
- History order: chronological by session `starts_at` ASC, tie-break by evaluation ID ASC.
- baseline = first released score in history. best = max released score. gain = best − baseline (minimum naturally 0 because baseline is included in best).
- Distinct programs = count via attendance (registrations/confirmed presence) only, never via evaluation count.
- Correction / void: any score edit or sheet void MUST recalc total, normalized, baseline, best, gain, and insights from scratch. History preserved (no deletion of audit trail).
- Draft or unreleased (`released=false`) sheets NEVER affect summary, baseline, best, gain, or insights.

## 5.3 Golden example (must pass)

Totals 600 → 830 → 760 give normalized history `60, 83, 76`, best `83`, gain `+23`, full history preserved. See `tests/fixtures/scoring.json`.
