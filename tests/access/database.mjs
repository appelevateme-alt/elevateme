import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

export async function database() {
  const db = await PGlite.create();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;`);
  for (const name of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    // PostgreSQL's built-in gen_random_uuid is present in PGlite; pgcrypto packaging differs.
    const sql = (await readFile(`supabase/migrations/${name}`, 'utf8')).replace(/CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?;/gi, '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${name}: ${e.message}`); }
  }
  return db;
}

export const ids = {
  admin: '10000000-0000-0000-0000-000000000001', student: '10000000-0000-0000-0000-000000000002',
  other: '10000000-0000-0000-0000-000000000003', retired: '10000000-0000-0000-0000-000000000004',
  program: '20000000-0000-0000-0000-000000000001', session: '30000000-0000-0000-0000-000000000001',
};
export async function seed(db) {
  await db.exec(`INSERT INTO public.profiles(id,email,full_name,status,roles,active_role) VALUES
    ('${ids.admin}','admin@example.test','DI Test Admin','Approved',ARRAY['admin'],'admin'),
    ('${ids.student}','student@example.test','Test Student','Approved',ARRAY['student'],'student'),
    ('${ids.other}','other@example.test','Other Student','Approved',ARRAY['student'],'student'),
    ('${ids.retired}','retired@example.test','Retired Staff','Approved',ARRAY['coordinator'],'coordinator');
    INSERT INTO public.programs(id,slug,title,category,status,capacity,created_by) VALUES
    ('${ids.program}','test-program','Speaking Workshop','SingleEvent','Published',100,'${ids.admin}');
    INSERT INTO public.sessions(id,slug,program_id,title,date) VALUES
    ('${ids.session}','test-session','${ids.program}','Session One','2026-10-05');
    INSERT INTO public.registrations(student_id,program_id,session_id,status) VALUES
    ('${ids.student}','${ids.program}','${ids.session}','Confirmed');`);
}
