import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, seed, ids } from './database.mjs';

test('invitation redemption is single-use and database-clock bounded', async () => {
  const db = await database();
  try {
    await seed(db);
    const invitation = '50000000-0000-0000-0000-000000000001';
    await db.exec(`INSERT INTO evaluator_private.invitations
      (id,session_id,evaluator_name,evaluator_email,token_hash,created_by,created_at,expires_at)
      VALUES ('${invitation}','${ids.session}','Test Evaluator','evaluator@example.test','one-use-hash','${ids.admin}',clock_timestamp(),clock_timestamp()+interval '24 hours');`);

    const first = await db.query(`UPDATE evaluator_private.invitations
      SET consumed_at=clock_timestamp()
      WHERE token_hash='one-use-hash' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()
      RETURNING id`);
    const second = await db.query(`UPDATE evaluator_private.invitations
      SET consumed_at=clock_timestamp()
      WHERE token_hash='one-use-hash' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()
      RETURNING id`);
    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 0);

    await db.exec(`INSERT INTO evaluator_private.invitations
      (id,session_id,evaluator_name,evaluator_email,token_hash,created_by,created_at,expires_at)
      VALUES ('50000000-0000-0000-0000-000000000002','${ids.session}','Expired Evaluator','expired@example.test','expired-hash','${ids.admin}',clock_timestamp()-interval '25 hours',clock_timestamp()-interval '1 hour');`);
    const expired = await db.query(`UPDATE evaluator_private.invitations
      SET consumed_at=clock_timestamp()
      WHERE token_hash='expired-hash' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()
      RETURNING id`);
    assert.equal(expired.rows.length, 0);
  } finally { await db.close(); }
});
