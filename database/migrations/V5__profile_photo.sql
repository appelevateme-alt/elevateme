-- ============================================================================
-- ElevateMe Flyway V5 — profile private photo key (Phase 1b)
-- Postgres 14 compatible. Depends on V1 (app.profiles).
--
-- Idempotent: safe to apply whether or not the V1 Phase 1b patch note ran.
-- Stores the PRIVATE Supabase Storage object path
-- (profiles/{profileId}/{uuid}.{jpg|png|webp}) in app.profiles.photo_key.
-- Never a public URL — reads go through short-lived signed URLs (300s).
-- Parent-view preference needs no new column: V1 already has
-- parent_view_mode ('ALL' | 'SINGLE') + parent_default_student_id.
-- ============================================================================

ALTER TABLE app.profiles ADD COLUMN IF NOT EXISTS photo_key text NULL;
