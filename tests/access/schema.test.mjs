import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, seed, ids } from './database.mjs';

test('forward migrations and privacy/privilege boundaries', async () => {
  const db = await database();
  try {
    await seed(db);
    const names = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='published_evaluations'")).rows.map((r) => r.column_name);
    for (const key of ['evaluator_id', 'recommendation_for_di', 'evaluator_email']) assert(!names.includes(key));
    await db.exec(`GRANT SELECT ON public.evaluations,public.profiles,public.evaluation_scores,public.programs,public.program_evaluators TO authenticated;
      INSERT INTO public.evaluations(id,slug,student_id,program_id,session_id,evaluator_id,state,released,released_at,remarks,recommendation_for_di)
      VALUES ('40000000-0000-0000-0000-000000000001','historic','${ids.student}','${ids.program}','${ids.session}','${ids.admin}','Locked',true,now(),'Student feedback','PRIVATE NOTE');
      SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids.student}',false);`);
    assert.equal((await db.query('SELECT * FROM public.evaluations')).rows.length, 0);
    const visible = (await db.query('SELECT * FROM public.published_evaluations')).rows;
    assert.equal(visible.length, 1); assert(!JSON.stringify(visible).includes('PRIVATE NOTE'));
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.other}',false)`);
    assert.equal((await db.query('SELECT * FROM public.published_evaluations')).rows.length, 0);
    await assert.rejects(db.query('SELECT * FROM evaluator_private.invitations'), /permission denied/);
    await assert.rejects(db.query(`SELECT public.release_evaluations('${ids.session}')`), /permission denied/);
    await db.exec(`RESET ROLE;
      INSERT INTO public.programs(id,slug,title,category,status,capacity,created_by)
      VALUES ('20000000-0000-0000-0000-000000000099','retired-draft','Retired draft','SingleEvent','Draft',100,'${ids.retired}');
      INSERT INTO public.program_evaluators(program_id,session_id,evaluator_id)
      VALUES ('${ids.program}','${ids.session}','${ids.retired}');
      SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ids.retired}',false);`);
    assert.equal((await db.query(`SELECT id FROM public.programs WHERE id='20000000-0000-0000-0000-000000000099'`)).rows.length, 0);
    assert.equal((await db.query(`SELECT id FROM public.profiles WHERE id='${ids.student}'`)).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM public.program_evaluators')).rows.length, 0);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.retired}',false)`);
    assert.equal((await db.query("SELECT public.has_role('coordinator') AS allowed")).rows[0].allowed, false);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${ids.admin}',false)`);
    await assert.rejects(db.query(`SELECT public.set_profile_roles('${ids.other}', ARRAY['evaluator'], 'evaluator')`), /retired/);
    await db.exec('RESET ROLE');
    await db.exec(`INSERT INTO public.profiles(id,email,full_name,status,roles,active_role)
      VALUES ('50000000-0000-0000-0000-000000000001','legacy-staff@example.test','Legacy Staff','Approved',ARRAY['coordinator'],'coordinator');
      INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES ('50000000-0000-0000-0000-000000000002','legacy-staff@example.test','{"requested_role":"student"}');`);
    const adopted = (await db.query("SELECT roles,active_role FROM public.profiles WHERE email='legacy-staff@example.test'")).rows[0];
    assert.deepEqual(adopted.roles, ['student']); assert.equal(adopted.active_role, 'student');
    await assert.rejects(db.exec(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(gen_random_uuid(),'attacker@example.test','{"requested_role":"admin"}')`), /invitation/);
    console.log('Verified: migration, private schema, safe projection, ownership, retired role, release bypass and admin signup denial');
  } finally { await db.close(); }
});
