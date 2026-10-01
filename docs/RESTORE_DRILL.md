# RESTORE DRILL — ElevateMe (Phase 6 release quality)

No real connection strings, passwords, hosts, or tokens in this file.
Use placeholder env vars (`$PGHOST`, `$PGUSER`, `$PGDATABASE`, `$BACKUP_DIR`)
and a non-production restore target. Run the drill against staging-like data
only, never production PII.

## 1. Backup (pg_dump)

```bash
# Custom-format nightly backup (schema + data). RPO anchor: last successful dump.
export PGHOST="<db-host-placeholder>"
export PGUSER="<db-user-placeholder>"
export PGDATABASE="<db-name-placeholder>"
export BACKUP_DIR="<backup-dir-placeholder>"
export BACKUP_FILE="$BACKUP_DIR/elevateme-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump --format=custom --compress=9 --file="$BACKUP_FILE" \
  --host="$PGHOST" --username="$PGUSER" --dbname="$PGDATABASE"

# Verify the dump header (no restore yet):
pg_restore --list "$BACKUP_FILE" | head -n 20
ls -lh "$BACKUP_FILE"
```

Expected: exit 0, non-empty `$BACKUP_FILE`, `pg_restore --list` shows
`app.*` tables including `app.outbox_events` (V4 + V9 `provider_message_id`)
and `app.criterion_alerts`.

## 2. Restore (pg_restore, isolated target)

```bash
# Restore into an EMPTY scratch database (never the live DB).
export RESTORE_DB="<restore-db-name-placeholder>"

createdb --host="$PGHOST" --username="$PGUSER" "$RESTORE_DB"

pg_restore --clean --if-exists --no-owner \
  --host="$PGHOST" --username="$PGUSER" --dbname="$RESTORE_DB" \
  "$BACKUP_FILE"

# Sanity checks (counts only, no PII dump):
psql --host="$PGHOST" --username="$PGUSER" --dbname="$RESTORE_DB" \
  -c "SELECT count(*) FROM app.programs;"
psql --host="$PGHOST" --username="$PGUSER" --dbname="$RESTORE_DB" \
  -c "SELECT email_state, count(*) FROM app.outbox_events GROUP BY 1;"
```

Pass criteria: restore exit 0, table counts match the source inventory taken
at backup time, `app.outbox_events.provider_message_id` column exists
(V9 check: `\d app.outbox_events`), app boots read-only against the scratch
DB behind `app_runtime` (least-privilege, no DDL).

## 3. RPO / RTO notes

- RPO: last successful `pg_dump` (nightly custom-format + WAL where enabled).
  Outbox `PENDING` rows at backup time are redelivered after restore (at-least-once;
  see `docs/OUTBOX.md` retry-delivery ambiguity) — dedupe_key collapses replays.
- RTO: restore + verify + promote target. Drill target is operator-timed;
  record wall-clock per run in the pilot log (see `docs/PILOT.md`).
- Never delete FAILED outbox history during restore triage — history is audit.
  Triage via `GET /admin/outbox?state=FAILED` after cutover.

## 4. Invitation-revocation runbook link

Guest invitation revocation is immediate (no grace window) and must be
exercised post-restore:

- Runbook: `tests/e2e/full-scenario.md` § Acceptance 7 (revoke → replay 401)
  plus `GuestScopeTest.revocationIsImmediate_replayFails401`.
- Post-restore check: revoke one placeholder invitation on the scratch DB,
  confirm the old fragment/session returns 401 and unrelated sessions stay 404.
- If revocation rows are missing after restore, halt promotion — the backup
  is incomplete.

## 5. Drill exit checklist

- [ ] `pg_dump` exit 0 + `pg_restore --list` non-empty
- [ ] Scratch restore exit 0 + counts match source inventory
- [ ] `provider_message_id` column present (V9)
- [ ] App boots read-only on scratch DB as `app_runtime`
- [ ] Invitation revoke → 401 replay verified on scratch DB
- [ ] Wall-clock + issues logged (no real strings pasted)
