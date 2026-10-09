import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { database, seed, ids } from './database.mjs';

test('restricted Java role can read recipients and lock sessions without public UPDATE', async () => {
  const db = await database();
  try {
    await seed(db);
    await db.exec(`INSERT INTO public.parent_links(parent_id,student_id,status)
      VALUES ('${ids.other}','${ids.student}','Approved'); SET ROLE elevateme_access;`);
    assert.equal((await db.query('SELECT * FROM public.parent_links')).rows.length, 1);
    await assert.rejects(db.query(`SELECT id FROM public.sessions WHERE id='${ids.session}' FOR UPDATE`), /permission denied/);
    await db.exec('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [ids.session]);
    assert.equal((await db.query('SELECT id FROM public.sessions WHERE id=$1', [ids.session])).rows.length, 1);
    await db.exec('ROLLBACK');
  } finally { await db.close(); }
});

test('parent cannot self-approve or transfer consent to another student', async () => {
  const db = await database();
  try {
    await seed(db);
    await db.exec(`UPDATE public.profiles SET roles=ARRAY['parent'],active_role='parent' WHERE id='${ids.other}';
      GRANT SELECT,INSERT,UPDATE ON public.parent_links TO authenticated;
      SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids.other}',false);`);
    await assert.rejects(db.exec(`INSERT INTO public.parent_links(parent_id,student_id,status)
      VALUES ('${ids.other}','${ids.student}','Approved')`), /row-level security/);
    await db.exec(`INSERT INTO public.parent_links(parent_id,student_id,status)
      VALUES ('${ids.other}','${ids.student}','Pending')`);
    await assert.rejects(db.exec("UPDATE public.parent_links SET status='Verified'"), /row-level security/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.student}',false);
      UPDATE public.parent_links SET status='Approved';`);
    assert.equal((await db.query('SELECT status FROM public.parent_links')).rows[0].status, 'Approved');
    await assert.rejects(db.exec(`UPDATE public.parent_links SET student_id='${ids.admin}'`), /participants cannot be changed/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.other}',false);
      UPDATE public.parent_links SET status='Revoked';`);
    assert.equal((await db.query('SELECT status FROM public.parent_links')).rows[0].status, 'Revoked');
  } finally { await db.close(); }
});

test('published repository SQL runs through release under the runtime role', async () => {
  const db = await database();
  try {
    await seed(db);
    const code = await readFile('backend/src/main/java/com/diplomaticimpact/access/AccessRepository.java', 'utf8');
    // Execute the actual Java SQL, not a separate approximation of it.
    const extract = (prefix) => {
      const sql = [...code.matchAll(/db\.update\("([^"\n]+)"/g)].map(m => m[1]).find(s => s.startsWith(prefix));
      assert.ok(sql, `SQL not found: ${prefix}`);
      let n = 0; return sql.replaceAll('?', () => `$${++n}`);
    };
    const id = '60000000-0000-0000-0000-000000000001';
    await db.exec('SET ROLE elevateme_access; BEGIN');
    await db.query(extract('INSERT INTO public.evaluations'), [id, `access-${id}`, ids.student, 'Feedback', ids.session]);
    await db.query(extract('INSERT INTO public.evaluation_scores'), [id, 'clarity', 83]);
    await db.exec('COMMIT');
    assert.equal((await db.query('SELECT released FROM public.evaluations WHERE id=$1',[id])).rows[0].released, true);
    assert.equal((await db.query('SELECT score FROM public.evaluation_scores WHERE evaluation_id=$1',[id])).rows.length, 1);
  } finally { await db.close(); }
});

test('logout expires the stored session even if an old cookie is replayed', async () => {
  const db = await database();
  try {
    await seed(db);
    const invite = '70000000-0000-0000-0000-000000000001';
    await db.exec(`INSERT INTO evaluator_private.invitations(id,session_id,evaluator_name,evaluator_email,token_hash,created_by)
      VALUES ('${invite}','${ids.session}','Test','test@example.test','invite-hash','${ids.admin}');
      INSERT INTO evaluator_private.sessions(id,invitation_id,token_hash,expires_at)
      VALUES (gen_random_uuid(),'${invite}','cookie-hash',clock_timestamp()+interval '1 hour');
      SET ROLE elevateme_access;`);
    const code = await readFile('backend/src/main/java/com/diplomaticimpact/access/AccessRepository.java', 'utf8');
    const sql = code.match(/void endSession[^\n]+db\.update\("([^"]+)"/)[1].replace('?', '$1');
    await db.query(sql, ['cookie-hash']);
    const result = await db.query("SELECT count(*) AS n FROM evaluator_private.sessions WHERE token_hash='cookie-hash' AND expires_at>clock_timestamp()");
    assert.equal(Number(result.rows[0].n), 0);
  } finally { await db.close(); }
});
