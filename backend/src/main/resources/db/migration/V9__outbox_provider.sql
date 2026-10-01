-- ============================================================================
-- ElevateMe Flyway V9 — outbox provider message id + alert resolve doc
-- Postgres 14 compatible. Idempotent.
--
-- * app.outbox_events.provider_message_id: nullable provider-side message id
--   (mail/notification transport receipt). NULL until the relay worker
--   publishes; never part of dedupe (dedupe_key UNIQUE stays authoritative).
-- * Documents the Phase 4 alert rule: alert strictly < 30 (30 does NOT alert,
--   29 does); resolve >= 30 per spec §6 (30+ resolves) + docs/INSIGHTS.md.
-- ============================================================================

-- Outbox provider receipt (idempotent add).
ALTER TABLE app.outbox_events
  ADD COLUMN IF NOT EXISTS provider_message_id text NULL;

COMMENT ON COLUMN app.outbox_events.provider_message_id IS
  'Provider-side message id after relay publish (mail/notification receipt). NULL until SENT; never part of dedupe.';

-- Resolve-threshold documentation on the alert table (spec §6: 30+ resolves).
COMMENT ON TABLE app.criterion_alerts IS
  'Low-score watchlist: alert strictly score < threshold (default 30; 30 does NOT alert, 29 does); resolve on later released score >= 30 per spec section 6. One ACTIVE row per (student, criterion) WHERE resolved_at IS NULL.';
