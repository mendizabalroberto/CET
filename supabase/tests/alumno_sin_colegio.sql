-- alumno_sin_colegio.sql — pgTAP de 0066 y 0067
-- Cambridge Exam Trainer · © 2026 Roberto Mendizabal.
begin;
select plan(10);

select col_is_null('public', 'students', 'school_id',
  'un alumno puede no tener colegio');

-- OJO CON `pin_hash`: `students_pin_hash_is_argon2id` exige que empiece por
-- `$argon2id$`. Sembrar 'x' hace que el INSERT muera con 23514, y como pgTAP
-- aborta al primer error de SQL, TODOS los asserts posteriores quedan
-- enmascarados: el fichero parece una prueba y no prueba nada. El valor de
-- abajo es el hash señuelo de `auth-pin`, que tiene el formato correcto y no
-- corresponde a ningún PIN.
insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333331', 's.hijo1@familia.cet.invalid'),
  ('33333333-3333-3333-3333-333333333332', 's.hijo2@familia.cet.invalid');
insert into public.profiles (id, school_id, role, full_name, status) values
  ('33333333-3333-3333-3333-333333333331', null, 'student', 'Hijo Uno', 'active'),
  ('33333333-3333-3333-3333-333333333332', null, 'student', 'Hijo Dos', 'active');

insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
values ('33333333-3333-3333-3333-333333333331', null, 'FAM-0001', 6, 'primary', '$argon2id$v=19$m=19456,t=2,p=1$ZGVjb3lkZWNveWRlY295ZA$3aMPu3Q1u5oQpXk0Wm7Xr0nJZ8sVQe0h1sK9d2tXqYo');

-- En Postgres dos NULL son distintos, asi que `unique (school_id, code)` NO
-- basta: sin el indice parcial, esto entraria.
select throws_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
    values ('33333333-3333-3333-3333-333333333332', null, 'FAM-0001', 6, 'primary', '$argon2id$v=19$m=19456,t=2,p=1$ZGVjb3lkZWNveWRlY295ZA$3aMPu3Q1u5oQpXk0Wm7Xr0nJZ8sVQe0h1sK9d2tXqYo')$$,
  '23505', null,
  'dos alumnos sin colegio no comparten codigo');

select lives_ok(
  $$insert into public.students (profile_id, school_id, student_code, year_level, stage, pin_hash)
    values ('33333333-3333-3333-3333-333333333332', null, 'FAM-0002', 6, 'primary', '$argon2id$v=19$m=19456,t=2,p=1$ZGVjb3lkZWNveWRlY295ZA$3aMPu3Q1u5oQpXk0Wm7Xr0nJZ8sVQe0h1sK9d2tXqYo')$$,
  'con codigos distintos, si');

select col_is_null('public', 'learning_events', 'school_id',
  'un evento puede no tener colegio');

select has_function('app', 'colegio_del_evento', array['uuid'],
  'existe el resolutor de colegio del evento');

-- Este fichero no incluye el fixture compartido (helpers/fixture.psql), asi
-- que `public.schools` puede estar vacia. `select id from public.schools
-- limit 1` devolveria entonces NULL, un tutor con school_id NULL cumple la
-- constraint, y el throws_ok de abajo fallaria por una razon ajena a lo que se
-- quiere probar. Se siembra aqui un colegio real para que el 23514 lo dispare
-- la constraint, no un fixture ausente.
insert into public.schools (id, name, slug)
values ('44444444-4444-4444-4444-444444444441', 'Colegio De Prueba', 'colegio-de-prueba-asc');

select throws_ok(
  $$insert into auth.users (id, email) values ('33333333-3333-3333-3333-33333333333a','t@x.com');
    insert into public.profiles (id, school_id, role, full_name, email, status)
    values ('33333333-3333-3333-3333-33333333333a',
            '44444444-4444-4444-4444-444444444441', 'guardian', 'Tutor Con Colegio',
            't@x.com', 'active')$$,
  '23514', null,
  'un tutor no pertenece a un colegio');

select is(
  (select app.colegio_del_evento('33333333-3333-3333-3333-333333333331')),
  null,
  'un alumno sin membresia activa no aporta colegio a su evento');

-- ---------------------------------------------------------------------------
-- 0077 - el envoltorio publico, sin el cual la ruta de ingesta no lo alcanza
-- ---------------------------------------------------------------------------
-- `app` no lo expone PostgREST (406/PGRST106), asi que la ruta de ingesta no
-- podia preguntar por el colegio del evento y lo sacaba de `profiles.school_id`
-- —NULL para todo alumno desde 0066—. De ahi el 403 que se comio la telemetria
-- entera. Ver la cabecera de 0077.
select has_function('public', 'colegio_del_evento', array[]::text[],
  'la ruta de ingesta alcanza el resolutor de colegio por PostgREST');

-- Sin argumentos A PROPOSITO: uno que aceptase el alumno seria una via para
-- averiguar en que centro esta matriculado un menor cualquiera. Es el mismo
-- invariante que el assert A2 de public_rpc_surface.sql.
select is(
  (select coalesce(array_length(p.proargnames, 1), 0)
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'colegio_del_evento'),
  0,
  'el envoltorio no acepta la identidad del llamante: la toma de auth.uid()');

select is(
  has_function_privilege('anon', 'public.colegio_del_evento()', 'EXECUTE'),
  false,
  'un anonimo no pregunta por el colegio de nadie');

select * from finish();
rollback;
