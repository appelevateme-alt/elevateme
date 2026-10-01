-- ============================================================================
-- ElevateMe Flyway V7 — programs Phase 2 (window end, registration open,
-- location, eligibility)
-- Postgres 14 compatible. Depends on V2 (programs) + V6 (Phase 2 checks).
--
-- Adds the remaining teacher-workspace columns accepted by POST/PATCH
-- /api/v1/programs: ends_at, registration_opens_at, location, eligibility
-- (V6 already added starts_at + registration_deadline + business version).
-- Idempotent (IF NOT EXISTS + duplicate_object guards).
-- ============================================================================

ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS ends_at timestamptz NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS location text NULL;
ALTER TABLE app.programs ADD COLUMN IF NOT EXISTS eligibility text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_dates_phase2_check' AND conrelid = 'app.programs'::regclass
  ) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_dates_phase2_check
      CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'programs_reg_window_phase2_check' AND conrelid = 'app.programs'::regclass
  ) THEN
    ALTER TABLE app.programs ADD CONSTRAINT programs_reg_window_phase2_check
      CHECK (registration_deadline IS NULL OR registration_opens_at IS NULL
        OR registration_deadline >= registration_opens_at);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS programs_reg_opens_idx ON app.programs (registration_opens_at);
