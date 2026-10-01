# OUTBOX — relay, retry, and delivery ambiguity (Phase 6)

Same-transaction outbox (`app.outbox_events`, V4) + provider receipt (V9
`provider_message_id`) + admin triage (`GET /admin/outbox?state=FAILED`).
No real strings in this file.

## Relay

- Writers call `OutboxService.emit(...)` inside the same `@Transactional`
  business method as the domain write (dedupe_key explicit, `ON CONFLICT DO NOTHING`).
- `OutboxWorker.poll()` (every `${app.outbox.poll-ms:5000}`) claims oldest due
  `PENDING` rows (`next_retry_at <= now()`, `FOR UPDATE SKIP LOCKED`, batch
  `${app.outbox.batch-size:20}`) and calls `publishOne(row)`.
- Success marks `email_state='SENT'`, `sent_at=now()`, plus
  `provider_message_id` (transport receipt). Pre-V9 DBs fall back to the
  legacy SENT update so the relay never wedges.

## Retry (bounded exponential backoff)

- `backoffSeconds(retryCount) = min(30 * 2^retryCount, 3600)`:
  30s, 60s, 120s, … capped at 1h.
- Failure increments `retry_count` and sets
  `next_retry_at = now() + backoff`. Row stays `PENDING`.
- After `${app.outbox.max-attempts:10}` attempts the row is marked `FAILED`
  (poison-pill, never deleted, never silently retried) and logged
  (`outbox poison-pill FAILED id=…`). Operators triage via
  `GET /admin/outbox?state=FAILED` (also `?state=PENDING|SENT|SKIPPED`).

## Retry-delivery ambiguity (rare, by design safe)

The transport may succeed while the follow-up `SENT` update fails
(process kill, DB failover, deploy restart between publish and mark-sent).
The next poll then redelivers the same event (at-least-once).

This is safe because publishing is idempotent:

- `dedupe_key UNIQUE` + per-recipient notification UNIQUE collapse replays.
- Alert updates never send a duplicate email (evidence-only refresh).
- The stored `provider_message_id` lets operators reconcile a suspected
  duplicate against the provider (same receipt = same delivery).
- Consumers MUST remain idempotent and MUST NOT treat a retry as a new event.

## Operator notes

- `FAILED` rows are history + alert queue: investigate, then re-emit a new
  event with a new dedupe_key if a resend is warranted — never mutate history.
- Payloads are ids-only (no PII message text); audit rows carry
  (actor, action, entity, requestId).
- Migration: `database/migrations/V9__outbox_provider.sql` adds
  `provider_message_id` idempotently (`ADD COLUMN IF NOT EXISTS`).
