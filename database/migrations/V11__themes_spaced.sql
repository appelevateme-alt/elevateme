-- ============================================================================
-- ElevateMe Flyway V11 — programs themes spaced canonical
-- Postgres 14 compatible. Idempotent. Depends on V2 (programs) + V6 (Phase2).
--
-- Root cause (E1): V6 programs_themes_phase2_check ARRAY lacked the spaced
-- canonical 'Public Speaking' while the backend stores the spaced canonical
-- (ProgramsService.normalizeTheme: "PublicSpeaking" alias => "Public Speaking",
-- ALLOWED_THEMES = {"Public Speaking","Communication","Negotiation","Leadership"}).
-- Every Public Speaking create/seed therefore violated the CHECK.
--
-- Fix: widen the CHECK to accept BOTH spaced + unspaced variants, keeping all
-- legacy seed values. Existing rows pass (superset only widens V6).
-- Allowed set: diplomacy | debate | model-un (legacy seed_dev) +
--   PublicSpeaking + Public Speaking (unspaced alias + spaced canonical) +
--   Communication | Negotiation | Leadership.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS app;

-- Drop the narrow V6 CHECK (no-op when already migrated).
ALTER TABLE IF EXISTS app.programs DROP CONSTRAINT IF EXISTS programs_themes_phase2_check;

-- Re-add the widened CHECK (guarded so re-runs are no-ops).
DO $$
BEGIN
  IF to_regclass('app.programs') IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'programs_themes_phase2_check'
                   AND conrelid = 'app.programs'::regclass) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_themes_phase2_check
      CHECK (themes <@ ARRAY['diplomacy', 'debate', 'model-un',
                             'PublicSpeaking', 'Public Speaking',
                             'Communication', 'Negotiation', 'Leadership']::text[]);
  END IF;
END
$$;

COMMENT ON CONSTRAINT programs_themes_phase2_check ON app.programs IS
  'V11: subset of diplomacy|debate|model-un + PublicSpeaking|Public Speaking|Communication|Negotiation|Leadership. Backend stores spaced canonical (normalizeTheme); unspaced kept for backward compat.';
