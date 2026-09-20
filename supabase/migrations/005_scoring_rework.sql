-- ============================================================================
-- ElevateMe migration 005 — scoring rework (1000-point model)
-- 10 criteria x 0-100 each. Sheet total out of 1000; final score = total / 10,
-- out of 100 (e.g. 800/1000 scales to 80/100). No baseline, no level bands.
--
-- Replaces evaluation_scores.level / .points with evaluation_scores.score.
-- Old level-based rows have no meaning under the new model and are removed;
-- re-run supabase/seed.sql afterwards to restore the e-1 demo sheet.
-- Idempotent: safe to run more than once.
-- ============================================================================

-- Old level-based demo rows cannot convert; the seed restores them.
DELETE FROM public.evaluation_scores;

ALTER TABLE public.evaluation_scores
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS points;

ALTER TABLE public.evaluation_scores
  ADD COLUMN IF NOT EXISTS score numeric(5,2) NOT NULL DEFAULT 0
    CHECK (score >= 0 AND score <= 100);

-- Bring the active rubric's scale description in line with the new model.
UPDATE public.evaluation_templates
SET scale_map = '{"max_per_criterion":100,"criteria_count":10,"max_total":1000,"scaled_max":100}'::jsonb
WHERE version = 'v1';
